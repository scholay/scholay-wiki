// ============================================================================
// agentattach — 附件耐久化(0112)的行为回归。
//
// 全部断言的是**可观察行为**(写了什么、顺序如何、失败时留下什么、用户看到什么),
// 不断言源码文本。用 fake Store + fake ObjectStore,不起 MySQL、不起 MinIO、不起 agent。
//
// 这里钉死的每一条都对应一个具体的、修过或差点犯的错:
//   · 双写顺序反了 → 失败时静默退回「有字节没耐久性」,而用户看不出区别;
//   · cwd 配额失败后重试重传 30MB → 用户永远腾不出空间;
//   · MinIO 写失败静默放行 → 「以为存了其实没存」;
//   · 自愈把坏字节写进 cwd → 模型读到损坏数据还照常作答;
//   · 删一行连带删掉别的会话还在用的对象 → 别人的附件无声消失。
// ============================================================================

package agentattach

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentattachstore"
	"scholar-backend/internal/storage"
)

// ─── fakes ───────────────────────────────────────────────────────────────

type fakeStore struct {
	rows    []*agentattachstore.Attachment
	nextID  uint64
	upserts int
	sumErr  error
}

func newFakeStore() *fakeStore { return &fakeStore{nextID: 1} }

func (f *fakeStore) Upsert(a *agentattachstore.Attachment) error {
	f.upserts++
	for _, r := range f.rows { // 模拟 uk_session_uuid
		if r.SessionID == a.SessionID && r.AttachmentUUID == a.AttachmentUUID {
			id := r.ID
			*r = *a
			r.ID = id
			a.ID = id
			return nil
		}
	}
	cp := *a
	cp.ID = f.nextID
	f.nextID++
	f.rows = append(f.rows, &cp)
	a.ID = cp.ID
	return nil
}

func (f *fakeStore) GetByUUID(uuid string, userID uint64) (*agentattachstore.Attachment, error) {
	for _, r := range f.rows {
		if r.AttachmentUUID == uuid && r.UserID == userID {
			cp := *r
			return &cp, nil
		}
	}
	return nil, agentattachstore.ErrNotFound
}

func (f *fakeStore) GetBySessionUUID(sessionID, uuid string, userID uint64) (*agentattachstore.Attachment, error) {
	for _, r := range f.rows {
		if r.SessionID == sessionID && r.AttachmentUUID == uuid && r.UserID == userID {
			cp := *r
			return &cp, nil
		}
	}
	return nil, agentattachstore.ErrNotFound
}

func (f *fakeStore) FindLiveByUserSHA(userID uint64, sha string) (*agentattachstore.Attachment, error) {
	for _, r := range f.rows {
		if r.UserID == userID && r.ContentSHA256 == sha && r.StorageKey != "" && r.DeletedAt == nil {
			cp := *r
			return &cp, nil
		}
	}
	return nil, agentattachstore.ErrNotFound
}

func (f *fakeStore) CountRefs(userID uint64, sha string, excludeID uint64) (int64, error) {
	var n int64
	for _, r := range f.rows {
		if r.UserID == userID && r.ContentSHA256 == sha && r.ID != excludeID && r.DeletedAt == nil {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) SumBytesByUser(userID uint64) (int64, error) {
	if f.sumErr != nil {
		return 0, f.sumErr
	}
	seen := map[string]int64{}
	for _, r := range f.rows {
		if r.UserID == userID && r.DeletedAt == nil && r.ContentSHA256 != "" {
			seen[r.ContentSHA256] = r.SizeBytes
		}
	}
	var total int64
	for _, v := range seen {
		total += v
	}
	return total, nil
}

func (f *fakeStore) ListLiveByUUID(uuid string, userID uint64) ([]agentattachstore.Attachment, error) {
	var out []agentattachstore.Attachment
	for _, r := range f.rows {
		if r.AttachmentUUID == uuid && r.UserID == userID && r.DeletedAt == nil {
			out = append(out, *r)
		}
	}
	return out, nil
}

// ListLiveByUser / LiveStorageKeys —— 「我的文件」列表与孤儿 reaper 的判据。
// ⚠️ 这两个方法此前漏实现,*fakeStore 不满足 Store ⇒ 整个 agentattach 包 vet 失败,
//
//	`go test ./...` 在这里直接断掉(不是某条断言红,是全量测试跑不起来)。
//	与上面 fakeObjects.List 同一类断层:接口加方法,fake 没跟。
func (f *fakeStore) ListLiveByUser(userID uint64, limit int) ([]agentattachstore.Attachment, error) {
	var out []agentattachstore.Attachment
	for _, r := range f.rows {
		if r.UserID != userID || r.DeletedAt != nil {
			continue
		}
		if limit > 0 && len(out) >= limit {
			break
		}
		out = append(out, *r)
	}
	return out, nil
}

func (f *fakeStore) LiveStorageKeys(keys []string) ([]string, error) {
	want := make(map[string]bool, len(keys))
	for _, k := range keys {
		want[k] = true
	}
	var out []string
	seen := map[string]bool{}
	for _, r := range f.rows {
		// 只认未软删的行 —— 软删代表用户已行使删除权,对象该被回收。
		if r.DeletedAt != nil || !want[r.StorageKey] || seen[r.StorageKey] {
			continue
		}
		seen[r.StorageKey] = true
		out = append(out, r.StorageKey)
	}
	return out, nil
}

func (f *fakeStore) MarkMaterialized(id uint64, at *time.Time) error {
	for _, r := range f.rows {
		if r.ID == id {
			r.MaterializedAt = at
		}
	}
	return nil
}

func (f *fakeStore) SoftDelete(id uint64, userID uint64) error {
	now := time.Now()
	for _, r := range f.rows {
		if r.ID == id && r.UserID == userID {
			r.DeletedAt = &now
		}
	}
	return nil
}

func (f *fakeStore) DeleteBySession(sessionID string) ([]agentattachstore.Attachment, error) {
	var removed []agentattachstore.Attachment
	var keep []*agentattachstore.Attachment
	for _, r := range f.rows {
		if r.SessionID == sessionID {
			removed = append(removed, *r)
			continue
		}
		keep = append(keep, r)
	}
	f.rows = keep
	return removed, nil
}

type fakeObjects struct {
	enabled bool
	data    map[string][]byte
	puts    int
	gets    int
	deleted []string
	putErr  error
	// exists/existsErr:去重前的对象存在性复核(见 putAttachmentObject 的红字)。
	exists    int
	existsErr error
	log     *[]string // 与 workspace 推送共用的时序记录
}

func newFakeObjects(log *[]string) *fakeObjects {
	return &fakeObjects{enabled: true, data: map[string][]byte{}, log: log}
}

func (o *fakeObjects) Enabled() bool { return o.enabled }

func (o *fakeObjects) Put(_ context.Context, key, _ string, body []byte) error {
	if o.log != nil {
		*o.log = append(*o.log, "object:"+key)
	}
	if o.putErr != nil {
		return o.putErr
	}
	o.puts++
	o.data[key] = append([]byte(nil), body...)
	return nil
}

func (o *fakeObjects) Get(_ context.Context, key string, _ int64) ([]byte, error) {
	o.gets++
	b, ok := o.data[key]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return append([]byte(nil), b...), nil
}

// Exists —— 上传去重前的存在性复核(HEAD)。existsErr 可注入,用来断言「查不出来时保守放行」。
func (o *fakeObjects) Exists(_ context.Context, key string) (bool, error) {
	o.exists++
	if o.existsErr != nil {
		return false, o.existsErr
	}
	_, ok := o.data[key]
	return ok, nil
}

func (o *fakeObjects) Delete(_ context.Context, key string) error {
	o.deleted = append(o.deleted, key)
	delete(o.data, key)
	return nil
}

// List —— 孤儿 reaper 用。fake 里按前缀线性扫内存 map 即可(数据量是个位数)。
// ⚠️ 这个方法此前漏实现,导致 *fakeObjects 不满足 ObjectStore,整个 agentattach 包
//
//	**编译不过** —— `go test ./...` 在这一包直接 vet 失败,连带把「跑全量测试」这件事堵死。
//	接口加方法时 fake 不跟着加,是本仓库反复出现的一类断层,补上并留档。
func (o *fakeObjects) List(_ context.Context, prefix string, max int) ([]ObjectRef, error) {
	out := make([]ObjectRef, 0, len(o.data))
	for k, v := range o.data {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		if max > 0 && len(out) >= max {
			break
		}
		out = append(out, ObjectRef{Key: k, Size: int64(len(v))})
	}
	return out, nil
}

func (o *fakeObjects) Serve(w http.ResponseWriter, _ *http.Request, key, contentType string) error {
	b, ok := o.data[key]
	if !ok {
		return storage.ErrNotFound
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(http.StatusOK)
	_, err := w.Write(b)
	return err
}

// ─── 上传:MinIO → DB → cwd ────────────────────────────────────────────────

// uploadFixture 造一个只带 pushFn 的 Uploader(不需要 FeatureBridge)。
func uploadFixture(t *testing.T) (*Uploader, *fakeStore, *fakeObjects, *[]string) {
	t.Helper()
	var log []string
	objs := newFakeObjects(&log)
	t.Cleanup(SetObjectStore(objs))
	st := newFakeStore()
	u := (&Uploader{}).WithStore(st)
	u.pushFn = func(_ context.Context, sessionID, relPath string, _ []byte) (string, error) {
		log = append(log, "cwd:"+relPath)
		return "/home/bun/sessions/" + sessionID + "/" + relPath, nil
	}
	return u, st, objs, &log
}

func fileHeader(name string, size int) *multipart.FileHeader {
	return &multipart.FileHeader{Filename: name, Size: int64(size)}
}

func TestUploadWritesDurableStoreBeforeWorkspace(t *testing.T) {
	u, st, objs, log := uploadFixture(t)
	body := []byte("hello-bytes")

	dto, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.png", len(body)), "image", "image/png", body)
	if err != nil {
		t.Fatalf("上传应成功: %v", err)
	}

	if len(*log) != 2 || !strings.HasPrefix((*log)[0], "object:") || !strings.HasPrefix((*log)[1], "cwd:") {
		t.Fatalf("字节必须先落耐久层再落 cwd(失败时字节才是安全的), got %v", *log)
	}
	if objs.puts != 1 {
		t.Fatalf("应恰好写一次对象, got %d", objs.puts)
	}
	if len(st.rows) != 1 {
		t.Fatalf("应落一行元数据, got %d", len(st.rows))
	}
	row := st.rows[0]
	if row.StorageKey != objectKeyFor(7, sha256Hex(body)) {
		t.Fatalf("对象 key 必须内容寻址 + 按 user 分片, got %q", row.StorageKey)
	}
	if row.MaterializedAt == nil {
		t.Fatal("cwd 推送成功后必须标记为已物化,否则下次会做一次无谓的重建")
	}
	// DTO 要带上身份键,前端才能拼统一取回端点。
	if dto.UUID == "" || dto.ID == 0 {
		t.Fatalf("DTO 应带 uuid/id, got %+v", dto)
	}
	if UUIDFromStoredName(row.StoredName) != dto.UUID {
		t.Fatalf("落盘名的 UUID 前缀必须等于附件身份键(存量 journal 靠它反查): %q vs %q",
			row.StoredName, dto.UUID)
	}
}

func TestUploadRetryAfterWorkspaceQuotaDoesNotReupload(t *testing.T) {
	u, st, objs, _ := uploadFixture(t)
	body := []byte("a-big-file")
	u.pushFn = func(context.Context, string, string, []byte) (string, error) {
		return "", agent.ErrSessionQuotaExceeded
	}

	_, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", len(body)), "file", "text/csv", body)
	if err == nil {
		t.Fatal("cwd 配额满必须报错")
	}
	if !strings.Contains(err.Error(), "空间已满") {
		t.Fatalf("应给用户可执行的配额文案, got %q", err.Error())
	}
	// 关键:字节已经安全了 —— 这正是「MinIO 优先」这个顺序买到的东西。
	if objs.puts != 1 || len(st.rows) != 1 {
		t.Fatalf("cwd 失败时字节与元数据都应已落耐久层, puts=%d rows=%d", objs.puts, len(st.rows))
	}

	// 用户删几个文件后重试:命中 sha 去重,不再重传一遍。
	u.pushFn = func(_ context.Context, sessionID, relPath string, _ []byte) (string, error) {
		return "/home/bun/sessions/" + sessionID + "/" + relPath, nil
	}
	if _, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", len(body)), "file", "text/csv", body); err != nil {
		t.Fatalf("重试应成功: %v", err)
	}
	if objs.puts != 1 {
		t.Fatalf("同内容重试不得重新上传字节, puts=%d", objs.puts)
	}
}

// 去重不得建立在「DB 有行 ⇒ 对象一定在」这个假设上。
//
// 行与对象是两个系统,它们会分家(reaper 误删 / 桶被人工动过 / MinIO 回滚到旧快照)。
// 分家之后,取回端点回「文件已失效」、自愈报「请重新上传」—— 而用户照做时若命中去重、
// 跳过 PUT,他重传多少次都修不好:**唯一的自救动作被自己的优化堵死了**。
// 这条钉的就是「按提示做能真的把文件修回来」。
func TestUploadReuploadsWhenDedupTargetObjectIsGone(t *testing.T) {
	u, st, objs, _ := uploadFixture(t)
	body := []byte("the-only-copy")

	if _, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", len(body)), "file", "text/csv", body); err != nil {
		t.Fatalf("首次上传应成功: %v", err)
	}
	key := st.rows[0].StorageKey
	// 模拟对象在桶里没了(行还在)。
	delete(objs.data, key)

	if _, err := u.pushToSession(context.Background(), 7, "sess-2", fileHeader("a.csv", len(body)), "file", "text/csv", body); err != nil {
		t.Fatalf("重新上传应成功: %v", err)
	}
	if _, ok := objs.data[key]; !ok {
		t.Fatal("对象没被重新写回 —— 用户按「请重新上传」的提示做了,文件却依然取不回来")
	}
	if objs.puts != 2 {
		t.Fatalf("对象不在时必须真的 PUT 一次, puts=%d", objs.puts)
	}
}

// 存在性复核查不出来(MinIO 抖动)时保守认为「在」:退化成改造前的去重行为,
// 而不是每次抖动都白传一遍 30MB。多一次 PUT 是浪费,少一次是数据没了 —— 这里的
// 不确定态偏向「不重传」,因为真丢的那条路已经由上一条用例覆盖(HEAD 明确回不存在)。
func TestUploadDedupStaysWhenExistenceCheckFails(t *testing.T) {
	u, st, objs, _ := uploadFixture(t)
	body := []byte("the-only-copy")
	if _, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", len(body)), "file", "text/csv", body); err != nil {
		t.Fatalf("首次上传应成功: %v", err)
	}
	objs.existsErr = errors.New("minio flaky")

	if _, err := u.pushToSession(context.Background(), 7, "sess-2", fileHeader("a.csv", len(body)), "file", "text/csv", body); err != nil {
		t.Fatalf("第二次上传不该因为复核失败而失败: %v", err)
	}
	if objs.puts != 1 {
		t.Fatalf("复核失败时应沿用去重(不重传), puts=%d", objs.puts)
	}
	if len(st.rows) != 2 {
		t.Fatalf("两个会话应各有一行, rows=%d", len(st.rows))
	}
}

func TestUploadFailsClosedWhenObjectStoreErrors(t *testing.T) {
	u, st, objs, log := uploadFixture(t)
	objs.putErr = errors.New("minio down")

	_, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.png", 3), "image", "image/png", []byte("abc"))
	if err == nil {
		t.Fatal("耐久层写失败必须 fail-closed —— 静默降级会造成「以为存了其实没存」")
	}
	if len(st.rows) != 0 {
		t.Fatal("耐久层失败时不该留下元数据行")
	}
	for _, e := range *log {
		if strings.HasPrefix(e, "cwd:") {
			t.Fatal("耐久层失败后不得继续往 cwd 写(那正是要消灭的静默降级)")
		}
	}
	if !strings.Contains(err.Error(), "请稍后重试") || strings.Contains(err.Error(), "minio") {
		t.Fatalf("用户文案不得泄漏上游细节: %q", err.Error())
	}
}

func TestUploadDegradesWhenObjectStoreDisabled(t *testing.T) {
	u, st, objs, log := uploadFixture(t)
	objs.enabled = false // dev 常态:本机没起 MinIO

	dto, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.png", 3), "image", "image/png", []byte("abc"))
	if err != nil {
		t.Fatalf("未配 MinIO 时应降级放行(本机开发不该被迫起对象存储): %v", err)
	}
	if len(st.rows) != 0 || objs.puts != 0 {
		t.Fatal("降级路径不该写任何耐久层")
	}
	if len(*log) != 1 || !strings.HasPrefix((*log)[0], "cwd:") {
		t.Fatalf("降级路径只写 cwd, got %v", *log)
	}
	if dto.ID != 0 {
		t.Fatal("降级路径没有行 id,前端据此回落老的取图代理")
	}
}

func TestUploadRejectsOverUserQuotaBeforeWritingBytes(t *testing.T) {
	u, st, objs, log := uploadFixture(t)
	st.rows = append(st.rows, &agentattachstore.Attachment{
		ID: 99, UserID: 7, ContentSHA256: "old", StorageKey: "att/7/old",
		SizeBytes: maxUserAttachmentBytes,
	})
	st.nextID = 100

	_, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", 10), "file", "text/csv", []byte("0123456789"))
	if err == nil {
		t.Fatal("超出 per-user 耐久额度必须拒绝")
	}
	if objs.puts != 0 || len(*log) != 0 {
		t.Fatal("额度校验必须在写任何字节之前(否则恶意刷量能拿到耐久存储)")
	}
}

// ─── 自愈:cwd 副本被 GC 清掉之后 ─────────────────────────────────────────

// healFixture 造一个带 store + 对象的 Relocator,并预置一行「本会话的附件」。
func healFixture(t *testing.T) (*Relocator, *stubExec, *fakeStore, *fakeObjects, *agentattachstore.Attachment) {
	t.Helper()
	r, ex := newFixture(nil)
	st := newFakeStore()
	objs := newFakeObjects(nil)
	t.Cleanup(SetObjectStore(objs))
	r.WithStore(st)

	body := []byte("csv-bytes")
	key := objectKeyFor(7, sha256Hex(body))
	objs.data[key] = body
	row := &agentattachstore.Attachment{
		AttachmentUUID: "11111111-2222-3333-4444-555555555555",
		UserID:         7,
		SessionID:      testSelf,
		StoredName:     "11111111-2222-3333-4444-555555555555-data.csv",
		RelPath:        "11111111-2222-3333-4444-555555555555-data.csv",
		Filename:       "data.csv",
		AttType:        "file",
		Mime:           "text/csv",
		SizeBytes:      int64(len(body)),
		ContentSHA256:  sha256Hex(body),
		StorageKey:     key,
	}
	if err := st.Upsert(row); err != nil {
		t.Fatal(err)
	}
	return r, ex, st, objs, row
}

func TestEnsureLocalRebuildsMissingCwdCopyFromObjectStore(t *testing.T) {
	r, ex, st, objs, row := healFixture(t)
	// 模拟 30 天 workdir GC:cwd 里已经没有这个文件了(stubExec 的 testSelf 是空目录)。
	p := testSelfDir + "/" + row.StoredName

	out, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{p})
	if err != nil {
		t.Fatalf("自愈应成功: %v", err)
	}
	if out[0] != p {
		t.Fatalf("自愈不改写路径(文件本就该在这): %q", out[0])
	}
	if string(ex.files[testSelf][row.RelPath]) != "csv-bytes" {
		t.Fatal("字节应从对象存储重建回会话 cwd(否则模型仍然打不开)")
	}
	if objs.gets != 1 {
		t.Fatalf("应恰好从对象存储读一次, got %d", objs.gets)
	}
	if st.rows[0].MaterializedAt == nil {
		t.Fatal("重建后必须标记已物化")
	}
}

func TestEnsureLocalSkipsRebuildWhenCwdCopyIntact(t *testing.T) {
	r, ex, _, objs, row := healFixture(t)
	ex.files[testSelf][row.RelPath] = []byte("csv-bytes") // 常态:文件还在

	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{testSelfDir + "/" + row.StoredName}); err != nil {
		t.Fatalf("常态不该报错: %v", err)
	}
	if objs.gets != 0 || ex.putCalls != 0 {
		t.Fatalf("文件还在时不得回源、不得重写, gets=%d puts=%d", objs.gets, ex.putCalls)
	}
}

// 自愈只补「文件没了」,不补「文件被改了」。
//
// 附件落在会话 cwd 里,模型就地改它是正常用法(stat_lab 清洗数据、prism 改 .bib)。
// 若把「大小对不上」也当成待修复,用户下一条引用该附件的消息就会把模型上一轮的工作
// 静默覆盖回原始版本 —— 一条无声的数据破坏路径。
func TestEnsureLocalDoesNotOverwriteLocallyModifiedCopy(t *testing.T) {
	r, ex, _, objs, row := healFixture(t)
	modified := []byte("csv-bytes,cleaned,by,the,model")
	ex.files[testSelf][row.RelPath] = modified

	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir,
		[]string{testSelfDir + "/" + row.StoredName}); err != nil {
		t.Fatalf("不该报错: %v", err)
	}
	if string(ex.files[testSelf][row.RelPath]) != string(modified) {
		t.Fatal("cwd 里已存在的文件不得被原始版本覆盖(模型就地修改会被静默丢弃)")
	}
	if objs.gets != 0 {
		t.Fatalf("文件在就不该回源, gets=%d", objs.gets)
	}
}

func TestEnsureLocalLeavesLegacyAttachmentsUntouched(t *testing.T) {
	r, ex, _, objs, _ := healFixture(t)
	// 存量附件:路径带 UUID 前缀但 DB 里没有行(0112 之前上传的)。
	legacy := testSelfDir + "/99999999-8888-7777-6666-555555555555-old.pdf"

	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{legacy}); err != nil {
		t.Fatalf("存量附件应原样放行: %v", err)
	}
	if objs.gets != 0 || ex.listCalls != 0 {
		t.Fatalf("查不到行就必须零开销回落老逻辑, gets=%d list=%d", objs.gets, ex.listCalls)
	}
}

func TestEnsureLocalRefusesCorruptedObject(t *testing.T) {
	r, ex, _, objs, row := healFixture(t)
	objs.data[row.StorageKey] = []byte("tampered") // 内容与 sha 不符

	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{testSelfDir + "/" + row.StoredName})
	if err == nil {
		t.Fatal("校验不过必须报错,而不是把坏文件写进 cwd 让模型照常作答")
	}
	if _, wrote := ex.files[testSelf][row.RelPath]; wrote {
		t.Fatal("校验失败后不得写入 cwd")
	}
	assertUserFacing(t, err, "重新上传")
}

// ─── 跨会话复用:源会话已被清理时仍然可用 ──────────────────────────────────

func TestEnsureLocalRelocatesFromObjectWhenSourceSessionGone(t *testing.T) {
	r, ex := newFixture(nil)
	st := newFakeStore()
	objs := newFakeObjects(nil)
	t.Cleanup(SetObjectStore(objs))
	r.WithStore(st)

	body := []byte("docx-bytes")
	key := objectKeyFor(7, sha256Hex(body))
	objs.data[key] = body
	stored := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-中文文献.docx"
	_ = st.Upsert(&agentattachstore.Attachment{
		AttachmentUUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		UserID:         7, SessionID: "sess-GONE",
		StoredName: stored, RelPath: "uploads/" + stored, Filename: "中文文献.docx",
		AttType: "file", SizeBytes: int64(len(body)),
		ContentSHA256: sha256Hex(body), StorageKey: key,
	})

	// 源会话在 agent 侧已经不存在(stubExec.files 里没有 sess-GONE)——
	// 改造前这条路必然回「所在的历史对话已被清理,请重新上传」。
	src := testWorkRoot + "/sess-GONE/uploads/" + stored
	out, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err != nil {
		t.Fatalf("源会话被清理后仍应能复用附件: %v", err)
	}
	want := testSelfDir + "/uploads/" + stored
	if out[0] != want {
		t.Fatalf("路径应改写到本会话 cwd: got %q want %q", out[0], want)
	}
	if string(ex.files[testSelf]["uploads/"+stored]) != "docx-bytes" {
		t.Fatal("字节应从对象存储物化进本会话")
	}
	if kind, _, _ := classifyAttachmentPath(out[0], testSelf, testSelfDir); kind != attachLocal {
		t.Fatal("改写后的路径必须过得了权限层的同构判据")
	}
	// 目标会话要有自己的一行(per-session 的 materialized 状态 / 删会话级联都靠它)。
	got, err := st.GetBySessionUUID(testSelf, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 7)
	if err != nil {
		t.Fatalf("目标会话应登记一行: %v", err)
	}
	if got.OriginID == 0 {
		t.Fatal("物化副本应指回源行")
	}
}

func TestEnsureLocalDoesNotServeOtherUsersAttachment(t *testing.T) {
	r, ex := newFixture(nil)
	st := newFakeStore()
	objs := newFakeObjects(nil)
	t.Cleanup(SetObjectStore(objs))
	r.WithStore(st)

	stored := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-secret.docx"
	body := []byte("someone-elses-phi")
	key := objectKeyFor(42, sha256Hex(body))
	objs.data[key] = body
	_ = st.Upsert(&agentattachstore.Attachment{
		AttachmentUUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		UserID:         42, // 别人的
		SessionID:      "sess-OTHER", StoredName: stored, RelPath: "uploads/" + stored,
		SizeBytes: int64(len(body)), ContentSHA256: sha256Hex(body), StorageKey: key,
	})

	// user 7 伪造一个指向别人会话的路径。
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir,
		[]string{testWorkRoot + "/sess-OTHER/uploads/" + stored})
	if err == nil {
		t.Fatal("跨租户引用必须被拒")
	}
	if objs.gets != 0 {
		t.Fatal("归属不通过时一个字节都不该读")
	}
	if _, wrote := ex.files[testSelf]["uploads/"+stored]; wrote {
		t.Fatal("别人的字节绝不能落进本会话 cwd")
	}
}

// ─── 删会话级联 + 引用计数 ────────────────────────────────────────────────

func TestSessionCleanerKeepsObjectStillReferencedElsewhere(t *testing.T) {
	st := newFakeStore()
	objs := newFakeObjects(nil)
	t.Cleanup(SetObjectStore(objs))

	body := []byte("shared")
	key := objectKeyFor(7, sha256Hex(body))
	objs.data[key] = body
	base := agentattachstore.Attachment{
		AttachmentUUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", UserID: 7,
		StoredName: "x", RelPath: "x", SizeBytes: int64(len(body)),
		ContentSHA256: sha256Hex(body), StorageKey: key,
	}
	a, b := base, base
	a.SessionID = "sess-A"
	b.SessionID = "sess-B"
	_ = st.Upsert(&a)
	_ = st.Upsert(&b)

	clean := NewSessionCleaner(st)
	clean(context.Background(), "sess-A")
	if len(objs.deleted) != 0 {
		t.Fatal("还有别的会话引用同一份字节时,对象必须留下(内容寻址的直接后果)")
	}
	if len(st.rows) != 1 || st.rows[0].SessionID != "sess-B" {
		t.Fatalf("只应删掉被删会话那一行, got %+v", st.rows)
	}

	clean(context.Background(), "sess-B")
	if len(objs.deleted) != 1 || objs.deleted[0] != key {
		t.Fatalf("最后一个引用消失后才删对象, got %v", objs.deleted)
	}
}

// ─── 取回端点 ────────────────────────────────────────────────────────────

func serveCtx(t *testing.T, method, uuid, query string) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/api/v1/user/attachment/"+uuid+query, nil)
	c.Params = gin.Params{{Key: "uuid", Value: uuid}}
	c.Set("user_id", uint(7))
	return w, c
}

func serveFixture(t *testing.T) (*ServeHandler, *fakeStore, *fakeObjects) {
	t.Helper()
	st := newFakeStore()
	objs := newFakeObjects(nil)
	t.Cleanup(SetObjectStore(objs))
	return NewServeHandler(st), st, objs
}

func seedServable(st *fakeStore, objs *fakeObjects, attType, mime, filename string) *agentattachstore.Attachment {
	body := []byte("payload")
	key := objectKeyFor(7, sha256Hex(body))
	objs.data[key] = body
	row := &agentattachstore.Attachment{
		AttachmentUUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", UserID: 7,
		SessionID: "sess-1", StoredName: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-" + filename,
		RelPath: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-" + filename, Filename: filename,
		AttType: attType, Mime: mime, SizeBytes: int64(len(body)),
		ContentSHA256: sha256Hex(body), StorageKey: key,
	}
	_ = st.Upsert(row)
	return row
}

func TestDownloadInlinesRasterImageAndAttachesEverythingElse(t *testing.T) {
	h, st, objs := serveFixture(t)
	img := seedServable(st, objs, "image", "image/png", "shot.png")

	w, c := serveCtx(t, http.MethodGet, img.AttachmentUUID, "")
	h.Download(c)
	if w.Code != http.StatusOK {
		t.Fatalf("图片应能取回(这条修的正是 stat_lab 裂图), got %d body=%s", w.Code, w.Body.String())
	}
	if w.Header().Get("Content-Disposition") != "" {
		t.Fatal("光栅图应内联,否则历史里的缩略图显示不出来")
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("必须带 nosniff")
	}

	// 非图片:PDF 此前完全取不回来(取图代理硬性要求 previewType==image)。
	st.rows = nil
	pdf := seedServable(st, objs, "file", "application/pdf", "论文.pdf")
	w2, c2 := serveCtx(t, http.MethodGet, pdf.AttachmentUUID, "")
	h.Download(c2)
	if w2.Code != http.StatusOK {
		t.Fatalf("非图片附件也应能取回, got %d", w2.Code)
	}
	if !strings.Contains(w2.Header().Get("Content-Disposition"), "attachment") {
		t.Fatal("非光栅图必须走下载,防同源内联执行")
	}
}

func TestDownloadUnknownUUIDIs404AndDeletedIs410(t *testing.T) {
	h, st, objs := serveFixture(t)

	// 存量附件 / 别人的附件:一律 404(防枚举),前端据此回落老的取图代理。
	w, c := serveCtx(t, http.MethodGet, "99999999-8888-7777-6666-555555555555", "")
	h.Download(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("查不到应回 404, got %d", w.Code)
	}

	row := seedServable(st, objs, "file", "application/pdf", "x.pdf")
	now := time.Now()
	st.rows[0].DeletedAt = &now
	w2, c2 := serveCtx(t, http.MethodGet, row.AttachmentUUID, "")
	h.Download(c2)
	if w2.Code != http.StatusGone {
		t.Fatalf("已删除应回 410(能说清原因,而不是无解释的裂图), got %d", w2.Code)
	}
}

// 存量附件(0112 之前上传的)必须原封不动地回到老取图代理。
//
// 这条钉的是一个**差点上线的整站回归**:落盘名 <uuid>-<原名> 的格式一直如此,存量附件
// 同样剥得出 UUID,前端在客户端分辨不出「这个 uuid 后端有没有行」。若查不到就直接 404,
// 所有历史会话里的缩略图会集体裂开(改造前它们是好的)。唯一知道答案的是后端,
// 所以调用方把老代理 URL 放进 ?fb=,由这里交还。
func TestDownloadFallsBackToLegacyProxyForPreExistingAttachments(t *testing.T) {
	h, _, _ := serveFixture(t)
	legacy := "/api/v1/user/claw/session/file?session_id=s1&path=x.png"

	w, c := serveCtx(t, http.MethodGet, "99999999-8888-7777-6666-555555555555",
		"?fb="+url.QueryEscape(legacy))
	h.Download(c)

	if w.Code != http.StatusFound {
		t.Fatalf("查不到行必须 302 交还老代理(否则存量历史全线裂图), got %d", w.Code)
	}
	if got := w.Header().Get("Location"); got != legacy {
		t.Fatalf("回落目标应原样透传, got %q", got)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("302 不许被缓存 —— 附件补录之后同一 URL 应改为直接命中耐久层")
	}
}

// 回落是一条 attacker-controlled 的跳转参数,形状必须收死:只认本站已鉴权前缀下的
// 老取图代理。任何一条放宽都会把它变成开放重定向或 302 自循环。
func TestDownloadRejectsUnsafeLegacyFallbackTargets(t *testing.T) {
	h, _, _ := serveFixture(t)
	for name, fb := range map[string]string{
		"外站绝对 URL":   "https://evil.example.com/x",
		"协议相对":       "//evil.example.com/x",
		"站内非鉴权前缀":    "/api/v1/public/session/file?x=1",
		"非取图代理形状":    "/api/v1/user/messages",
		"指回本端点(自循环)": "/api/v1/user/attachment/aaaa/session/file",
		"CRLF 注入":    "/api/v1/user/claw/session/file?x=1\r\nSet-Cookie: a=b",
	} {
		w, c := serveCtx(t, http.MethodGet, "99999999-8888-7777-6666-555555555555",
			"?fb="+url.QueryEscape(fb))
		h.Download(c)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s 不得被当作回落目标(got %d, Location=%q)", name, w.Code, w.Header().Get("Location"))
		}
	}
}

// DELETE 永远不回落:302 会让浏览器把 DELETE 重发成 GET,用户以为删掉了、其实只取了一次图。
func TestDeleteNeverRedirectsToLegacyProxy(t *testing.T) {
	h, _, _ := serveFixture(t)
	legacy := "/api/v1/user/claw/session/file?session_id=s1&path=x.png"

	w, c := serveCtx(t, http.MethodDelete, "99999999-8888-7777-6666-555555555555",
		"?fb="+url.QueryEscape(legacy))
	h.Delete(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("删除查不到的附件应诚实回 404, got %d", w.Code)
	}
}

func TestDeleteSessionScopeKeepsBytesRecoverable(t *testing.T) {
	h, st, objs := serveFixture(t)
	row := seedServable(st, objs, "file", "text/csv", "data.csv")
	now := time.Now()
	st.rows[0].MaterializedAt = &now

	var dropped []string
	h.WithExecutorResolver(func(string) agent.Executor {
		return &deleteRecordingExec{dropped: &dropped}
	})

	w, c := serveCtx(t, http.MethodDelete, row.AttachmentUUID, "")
	h.Delete(c)
	if w.Code != http.StatusOK {
		t.Fatalf("删除应成功, got %d body=%s", w.Code, w.Body.String())
	}
	if len(dropped) != 1 || dropped[0] != row.RelPath {
		t.Fatalf("scope=session 应删掉 cwd 工作副本(这是腾会话配额的动作), got %v", dropped)
	}
	if len(objs.deleted) != 0 || st.rows[0].DeletedAt != nil {
		t.Fatal("scope=session 不得动耐久层 —— 字节要随时能自愈回来")
	}
	if st.rows[0].MaterializedAt != nil {
		t.Fatal("cwd 副本没了就必须把 materialized_at 归 NULL,否则下次不会重建")
	}
}

func TestDeletePermanentScopeRemovesBytes(t *testing.T) {
	h, st, objs := serveFixture(t)
	row := seedServable(st, objs, "file", "text/csv", "data.csv")
	h.WithExecutorResolver(func(string) agent.Executor { return nil })

	w, c := serveCtx(t, http.MethodDelete, row.AttachmentUUID, "?scope=permanent")
	h.Delete(c)
	if w.Code != http.StatusOK {
		t.Fatalf("永久删除应成功, got %d", w.Code)
	}
	if st.rows[0].DeletedAt == nil {
		t.Fatal("永久删除应软删行(留住「已被删除」这个事实,取回端点才能回 410)")
	}
	if len(objs.deleted) != 1 {
		t.Fatalf("无人引用后应删对象, got %v", objs.deleted)
	}

	w2, c2 := serveCtx(t, http.MethodGet, row.AttachmentUUID, "")
	h.Download(c2)
	if w2.Code != http.StatusGone {
		t.Fatalf("删除后取回应回 410, got %d", w2.Code)
	}
}

type deleteRecordingExec struct {
	agent.Executor
	dropped *[]string
}

func (e *deleteRecordingExec) DeleteWorkspaceFile(_ context.Context, _, relPath string) error {
	*e.dropped = append(*e.dropped, relPath)
	return nil
}

// ─── 身份键 ──────────────────────────────────────────────────────────────

func TestUUIDFromStoredName(t *testing.T) {
	const u = "3f6b1c2a-9d4e-4a1b-8c7d-0e1f2a3b4c5d"
	cases := map[string]string{
		u + "-中文文献.docx":                                u,
		"/home/bun/sessions/s1/" + u + "-a.png":         u,
		"/home/bun/sessions/s1/uploads/" + u + "-a.png": u,
		"plain.docx":                  "",
		"not-a-uuid-file.png":         "",
		strings.ToUpper(u) + "-A.PNG": u, // 大小写归一,免得同一附件查不到行
	}
	for in, want := range cases {
		if got := UUIDFromStoredName(in); got != want {
			t.Fatalf("UUIDFromStoredName(%q) = %q; want %q", in, got, want)
		}
	}
}

// ============================================================================
// agentattach — 孤儿对象 reaper 的行为回归。
//
// 这个任务会**删用户上传的原始数据**,而生产没有备份。所以这里钉的每一条都不是
// 「功能是否实现」,而是「误删是否被结构性地挡住」:
//   · 还有 live 行指着的对象 → 一个都不能碰;
//   · DB 反查失败 → 整批放过(拿不到答案 ≠ 没有引用);
//   · 太新的对象 → 放过(「PUT 完了行还没落」是**正常**中间态,不是孤儿);
//   · 默认 dry-run → 不打开开关就一个字节都不删。
// 反过来,真孤儿(没有任何 live 行、且够老)必须真的被回收,否则这个任务等于没写。
// ============================================================================

package agentattach

import (
	"context"
	"errors"
	"testing"
	"time"

	"scholar-backend/internal/agentattachstore"
)

// ─── fakes(在 durability_test.go 的 fake 之上补两件 reaper 特有的能力)────────
//
// ① 对象的 LastModified 可控 —— 「安全窗口」这条防线不给时间就断言不了;
// ② LiveStorageKeys 可注入错误 —— 「DB 反查失败整批放过」这条防线同理。

type reapObjects struct {
	*fakeObjects
	mtimes  map[string]time.Time // 缺省零值 = 极老 = 过了安全窗口
	listErr error
}

func newReapObjects() *reapObjects {
	return &reapObjects{fakeObjects: newFakeObjects(nil), mtimes: map[string]time.Time{}}
}

func (o *reapObjects) List(ctx context.Context, prefix string, max int) ([]ObjectRef, error) {
	if o.listErr != nil {
		return nil, o.listErr
	}
	refs, err := o.fakeObjects.List(ctx, prefix, max)
	if err != nil {
		return nil, err
	}
	for i := range refs {
		refs[i].LastModified = o.mtimes[refs[i].Key]
	}
	return refs, nil
}

type reapStore struct {
	*fakeStore
	liveErr error
	calls   int
}

func (s *reapStore) LiveStorageKeys(keys []string) ([]string, error) {
	s.calls++
	if s.liveErr != nil {
		return nil, s.liveErr
	}
	return s.fakeStore.LiveStorageKeys(keys)
}

// reapFixture 造一个含四类对象的桶:
//
//	live      —— 有未软删的行指着(绝不能删)
//	softdel   —— 只有软删行指着(用户已行使删除权 ⇒ 该回收)
//	orphan    —— 桶里有、DB 里一行都没有(PUT 成功 Upsert 失败留下的那种 ⇒ 该回收)
//	fresh     —— 同样无行,但刚落盘(可能正处在「行还没写」的正常中间态 ⇒ 放过)
func reapFixture(t *testing.T) (*reapStore, *reapObjects) {
	t.Helper()
	objs := newReapObjects()
	t.Cleanup(SetObjectStore(objs))
	st := &reapStore{fakeStore: newFakeStore()}

	seed := func(key string, body []byte) { objs.data[key] = body }
	seed("att/7/live", []byte("live-bytes"))
	seed("att/7/softdel", []byte("softdel-bytes"))
	seed("att/7/orphan", []byte("orphan-bytes"))
	seed("att/7/fresh", []byte("fresh-bytes"))
	objs.mtimes["att/7/fresh"] = time.Now() // 刚上传

	liveRow := agentAttachRow("aaaaaaaa-0000-0000-0000-000000000001", "att/7/live", "live")
	_ = st.Upsert(&liveRow)
	softRow := agentAttachRow("aaaaaaaa-0000-0000-0000-000000000002", "att/7/softdel", "softdel")
	_ = st.Upsert(&softRow)
	now := time.Now()
	st.rows[1].DeletedAt = &now
	return st, objs
}

func TestReaperDeletesOnlyUnreferencedAgedObjects(t *testing.T) {
	st, objs := reapFixture(t)

	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true})
	if err != nil {
		t.Fatalf("reaper 不该报错: %v", err)
	}

	if _, ok := objs.data["att/7/live"]; !ok {
		t.Fatal("还有未软删行指着的对象被删了 —— 这是用户数据无声消失")
	}
	if _, ok := objs.data["att/7/fresh"]; !ok {
		t.Fatal("安全窗口内的新对象被删了 —— 它可能正处在「PUT 完了行还没落」的正常中间态")
	}
	if _, ok := objs.data["att/7/orphan"]; ok {
		t.Fatal("真孤儿没被回收 —— 那这个任务等于没写")
	}
	if _, ok := objs.data["att/7/softdel"]; ok {
		t.Fatal("只被软删行引用的对象没被回收 —— 用户点过永久删除,字节却还在")
	}
	if stats.Orphans != 2 || stats.Deleted != 2 {
		t.Fatalf("应发现并回收 2 个孤儿, got orphans=%d deleted=%d", stats.Orphans, stats.Deleted)
	}
	if stats.SkippedRecent != 1 {
		t.Fatalf("应跳过 1 个太新的对象, got %d", stats.SkippedRecent)
	}
	if stats.FreedBytes != int64(len("orphan-bytes")+len("softdel-bytes")) {
		t.Fatalf("腾出的字节数应可核对, got %d", stats.FreedBytes)
	}
}

// 默认 dry-run:开关没打开时**一个字节都不许删**,但要如实报告「本来会删多少」。
func TestReaperDryRunReportsWithoutDeleting(t *testing.T) {
	st, objs := reapFixture(t)

	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{}) // 零值 = dry-run(字段叫 Delete 就是为了让零值安全)
	if err != nil {
		t.Fatalf("reaper 不该报错: %v", err)
	}
	if stats.Deleted != 0 || len(objs.deleted) != 0 {
		t.Fatalf("dry-run 必须一个都不删, deleted=%d %v", stats.Deleted, objs.deleted)
	}
	if stats.Orphans != 2 {
		t.Fatalf("dry-run 仍须如实报告发现数(否则运维无从判断能不能开真删), got %d", stats.Orphans)
	}
	if !stats.DryRun {
		t.Fatal("统计里必须能看出这轮是 dry-run")
	}
	if _, ok := objs.data["att/7/orphan"]; !ok {
		t.Fatal("dry-run 下对象必须原封不动")
	}
}

// DB 反查失败 → 整批放过。这条是「宁可漏收不可误删」的核心:
// 拿不到答案时,把整批当成孤儿删掉是灾难性的(一次 DB 抖动 = 全体用户附件蒸发)。
func TestReaperDeletesNothingWhenLookupFails(t *testing.T) {
	st, objs := reapFixture(t)
	st.liveErr = errors.New("db down")

	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true})
	if err != nil {
		t.Fatalf("单批失败不该让整轮报错(下一轮会重试): %v", err)
	}
	if len(objs.deleted) != 0 {
		t.Fatalf("DB 反查失败时一个都不能删, got %v", objs.deleted)
	}
	if stats.SkippedUnknown != 3 {
		t.Fatalf("被放过的对象数应可观测(否则「本轮没扫全」是隐形的), got %d", stats.SkippedUnknown)
	}
	if stats.Orphans != 0 {
		t.Fatalf("查不到引用关系时不得判定任何孤儿, got %d", stats.Orphans)
	}
}

// 列举失败(MinIO 抖动)绝不能被当成「桶是空的」。
func TestReaperAbortsWhenListingFails(t *testing.T) {
	st, objs := reapFixture(t)
	objs.listErr = errors.New("minio down")

	if _, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true}); err == nil {
		t.Fatal("列举失败必须上报,否则这一轮会静默地什么都不做")
	}
	if len(objs.deleted) != 0 {
		t.Fatalf("列举失败时不得删任何东西, got %v", objs.deleted)
	}
}

// MinIO 未启用(dev 常态)/ store 未装配:安静跳过,不报错也不删。
func TestReaperSkipsWhenNotWired(t *testing.T) {
	st, objs := reapFixture(t)
	objs.enabled = false

	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true})
	if err != nil {
		t.Fatalf("未启用不是错误: %v", err)
	}
	if stats.Scanned != 0 || len(objs.deleted) != 0 {
		t.Fatal("未启用时不该扫也不该删")
	}
	if st.calls != 0 {
		t.Fatal("未启用时不该打 DB")
	}
}

// 分批:批大小小于对象数时,判据必须逐批生效(而不是只对第一批生效)。
func TestReaperHonoursBatchingAcrossAllObjects(t *testing.T) {
	st, _ := reapFixture(t)

	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true, BatchSize: 1})
	if err != nil {
		t.Fatalf("reaper 不该报错: %v", err)
	}
	if stats.Deleted != 2 {
		t.Fatalf("分批不该改变结果, got %d", stats.Deleted)
	}
	if st.calls < 3 {
		t.Fatalf("BatchSize=1 时应逐个反查(3 个够老的对象), got %d 次", st.calls)
	}
}

// 列举撞 MaxObjects 上限时,统计里必须能看出「本轮没看全」。
//
// 为什么这条值得钉:ListObjectInfos **没有游标** —— 数满就 break,下一轮仍从字典序头部
// 重新列举。所以撞上限不是「延后处理」,是靠后的对象**永远**不被检查。若这件事只体现在
// 「orphans 比预期少」上,运维看到的是一个每天绿灯、报告 0 孤儿的任务,而桶在无声地涨。
func TestReaperReportsTruncationWhenListingHitsCap(t *testing.T) {
	st, objs := reapFixture(t)

	// MaxObjects=2:fixture 有 4 个对象,只会看到字典序最前的两个。
	stats, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true, MaxObjects: 2})
	if err != nil {
		t.Fatalf("截断不是错误(是要被看见的降级): %v", err)
	}
	if !stats.Truncated {
		t.Fatal("撞上限却没报截断 —— 「只扫了一半」在日志里就是隐形的")
	}
	if stats.Scanned != 2 {
		t.Fatalf("撞上限时 Scanned 应等于上限, got %d", stats.Scanned)
	}

	// 没撞上限的那一轮不许误报截断,否则这条告警会变成天天响的噪音而被忽略。
	objs.deleted = nil
	full, err := ReapOrphanObjects(context.Background(), st, ReapOptions{Delete: true, MaxObjects: 100})
	if err != nil {
		t.Fatalf("reaper 不该报错: %v", err)
	}
	if full.Truncated {
		t.Fatal("没撞上限却报了截断 —— 恒真的告警等于没有告警")
	}
}

// agentAttachRow 造一行最小可用的附件记录。
func agentAttachRow(uuid, key, sha string) agentattachstore.Attachment {
	return agentattachstore.Attachment{
		AttachmentUUID: uuid, UserID: 7, SessionID: "sess-1",
		StoredName: uuid + "-a.pdf", RelPath: uuid + "-a.pdf", Filename: "a.pdf",
		AttType: "file", Mime: "application/pdf", SizeBytes: 10,
		ContentSHA256: sha, StorageKey: key,
	}
}

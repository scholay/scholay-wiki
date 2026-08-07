// ============================================================================
// agentattach — per-user 附件额度与「我的附件」列表的行为回归。
//
// 这一组钉的全是「用户撞墙之后有没有路走」:
//   · 同一份字节重复上传不得重复计费(否则快到顶的用户连重试都做不到);
//   · 额度错误必须带专属码(前端据此打开附件管理 —— 没有码就只剩一句做不到的指引);
//   · 列表按内容聚合,各项 size 之和必须等于 used(否则用户删完发现没腾出空间);
//   · 取回端点不得给出「一年不回源」的缓存(那会让永久删除在用户自己的浏览器里失效)。
// ============================================================================

package agentattach

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/errcode"
)

// 同一份内容再传一次,占用不该增加 —— 额度是按 DISTINCT content_sha256 算的。
//
// 这条对应一个会把用户彻底卡死的组合:cwd 满 → 提示他腾空间后重试 → 重试时后端把
// 同一份字节又加了一遍 → 判超额。恰恰是最需要重试的人(快到顶的)必然重试失败。
func TestUploadQuotaDoesNotDoubleCountSameContent(t *testing.T) {
	u, st, objs, _ := uploadFixture(t)
	body := make([]byte, 1024)
	for i := range body {
		body[i] = byte(i % 251)
	}

	if _, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("data.csv", len(body)),
		"file", "text/csv", body); err != nil {
		t.Fatalf("首次上传应成功: %v", err)
	}

	// 把这一行撑到「再多一个字节就超」的临界:此时重传同一份内容仍必须放行。
	st.rows[0].SizeBytes = maxUserAttachmentBytes
	if _, err := u.pushToSession(context.Background(), 7, "sess-2", fileHeader("data.csv", len(body)),
		"file", "text/csv", body); err != nil {
		t.Fatalf("同一份内容重传不得被判超额(它一个字节都没多占): %v", err)
	}
	if objs.puts != 1 {
		t.Fatalf("同内容不该重新写对象, puts=%d", objs.puts)
	}
}

// 反面:换一份**不同**内容时额度必须照常拦 —— 上面那条放行不能是「额度整个失效了」。
func TestUploadStillRejectsNewContentOverQuota(t *testing.T) {
	u, st, objs, _ := uploadFixture(t)
	body := []byte("first-file")
	if _, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("a.csv", len(body)),
		"file", "text/csv", body); err != nil {
		t.Fatalf("首次上传应成功: %v", err)
	}
	st.rows[0].SizeBytes = maxUserAttachmentBytes // 已顶格

	other := []byte("a-different-file")
	_, err := u.pushToSession(context.Background(), 7, "sess-1", fileHeader("b.csv", len(other)),
		"file", "text/csv", other)
	if !errors.Is(err, ErrUserAttachmentQuota) {
		t.Fatalf("新内容超额必须被拦(否则额度形同虚设), err=%v", err)
	}
	if objs.puts != 1 {
		t.Fatalf("超额时一个字节都不该写进对象存储, puts=%d", objs.puts)
	}
}

// 额度错误必须能被 handler 翻成 7010 —— 前端靠这个码打开附件管理。
// 只有文案没有码 = 用户又一次拿到一句「请删除」却无处可删。
func TestUploadQuotaErrorRespondsWithActionableCode(t *testing.T) {
	gin.SetMode(gin.TestMode)

	quotaErr := fmt.Errorf("%w (已用 2.0GB / 上限 2.0GB)", ErrUserAttachmentQuota)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/user/claw/upload", nil)
	RespondUploadError(c, errcode.TurnstileFailed, quotaErr)

	var got struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("响应应是 JSON: %v (%s)", err, w.Body.String())
	}
	if got.Code != errcode.AttachmentQuotaExceeded {
		t.Fatalf("附件额度必须回专属码 %d(前端据此弹附件管理), got %d",
			errcode.AttachmentQuotaExceeded, got.Code)
	}
	if !strings.Contains(got.Message, "已用") {
		t.Fatalf("文案要让用户看到用了多少 / 上限多少, got %q", got.Message)
	}

	// 其它上传错误照旧走 fallback 码,不得被误标成额度问题(否则会弹错的弹窗)。
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodPost, "/api/v1/user/claw/upload", nil)
	RespondUploadError(c2, errcode.TurnstileFailed, errors.New("暂不支持 SVG 文件 (安全限制)"))
	_ = json.Unmarshal(w2.Body.Bytes(), &got)
	if got.Code != errcode.TurnstileFailed {
		t.Fatalf("非额度错误应保持原码, got %d", got.Code)
	}
}

// 列表按**内容**聚合:同一份字节被两个会话引用只算一项、一份大小。
// 否则各项之和 > used,用户按列表删完发现空间没腾出来 —— 这个界面就是在骗人。
func TestListGroupsByContentSoSizesMatchUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h, st, _ := serveFixture(t)

	body := []byte("shared-bytes")
	sha := sha256Hex(body)
	key := objectKeyFor(7, sha)
	for i, sess := range []string{"sess-A", "sess-B"} {
		row := agentAttachRow(fmt.Sprintf("aaaaaaaa-0000-0000-0000-00000000000%d", i+1), key, sha)
		row.SessionID = sess
		row.SizeBytes = int64(len(body))
		r := row
		_ = st.Upsert(&r)
	}
	// 另一份内容 + 一条已软删的行(软删的不该出现在列表里,它已经不占额度了)。
	other := agentAttachRow("bbbbbbbb-0000-0000-0000-000000000001", objectKeyFor(7, "othersha"), "othersha")
	other.SizeBytes = 100
	_ = st.Upsert(&other)
	gone := agentAttachRow("cccccccc-0000-0000-0000-000000000001", objectKeyFor(7, "gonesha"), "gonesha")
	_ = st.Upsert(&gone)
	_ = st.SoftDelete(gone.ID, 7)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/user/attachments", nil)
	c.Set("user_id", uint(7))
	h.List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("列表应可用: %d %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data AttachmentListDTO `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("列表应是 JSON: %v (%s)", err, w.Body.String())
	}
	if len(resp.Data.Items) != 2 {
		t.Fatalf("同一份内容的两个会话行必须聚成一项, got %d 项: %+v", len(resp.Data.Items), resp.Data.Items)
	}
	var sum int64
	for _, it := range resp.Data.Items {
		sum += it.Size
		if len(it.UUIDs) == 0 {
			t.Fatal("每一项必须带 uuid,否则前端删不掉它")
		}
	}
	if sum != resp.Data.UsedBytes {
		t.Fatalf("各项之和必须等于已用量(否则删了不腾空间), sum=%d used=%d", sum, resp.Data.UsedBytes)
	}
	if resp.Data.LimitBytes != maxUserAttachmentBytes {
		t.Fatalf("上限须由后端下发,免得前端再写一份常量, got %d", resp.Data.LimitBytes)
	}
	for _, it := range resp.Data.Items {
		for _, u := range it.UUIDs {
			if u == "cccccccc-0000-0000-0000-000000000001" {
				t.Fatal("已软删的附件不该出现在列表里(它已经不占额度了)")
			}
		}
	}
}

// 取回端点不得声明「一年内不回源」:用户点了永久删除、后端也回 410 了,
// 他自己的浏览器却还能显示它一年 —— 删除权在观感上失效。
func TestDownloadCacheHeaderAllowsDeletionToTakeEffect(t *testing.T) {
	h, st, objs := serveFixture(t)
	row := seedServable(st, objs, "image", "image/png", "shot.png")

	w, c := serveCtx(t, http.MethodGet, row.AttachmentUUID, "")
	h.Download(c)

	cc := w.Header().Get("Cache-Control")
	if strings.Contains(cc, "immutable") {
		t.Fatalf("immutable = 一年不回源,永久删除对已缓存的浏览器无效, got %q", cc)
	}
	if !strings.Contains(cc, "no-cache") {
		t.Fatalf("应每次重校验(带 ETag,未变即 304), got %q", cc)
	}
	if !strings.Contains(cc, "private") {
		t.Fatalf("附件是私有数据,不许被共享缓存持有, got %q", cc)
	}
}

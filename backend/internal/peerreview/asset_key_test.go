package peerreview

import (
	"strings"
	"testing"

	"scholar-backend/internal/storage"
)

// TestAssetObjectKeyNotAutoExpired 是「新提交的稿件 24h 后仍在」的可验证判据。
//
// 稿件消失的**唯一**机制是 MinIO ILM 按前缀自动过期(见 asset_key.go 顶部事故说明);
// 业务侧的删除路径都需要用户显式动作。所以只要 key 不落在自动过期前缀下,
// 对象就只会被业务代码删,不会到点自己消失。
//
// 变异验证:把 assetObjectKey 的 assetPrefix 改回 "tmp/" → 本用例失败。
func TestAssetObjectKeyNotAutoExpired(t *testing.T) {
	cases := []struct {
		name     string
		subID    uint64
		filename string
	}{
		{"pdf 正文", 1, "manuscript.pdf"},
		{"docx 正文", 40, "我的稿件 v2.docx"},
		{"无扩展名附件", 999999, "README"},
		{"大写扩展名", 7, "DATA.CSV"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			key := assetObjectKey(c.subID, c.filename)
			if storage.IsTmpILMManaged(key) {
				t.Fatalf("稿件 object_key 落在 MinIO 自动过期区(%q),上传约 25h 后会被静默删除: %q",
					storage.TmpILMPrefix, key)
			}
		})
	}
}

// TestAssetObjectKeyShape 钉死 key 的可解析形状:<prefix><submissionID>/<uuid><ext>。
// submissionID 段是运维排障的落脚点(拿一条 DB 行去桶里找对象),扩展名是下游按类型分派的依据。
func TestAssetObjectKeyShape(t *testing.T) {
	key := assetObjectKey(42, "Paper.PDF")
	if !strings.HasPrefix(key, "submissions/42/") {
		t.Fatalf("key 应带 submissions/<id>/ 段以便按投稿定位,实际 %q", key)
	}
	if !strings.HasSuffix(key, ".pdf") {
		t.Fatalf("key 应保留小写扩展名(下游按扩展名分派解析器),实际 %q", key)
	}
	if key == assetObjectKey(42, "Paper.PDF") {
		t.Fatalf("同一投稿的两次上传必须得到不同 key,否则后传的文件会覆盖先传的: %q", key)
	}
}

// TestPeerReviewBucketNotUnderTmpILM 钉死另一半:桶上那条规则必须被主动摘掉。
// 只改 key 前缀不够 —— lifecycle 是写在桶上的持久配置,不 Remove 就一直 Enabled,
// 下一个往这个桶写 tmp/ 的人会原样再踩一次(而且同样要等 24 小时才发现)。
//
// 变异验证:把 BucketPeerReviewAssets 从 storage.TmpILMRevokedBuckets 挪回 TmpILMBuckets → 本用例失败。
func TestPeerReviewBucketNotUnderTmpILM(t *testing.T) {
	cfg := storage.Config{
		BucketPaperPDFs:           "pdfs",
		BucketFeedbackAttachments: "feedback",
		BucketPeerReviewAssets:    "peer-review",
	}
	for _, b := range storage.TmpILMBuckets(cfg) {
		if b == cfg.BucketPeerReviewAssets {
			t.Fatal("审稿稿件桶不能挂 tmp/ 24h ILM:它的对象一落地就有 DB 行引用,ILM 只会把它们删成死链")
		}
	}
	found := false
	for _, b := range storage.TmpILMRevokedBuckets(cfg) {
		if b == cfg.BucketPeerReviewAssets {
			found = true
		}
	}
	if !found {
		t.Fatal("审稿稿件桶必须在主动摘除名单里,否则历史遗留的 lifecycle 规则会继续留在桶上")
	}
}

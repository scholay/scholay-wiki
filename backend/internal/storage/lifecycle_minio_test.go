package storage

import (
	"context"
	"os"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// 针对**真实 MinIO** 的 lifecycle 装配测试。
//
// 为什么必须打真 MinIO:这里要证明的是「桶上那条会自动删用户稿件的规则真的没有了」。
// lifecycle 是写在**桶**上的服务端状态,不是进程内的变量 —— 只看代码调了 SetBucketLifecycle
// 证明不了它生效(minio-go 把"空配置"翻译成 DELETE 这件事就藏在 SDK 里,写错一个参数
// 就变成"设了一条空规则"而旧规则纹丝不动)。2026-08 的稿件全丢正是"注释说会搬,代码没搬"
// 这类只能靠真环境证伪的问题。
//
// 用**专用的一次性桶**,绝不碰真实业务桶。跑法:
//
//	docker run --rm --network scholar_scholar-network -v <repo>/backend:/src -w /src \
//	  -e STORAGE_TEST_MINIO_ENDPOINT=minio:9000 \
//	  -e STORAGE_TEST_MINIO_ACCESS=scholarminio -e STORAGE_TEST_MINIO_SECRET=scholarminiopass \
//	  golang:1.21-alpine go test ./internal/storage/ -run MinIO -v
const (
	testBucketRevoked = "scholay-ilmtest-revoked"
	testBucketManaged = "scholay-ilmtest-managed"
)

func testMinIOClient(t *testing.T) (*minio.Client, Config) {
	t.Helper()
	ep := os.Getenv("STORAGE_TEST_MINIO_ENDPOINT")
	if ep == "" {
		t.Skip("跳过:未设 STORAGE_TEST_MINIO_ENDPOINT —— 「稿件桶的自动过期规则确实被摘掉」**本次没有被验证**,不是通过")
	}
	c, err := minio.New(ep, &minio.Options{
		Creds: credentials.NewStaticV4(
			os.Getenv("STORAGE_TEST_MINIO_ACCESS"),
			os.Getenv("STORAGE_TEST_MINIO_SECRET"), ""),
	})
	if err != nil {
		t.Fatalf("minio client: %v", err)
	}
	return c, Config{
		Endpoint:               ep,
		AccessKey:              os.Getenv("STORAGE_TEST_MINIO_ACCESS"),
		SecretKey:              os.Getenv("STORAGE_TEST_MINIO_SECRET"),
		BucketPeerReviewAssets: testBucketRevoked,
		BucketPaperPDFs:        testBucketManaged,
	}
}

// TestMinIOInitRevokesPeerReviewTmpLifecycle —— 启动后,稿件桶上不得再有任何 lifecycle 规则,
// 而确实需要它的桶(paper PDFs)必须还有。
//
// 变异验证:把 BucketPeerReviewAssets 从 TmpILMRevokedBuckets 挪回 TmpILMBuckets → 本用例失败
// (规则仍在桶上)。
func TestMinIOInitRevokesPeerReviewTmpLifecycle(t *testing.T) {
	c, cfg := testMinIOClient(t)
	ctx := context.Background()

	// 前置:两个一次性桶都建好,并且**都**先挂上那条历史规则 ——
	// 模拟"线上桶已经带着这条规则"的真实起点。
	for _, b := range []string{testBucketRevoked, testBucketManaged} {
		if err := ensureBucket(ctx, c, b); err != nil {
			t.Fatalf("ensure bucket %s: %v", b, err)
		}
		if err := ensureTmpLifecycle(ctx, c, b); err != nil {
			t.Fatalf("seed lifecycle on %s: %v", b, err)
		}
		b := b
		t.Cleanup(func() {
			_ = removeTmpLifecycle(ctx, c, b)
			_ = c.RemoveBucket(ctx, b)
		})
	}
	if n := ruleCount(t, c, testBucketRevoked); n != 1 {
		t.Fatalf("前置条件不成立:种规则失败,%s 上有 %d 条规则", testBucketRevoked, n)
	}

	if err := Init(cfg); err != nil {
		t.Fatalf("Init: %v", err)
	}

	if n := ruleCount(t, c, testBucketRevoked); n != 0 {
		t.Fatalf("稿件桶上仍有 %d 条 lifecycle 规则 —— 新上传的稿件仍会在 ~25h 后被 MinIO 删掉", n)
	}
	if n := ruleCount(t, c, testBucketManaged); n != 1 {
		t.Fatalf("paper PDF 桶的 tmp/ 规则被误删了(%d 条)—— 没走到 confirm 的上传会永久堆积", n)
	}
}

// ruleCount 返回桶上的 lifecycle 规则条数。桶上没有配置时 MinIO 回 NoSuchLifecycleConfiguration,
// 这里当 0 条处理(那正是"已摘掉"的正常形态)。
func ruleCount(t *testing.T, c *minio.Client, bucket string) int {
	t.Helper()
	lc, err := c.GetBucketLifecycle(context.Background(), bucket)
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchLifecycleConfiguration" {
			return 0
		}
		t.Fatalf("get lifecycle %s: %v", bucket, err)
	}
	if lc == nil {
		return 0
	}
	return len(lc.Rules)
}

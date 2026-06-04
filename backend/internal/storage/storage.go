// ============================================================================
// Scholay 对象存储(MinIO / S3 兼容)
// ----------------------------------------------------------------------------
// 用户上传文件(目前只有论文 PDF)的存储抽象。MySQL 只存元数据
// (object_key / size / sha256 / uploaded_at),文件本体走这里。
//
// 设计要点:
//   - 用 minio-go SDK,API 与 AWS S3 / 阿里云 OSS 一致,未来切云盘零成本
//   - 单例 client(`Init` 在 main bootstrap 调一次,后续 `Client()` 取)
//   - 启动时 `EnsureBucket` 幂等创建 bucket,跟 schema-sync 一个思路
//   - Endpoint 为空时跳过 Init,handler 层用 IsEnabled() 决定是否 503
//
// 不在这里:
//   - 业务层 ACL(谁能下载哪份 PDF)—— 由调用方(library handler)决定
//   - 文件类型校验 —— handler 在 ContentType 上 enforce(目前仅 application/pdf)
// ============================================================================

package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/lifecycle"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// ErrDisabled 调用方在 storage 未初始化时(endpoint 为空)拿到的 sentinel。
// handler 层用这个判 503 的兜底 —— 不要 panic,允许 backend 在无 MinIO 时跑起来。
var ErrDisabled = errors.New("object storage disabled (no MINIO_ENDPOINT)")

// ErrNotFound 对象不存在 —— 用 errors.Is 包装 minio-go 的 NoSuchKey
var ErrNotFound = errors.New("object not found")

type Config struct {
	Endpoint                  string
	AccessKey                 string
	SecretKey                 string
	BucketPaperPDFs           string
	BucketFeedbackAttachments string
	BucketPeerReviewAssets    string
	BucketPrism               string
	BucketFeatureTools        string
	UseSSL                    bool
}

var (
	mu       sync.RWMutex
	client   *minio.Client
	config   Config
	enabled  bool
)

// Init 初始化 storage 单例 —— 在 main bootstrap 里调一次。
// 配置不完整时返回 nil error,但 IsEnabled() 会是 false,所有 PDF 接口走 503 分支。
//
// 启动时会:
//  1) 建 minio client(此时还不会真连 MinIO,只建客户端对象)
//  2) Ping 一下 ListBuckets 确认凭证 / endpoint 可用
//  3) 幂等创建 BucketPaperPDFs(已存在则跳过)
func Init(cfg Config) error {
	if cfg.Endpoint == "" {
		slog.Warn("storage: MINIO_ENDPOINT 未配置,对象存储相关接口将返回 503")
		return nil
	}

	c, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return fmt.Errorf("storage: 新建 MinIO 客户端失败: %w", err)
	}

	// 探活:超时 5s 避免 backend 启动被卡死
	ctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	if _, err := c.ListBuckets(ctx); err != nil {
		return fmt.Errorf("storage: MinIO 连接失败(endpoint=%s): %w", cfg.Endpoint, err)
	}

	// 幂等建 bucket
	if cfg.BucketPaperPDFs != "" {
		if err := ensureBucket(ctx, c, cfg.BucketPaperPDFs); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketPaperPDFs, err)
		}
		// Tier 2 防游离文件 —— 给 PDF bucket 挂"tmp/ 24h 自动过期"规则。
		// MinIO ILM 后台自己扫,前后端零代码参与;用户上传后中途关浏览器 / 断网 /
		// 忘了 confirm 这类高频孤立场景由它兜得稳。失败只 warn:lifecycle 不生效
		// 不阻塞 backend 启动(还有 Tier 1 + Tier 3 兜底)。
		if err := ensureTmpLifecycle(ctx, c, cfg.BucketPaperPDFs); err != nil {
			slog.Warn("storage: 设置 tmp 生命周期规则失败,跳过(Tier 1 仍生效)",
				"bucket", cfg.BucketPaperPDFs, "err", err)
		}
	}
	if cfg.BucketFeedbackAttachments != "" {
		if err := ensureBucket(ctx, c, cfg.BucketFeedbackAttachments); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketFeedbackAttachments, err)
		}
		// 反馈附件 bucket 同样挂 "tmp/ 24h 过期" lifecycle —— 用户填表中途关浏览器,
		// 已上传但未绑定 feedback_id 的对象在 ~25h 内被清,业务侧 cleanup task 兜底其它情况。
		if err := ensureTmpLifecycle(ctx, c, cfg.BucketFeedbackAttachments); err != nil {
			slog.Warn("storage: 设置 feedback tmp 生命周期规则失败",
				"bucket", cfg.BucketFeedbackAttachments, "err", err)
		}
	}
	if cfg.BucketPrism != "" {
		if err := ensureBucket(ctx, c, cfg.BucketPrism); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketPrism, err)
		}
	}

	if cfg.BucketPeerReviewAssets != "" {
		if err := ensureBucket(ctx, c, cfg.BucketPeerReviewAssets); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketPeerReviewAssets, err)
		}
		// 审稿稿件 bucket 也走 tmp/ 24h ILM —— 用户在 wizard 中途关浏览器,
		// 上传后没走到 submit 的文件在 ~25h 内被清。submit 时 service 层把对象
		// 从 tmp/<draftId>/ 移动(实际就是 copy + delete)到 submitted/<id>/。
		if err := ensureTmpLifecycle(ctx, c, cfg.BucketPeerReviewAssets); err != nil {
			slog.Warn("storage: 设置 peer-review tmp 生命周期规则失败",
				"bucket", cfg.BucketPeerReviewAssets, "err", err)
		}
	}

	// 功能广场工具 logo —— 永久资源, 不挂 tmp lifecycle。
	if cfg.BucketFeatureTools != "" {
		if err := ensureBucket(ctx, c, cfg.BucketFeatureTools); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketFeatureTools, err)
		}
	}

	mu.Lock()
	client = c
	config = cfg
	enabled = true
	mu.Unlock()

	slog.Info("storage: MinIO 就绪",
		"endpoint", cfg.Endpoint,
		"bucket_paper_pdfs", cfg.BucketPaperPDFs,
		"bucket_feedback_attachments", cfg.BucketFeedbackAttachments,
		"bucket_peer_review_assets", cfg.BucketPeerReviewAssets,
		"ssl", cfg.UseSSL,
	)
	return nil
}

func ensureBucket(ctx context.Context, c *minio.Client, bucket string) error {
	exists, err := c.BucketExists(ctx, bucket)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return c.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
}

// ensureTmpLifecycle 给 bucket 挂"tmp/ 前缀对象 24h 自动过期"的 lifecycle rule。
//
// 幂等:同 ID 的 rule 反复 Set 不会出问题,MinIO 直接替换。
// 注意:lifecycle 的 Days 单位是天(S3 规范),最小 1 天 —— MinIO ILM scanner
// 通常每小时左右扫一次,过期对象在创建后 ~25h 内被清理。
// 这个时长对"用户上传后忘了 confirm"的场景完全足够。
func ensureTmpLifecycle(ctx context.Context, c *minio.Client, bucket string) error {
	cfg := lifecycle.NewConfiguration()
	cfg.Rules = []lifecycle.Rule{
		{
			ID:     "scholay-tmp-uploads-24h",
			Status: "Enabled",
			RuleFilter: lifecycle.Filter{
				Prefix: "tmp/",
			},
			Expiration: lifecycle.Expiration{
				Days: 1,
			},
		},
	}
	return c.SetBucketLifecycle(ctx, bucket, cfg)
}

// IsEnabled 返回当前 storage 是否可用 —— handler 层在所有 PDF 路由开头先检查。
func IsEnabled() bool {
	mu.RLock()
	defer mu.RUnlock()
	return enabled
}

// PaperPDFBucket 暴露 PDF bucket 名 —— 调用方拼 object_key 时不用从 config 拿。
func PaperPDFBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketPaperPDFs
}

// FeedbackAttachmentBucket 暴露反馈附件 bucket 名。
func FeedbackAttachmentBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketFeedbackAttachments
}

// PeerReviewAssetBucket 暴露智能审稿稿件 bucket 名。
func PeerReviewAssetBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketPeerReviewAssets
}

// PrismBucket 暴露 Prism 智能写作编译产物 bucket 名。
func PrismBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketPrism
}

// FeatureToolsBucket 暴露功能广场工具 logo bucket 名。
func FeatureToolsBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketFeatureTools
}

// PutOptions Put 时的可选参数
type PutOptions struct {
	ContentType string            // 必填,例如 application/pdf
	UserMeta    map[string]string // 自定义元数据,会落到对象的 X-Amz-Meta-*
}

// PutResult Put 后的反馈,含 SHA256 / 长度 —— 调用方落库
type PutResult struct {
	ETag string // MinIO 返回的 ETag(单 part 上传时等于 MD5)
	Size int64  // 实际写入字节数
}

// PutObject 流式写入对象。size 必须准确(MinIO 单 part 上传需要预先知道长度)。
// 错误返回里包了 endpoint / bucket,便于 logs 排查。
func PutObject(ctx context.Context, bucket, key string, body io.Reader, size int64, opts PutOptions) (*PutResult, error) {
	if !IsEnabled() {
		return nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	info, err := c.PutObject(ctx, bucket, key, body, size, minio.PutObjectOptions{
		ContentType:  opts.ContentType,
		UserMetadata: opts.UserMeta,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: PutObject(bucket=%s,key=%s): %w", bucket, key, err)
	}
	return &PutResult{
		ETag: info.ETag,
		Size: info.Size,
	}, nil
}

// GetObject 流式读对象 —— 调用方负责 Close。
// 返回 ObjectInfo 让 handler 能拿 Content-Length / Content-Type 直接响应。
func GetObject(ctx context.Context, bucket, key string) (io.ReadCloser, *minio.ObjectInfo, error) {
	if !IsEnabled() {
		return nil, nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	obj, err := c.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("storage: GetObject(bucket=%s,key=%s): %w", bucket, key, err)
	}
	// minio-go 的 GetObject 不会立刻报 NoSuchKey —— 真正读 / Stat 时才报。
	// 这里先 Stat 一下,把不存在的情况映射成 ErrNotFound。
	info, err := obj.Stat()
	if err != nil {
		_ = obj.Close()
		// minio-go ErrorResponse.Code == "NoSuchKey"
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("storage: stat(bucket=%s,key=%s): %w", bucket, key, err)
	}
	return obj, &info, nil
}

// DeleteObject 删 —— 对象不存在不报错(MinIO 行为)
func DeleteObject(ctx context.Context, bucket, key string) error {
	if !IsEnabled() {
		return ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	return c.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{})
}

// DeleteObjects 批量删 —— 用 MinIO 的 RemoveObjects(channel API),
// 单个请求里删一批,远比串行 RemoveObject 快 10×+。
//
// 部分失败不抛错(没法批量回滚);失败信息走 callback,调用方决定 log/重试。
// 空 keys 直接返回,不发请求。
func DeleteObjects(
	ctx context.Context,
	bucket string,
	keys []string,
	onErr func(key string, err error),
) error {
	if len(keys) == 0 {
		return nil
	}
	if !IsEnabled() {
		return ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	objectsCh := make(chan minio.ObjectInfo, len(keys))
	safego.Go("storage-delete-objects-feed", func() {
		defer close(objectsCh)
		for _, k := range keys {
			if k == "" {
				continue
			}
			objectsCh <- minio.ObjectInfo{Key: k}
		}
	})

	errCh := c.RemoveObjects(ctx, bucket, objectsCh, minio.RemoveObjectsOptions{})
	for e := range errCh {
		if e.Err != nil && onErr != nil {
			onErr(e.ObjectName, e.Err)
		}
	}
	return nil
}

// PresignedGetURL 给前端直接下载用 —— 不暴露 backend 流量。
// 当前实现没用,handler 走 backend stream 转发,保证鉴权 + 私有 bucket。
// 留着后续要做大文件 / CDN 加速时启用。
func PresignedGetURL(ctx context.Context, bucket, key string, expires time.Duration, reqParams url.Values) (string, error) {
	if !IsEnabled() {
		return "", ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	u, err := c.PresignedGetObject(ctx, bucket, key, expires, reqParams)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

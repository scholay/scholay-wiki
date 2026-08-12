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
	"net/http"
	"net/url"
	"strconv"
	"strings"
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
	BucketAgentArtifacts      string
	BucketAgentAttachments    string
	BucketSkillBundles        string
	BucketNewsCovers          string
	UseSSL                    bool
}

var (
	mu      sync.RWMutex
	client  *minio.Client
	config  Config
	enabled bool
)

// Init 初始化 storage 单例 —— 在 main bootstrap 里调一次。
// 配置不完整时返回 nil error,但 IsEnabled() 会是 false,所有 PDF 接口走 503 分支。
//
// 启动时会:
//  1. 建 minio client(此时还不会真连 MinIO,只建客户端对象)
//  2. Ping 一下 ListBuckets 确认凭证 / endpoint 可用
//  3. 幂等创建 BucketPaperPDFs(已存在则跳过)
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
	}
	if cfg.BucketFeedbackAttachments != "" {
		if err := ensureBucket(ctx, c, cfg.BucketFeedbackAttachments); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketFeedbackAttachments, err)
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
	}

	// tmp/ 24h ILM 的挂载 / 摘除:哪些桶该挂由 TmpILMBuckets 一处判定(理由见那里),
	// 摘除清单见 TmpILMRevokedBuckets。失败只 warn —— ILM 是兜底手段,不该阻塞启动。
	for _, b := range TmpILMBuckets(cfg) {
		if err := ensureTmpLifecycle(ctx, c, b); err != nil {
			slog.Warn("storage: 设置 tmp 生命周期规则失败,跳过(业务侧删除路径仍生效)",
				"bucket", b, "err", err)
		}
	}
	for _, b := range TmpILMRevokedBuckets(cfg) {
		if err := removeTmpLifecycle(ctx, c, b); err != nil {
			slog.Warn("storage: 摘除 tmp 生命周期规则失败(该桶仍有对象被自动过期的风险)",
				"bucket", b, "err", err)
		}
	}

	// 功能广场工具 logo —— 永久资源, 不挂 tmp lifecycle。
	if cfg.BucketFeatureTools != "" {
		if err := ensureBucket(ctx, c, cfg.BucketFeatureTools); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketFeatureTools, err)
		}
	}
	// 情报封面缩略图(0127)—— 永久资源, 不挂 tmp lifecycle;换图/撤图由 news 管线显式删旧 key。
	if cfg.BucketNewsCovers != "" {
		if err := ensureBucket(ctx, c, cfg.BucketNewsCovers); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketNewsCovers, err)
		}
	}
	if cfg.BucketAgentArtifacts != "" {
		if err := ensureBucket(ctx, c, cfg.BucketAgentArtifacts); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketAgentArtifacts, err)
		}
	}
	// agent 输入框附件桶(0112):**刻意不挂任何 lifecycle**。
	// 这里的对象是用户上传的原始数据 —— 正是耐久化方案要保护的东西本身。回收只由三条
	// 显式路径触发:用户主动永久删除 / 删会话 / 删用户(见 agentattach 与 user.DeleteUser)。
	// 桶级 ILM 会把这三条之外的语义偷偷加进来,而且没人会在删数据那天想起来它。
	// (写下这条是因为 scholar-agent-artifacts 当年没写,今天没人分得清那是决策还是遗漏。)
	if cfg.BucketAgentAttachments != "" {
		if err := ensureBucket(ctx, c, cfg.BucketAgentAttachments); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketAgentAttachments, err)
		}
	}
	// skill bundle 桶:永久资源(不挂 tmp/ ILM)。存用户上传的 skill 原始 tarball(审计/归档);
	// 物化热路径读 DB skill_versions.skill_md,不回 MinIO。
	if cfg.BucketSkillBundles != "" {
		if err := ensureBucket(ctx, c, cfg.BucketSkillBundles); err != nil {
			return fmt.Errorf("storage: 创建 bucket %q 失败: %w", cfg.BucketSkillBundles, err)
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

// ─── tmp/ 24h ILM:唯一判据与唯一前缀 ────────────────────────────────────────

// TmpILMPrefix 是"MinIO 会自动删掉里面东西"的前缀。**只有这一个**。
// 导出是为了让业务侧能在单元测试里钉死「我的 object_key 不在自动删除区」——
// 2026-08 的 peer-review 事故就是这条不变式只写在注释里:注释说 submit 时会把对象搬出
// tmp/,代码里从来没有这个动作,于是全部稿件在 24h 后被清空、DB 40 行全成死链。
const TmpILMPrefix = "tmp/"

// IsTmpILMManaged 报告 key 是否落在自动过期区。业务侧生成 object_key 时应当自测这个。
func IsTmpILMManaged(key string) bool { return strings.HasPrefix(key, TmpILMPrefix) }

// TmpILMBuckets 列出**应当**挂 tmp/ 24h 过期规则的桶。
//
// 判据只有一条:桶里存在「PutObject 已成功、但还没有任何 DB 行认领它」的中间态对象 ——
// 这种对象没有任何业务代码路径会去删它,只能靠桶级 ILM 兜底。
//   - paper PDFs:`tmp/<uid>/<jobId>.pdf` 只挂在内存 job 上,confirm 才 move 到 papers/ 并落库。
//   - feedback:  `tmp/<uploadKey>/...` 上传即写行但 is_used=false,用户可能永不提交那张表单。
//
// 反过来:**对象一落地就有 DB 行引用的桶绝不能挂**。ILM 不认识 DB,它只按前缀 + 时间删,
// 结果是把还被引用的对象删成死链。peer-review 桶就是这么丢光的(见 TmpILMRevokedBuckets)。
//
// ⚠️ 已知缺口(本次未修,已上报):feedback 桶满足上面的判据,但它**绑定之后 object_key 也不搬家**,
// 于是已提交工单的附件同样在 24h 后消失 —— 管理员隔天打开工单只会拿到死链。正确修法是
// BindAttachmentsToFeedback 时把对象提升出 tmp/(与 library 的 movePdfTmpToFinal 同形),
// 不是把这个桶从名单里删掉(删掉会让"传了没提交"的对象永久堆积)。
func TmpILMBuckets(cfg Config) []string {
	var out []string
	if cfg.BucketPaperPDFs != "" {
		out = append(out, cfg.BucketPaperPDFs)
	}
	if cfg.BucketFeedbackAttachments != "" {
		out = append(out, cfg.BucketFeedbackAttachments)
	}
	return out
}

// TmpILMRevokedBuckets 列出曾经挂过 tmp/ ILM、现在必须**主动摘掉**的桶。
//
// 为什么不能"只把 object_key 改出 tmp/ 就算了":lifecycle 规则是写在**桶**上的持久配置,
// 不显式 Remove 就一直是 Enabled 状态。下一个往这个桶写 tmp/ 的人不会去读这段历史,
// 会原样再踩一次同一个坑,而且同样要等 24 小时后才发现。
func TmpILMRevokedBuckets(cfg Config) []string {
	var out []string
	// peer-review 稿件桶:UploadAsset 里 PutObject 成功后同一个请求就 CreateAsset 落行,
	// 中间态窗口只有几毫秒且已由 CreateAsset 失败时的补偿删除覆盖 —— 没有 ILM 该管的东西。
	// 而稿件本身必须活到审稿结束之后(草稿可跨天 resume、submit 后 runReviewBackground /
	// RetryReview / 管理端下载都还要回读),挂 24h 过期等于定时删用户稿件。
	if cfg.BucketPeerReviewAssets != "" {
		out = append(out, cfg.BucketPeerReviewAssets)
	}
	return out
}

// ensureTmpLifecycle 给 bucket 挂"tmp/ 前缀对象 24h 自动过期"的 lifecycle rule。
//
// 幂等:同 ID 的 rule 反复 Set 不会出问题,MinIO 直接替换。
// 注意:lifecycle 的 Days 单位是天(S3 规范),最小 1 天 —— MinIO ILM scanner
// 通常每小时左右扫一次,过期对象在创建后 ~25h 内被清理。
// 这个时长对"用户上传后忘了 confirm"的场景完全足够。
func ensureTmpLifecycle(ctx context.Context, c *minio.Client, bucket string) error {
	return c.SetBucketLifecycle(ctx, bucket, tmpLifecycleConfig())
}

// tmpLifecycleConfig 是那条规则本身(抽出来供测试直接读,规则与 TmpILMPrefix 同源不漂移)。
func tmpLifecycleConfig() *lifecycle.Configuration {
	cfg := lifecycle.NewConfiguration()
	cfg.Rules = []lifecycle.Rule{
		{
			ID:     "scholay-tmp-uploads-24h",
			Status: "Enabled",
			RuleFilter: lifecycle.Filter{
				Prefix: TmpILMPrefix,
			},
			Expiration: lifecycle.Expiration{
				Days: 1,
			},
		},
	}
	return cfg
}

// removeTmpLifecycle 摘掉桶上的 lifecycle 配置。
// S3 的 DeleteBucketLifecycle 对"本来就没有规则"的桶也返回成功,所以每次启动重复调用是安全的。
func removeTmpLifecycle(ctx context.Context, c *minio.Client, bucket string) error {
	return c.SetBucketLifecycle(ctx, bucket, lifecycle.NewConfiguration())
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

// AgentArtifactsBucket 暴露 agent 成果交付物 bucket 名。
func AgentArtifactsBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketAgentArtifacts
}

// AgentAttachmentsBucket 暴露 agent 输入框上传附件 bucket 名(耐久真源;cwd 是工作副本)。
func AgentAttachmentsBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketAgentAttachments
}

// SkillBundlesBucket 暴露 skill 市场 bundle bucket 名。
func SkillBundlesBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketSkillBundles
}

// NewsCoversBucket 暴露情报封面缩略图 bucket 名。
func NewsCoversBucket() string {
	mu.RLock()
	defer mu.RUnlock()
	return config.BucketNewsCovers
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

// StatObject 取对象元数据(HEAD),用于 Range 服务前拿总大小 / Content-Type。
func StatObject(ctx context.Context, bucket, key string) (*minio.ObjectInfo, error) {
	if !IsEnabled() {
		return nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	info, err := c.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("storage: StatObject(bucket=%s,key=%s): %w", bucket, key, err)
	}
	return &info, nil
}

// GetObjectRange 用 MinIO 原生 Range GET 读 [start,end](闭区间)的字节。调用方负责 Close。
func GetObjectRange(ctx context.Context, bucket, key string, start, end int64) (io.ReadCloser, error) {
	if !IsEnabled() {
		return nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	opts := minio.GetObjectOptions{}
	if err := opts.SetRange(start, end); err != nil {
		return nil, fmt.Errorf("storage: SetRange(%d,%d): %w", start, end, err)
	}
	obj, err := c.GetObject(ctx, bucket, key, opts)
	if err != nil {
		return nil, fmt.Errorf("storage: GetObjectRange(bucket=%s,key=%s): %w", bucket, key, err)
	}
	return obj, nil
}

// ServeObject 把对象流式写到 w, 支持 HTTP Range(单区间)断点/渐进下载 —— 让 pdf.js 能按需
// 取页/续传, 而不必每次整份拉取(性能审计 file-download)。框架无关(用 net/http 而非 gin)。
//
// 行为:
//   - 无 Range / Range 解析失败 / 多区间 → 整份 200 + Content-Length + Accept-Ranges(无回归:
//     最差等同原来的 io.Copy 全量转发)。
//   - 合法单区间 → 206 + Content-Range + Accept-Ranges,只取该段字节。
//
// 鉴权/归属由调用方在调用前完成;contentType 为空则用对象自身的。对象不存在返回 ErrNotFound
// 且**不写任何响应头/状态**, 调用方可据此回干净的 404;一旦开始写 body 后的错误(客户端断流)
// 通过返回值上抛, 调用方按 debug 处理即可。
func ServeObject(w http.ResponseWriter, r *http.Request, bucket, key, contentType string) error {
	ctx := r.Context()

	if rangeHdr := r.Header.Get("Range"); rangeHdr != "" {
		if info, err := StatObject(ctx, bucket, key); err != nil {
			return err
		} else if start, end, ok := parseSingleByteRange(rangeHdr, info.Size); ok {
			reader, rerr := GetObjectRange(ctx, bucket, key, start, end)
			if rerr != nil {
				return rerr
			}
			defer reader.Close()
			ct := contentType
			if ct == "" {
				ct = info.ContentType
			}
			h := w.Header()
			if ct != "" {
				h.Set("Content-Type", ct)
			}
			h.Set("Accept-Ranges", "bytes")
			h.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, info.Size))
			h.Set("Content-Length", strconv.FormatInt(end-start+1, 10))
			w.WriteHeader(http.StatusPartialContent)
			_, cerr := io.Copy(w, reader)
			return cerr
		}
		// 解析失败 / 不可满足 / 多区间 → 跌落到整份(无回归)
	}

	// 条件请求(性能审计:PDF/附件切页签重下载)。先 Stat 拿 ETag/LastModified,若 If-None-Match 命中回 304 空体,
	// 免整份重传(鉴权已在 handler 层完成,304 不泄内容)。仅整份 GET 走此路径;Range 分支(pdf.js 大量用)在上面
	// 已 return,不引入 304 以免与 If-Range 交互出错。多一次 StatObject 往返可忽略。
	if info, serr := StatObject(ctx, bucket, key); serr == nil && info.ETag != "" {
		etag := `"` + strings.Trim(info.ETag, `"`) + `"`
		h := w.Header()
		h.Set("ETag", etag)
		if !info.LastModified.IsZero() {
			h.Set("Last-Modified", info.LastModified.UTC().Format(http.TimeFormat))
		}
		if h.Get("Cache-Control") == "" {
			h.Set("Cache-Control", "private, no-cache") // 调用方未设时给个重校验默认(有 ETag → 未变回 304,不 no-store)
		}
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return nil
		}
	}

	reader, info, err := GetObject(ctx, bucket, key)
	if err != nil {
		return err
	}
	defer reader.Close()
	ct := contentType
	if ct == "" {
		ct = info.ContentType
	}
	h := w.Header()
	if ct != "" {
		h.Set("Content-Type", ct)
	}
	h.Set("Accept-Ranges", "bytes")
	h.Set("Content-Length", strconv.FormatInt(info.Size, 10))
	w.WriteHeader(http.StatusOK)
	_, cerr := io.Copy(w, reader)
	return cerr
}

// parseSingleByteRange 解析单区间 `Range: bytes=...`(pdf.js 用的就是单区间)。
// 支持 `bytes=START-END` / `bytes=START-` / `bytes=-SUFFIX`。多区间(含逗号)、空、越界、
// 非法一律返回 ok=false, 让调用方跌落到整份响应(故意从严, 永不出错胜过出错)。
func parseSingleByteRange(spec string, size int64) (start, end int64, ok bool) {
	const prefix = "bytes="
	if size <= 0 || !strings.HasPrefix(spec, prefix) {
		return 0, 0, false
	}
	spec = strings.TrimSpace(strings.TrimPrefix(spec, prefix))
	if spec == "" || strings.Contains(spec, ",") { // 多区间不支持 → 跌落整份
		return 0, 0, false
	}
	dash := strings.IndexByte(spec, '-')
	if dash < 0 {
		return 0, 0, false
	}
	startStr := strings.TrimSpace(spec[:dash])
	endStr := strings.TrimSpace(spec[dash+1:])

	if startStr == "" {
		// 后缀区间: bytes=-N → 末尾 N 字节
		n, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil || n <= 0 {
			return 0, 0, false
		}
		if n > size {
			n = size
		}
		return size - n, size - 1, true
	}

	s, err := strconv.ParseInt(startStr, 10, 64)
	if err != nil || s < 0 || s >= size {
		return 0, 0, false
	}
	e := size - 1
	if endStr != "" {
		e, err = strconv.ParseInt(endStr, 10, 64)
		if err != nil || e < s {
			return 0, 0, false
		}
		if e >= size {
			e = size - 1
		}
	}
	return s, e, true
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

// ListObjectKeys 按前缀列举对象 key(递归)。
// 消费方:账号注销清理(papers/<uid>/ 前缀)。只要 LastModified 等元数据请用 ListObjectInfos。
// maxKeys > 0 时最多返回 maxKeys 个(防止误传空前缀拉全桶);0 = 不限。
func ListObjectKeys(ctx context.Context, bucket, prefix string, maxKeys int) ([]string, error) {
	if !IsEnabled() {
		return nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	var keys []string
	for obj := range c.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if obj.Err != nil {
			return keys, obj.Err
		}
		keys = append(keys, obj.Key)
		if maxKeys > 0 && len(keys) >= maxKeys {
			break
		}
	}
	return keys, nil
}

// ListObjectInfos 按前缀列举对象完整元数据(递归),与 ListObjectKeys 同款,但保留
// LastModified 等字段。消费方:MinIO 孤儿对象对账 reaper(common/cleanup)——
// 拿 LastModified 做删除安全线,防止把正在进行的上传/迁移误判成孤儿。
// maxKeys > 0 时最多返回 maxKeys 个(防止误传空前缀拉全桶);0 = 不限。
func ListObjectInfos(ctx context.Context, bucket, prefix string, maxKeys int) ([]minio.ObjectInfo, error) {
	if !IsEnabled() {
		return nil, ErrDisabled
	}
	mu.RLock()
	c := client
	mu.RUnlock()

	var infos []minio.ObjectInfo
	for obj := range c.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if obj.Err != nil {
			return infos, obj.Err
		}
		infos = append(infos, obj)
		if maxKeys > 0 && len(infos) >= maxKeys {
			break
		}
	}
	return infos, nil
}

// PresignedGetURL 给前端直接下载用 —— 不暴露 backend 流量。
// ⚠️ 当前**未使用**,所有下载走 backend stream 转发(ServeObject,带鉴权 + 私有 bucket + Range)。
// 不能直接把本函数的返回值发给浏览器:MINIO_ENDPOINT 是 `minio:9000`(容器内网名,且 expose-only
// 不对宿主暴露),浏览器解析/直连不了 → presigned 链接在生产 100% 失败。
// 真要卸载 backend egress, 正确做法是 nginx `X-Accel-Redirect` 到一个 `internal;` 的 minio
// location, 由 nginx 用本函数生成的 presigned URL(带 SigV4 签名)代浏览器拉取(鉴权仍在 Go,
// 字节不过 backend, 原生支持 Range)。该改造需联调真实 stack 验证, 故暂未启用。性能审计 file-download。
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

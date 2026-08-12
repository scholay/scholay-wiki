// ============================================================================
// 情报封面缩略图管线(0127)。
//
// 背景:cover_image 是上游原图(minicod 图床等),经 /img-remote 代理【冷缓存回源
// 实测 30s+/张】,首页情报区 5-6 张图同时回源会把浏览器与站点间的连接/带宽拖死,
// 连带路由 chunk 请求排队 → 全站点击无响应(2026-08 线上排查主根因)。
//
// 方案(产品拍板:只落库缩小版,原图不落库):
//   webhook 落库后【后台并发】→ 取原图 → 生成 ~640px JPEG 缩略图 → 存 MinIO
//   → 更新 news_items.cover_thumb_key/src。列表下发缩略图(同源、~几十 KB、秒开);
//   详情页仍用 /img-remote 原图 —— 取原图那一次【刻意走内部 nginx 的 img-remote】,
//   同一次传输顺带把 nginx 的 30d proxy_cache 预热掉,详情页首个访客也不再等冷回源。
//
// 失败语义:全程 best-effort。任何一步失败只 slog.Warn,列表回落 cover_image 原图
// (现状行为),下一轮回填(StartCoverThumbBackfill)自动重试。
// ============================================================================

package news

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	stddraw "image/draw"
	_ "image/gif" // 注册 GIF 解码
	"image/jpeg"
	_ "image/png" // 注册 PNG 解码
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // 注册 WebP 解码(x/image 仅解码,足够)

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/storage"

	"golang.org/x/sync/errgroup"
)

const (
	// coverThumbMaxDim 缩略图长边上限。消费端最大的是移动 feed 全宽卡(~430 CSS px @2x);
	// 640 在它上面仍清晰,PC 列表 96px 位绰绰有余,产物普遍 20-60KB。
	coverThumbMaxDim = 640
	// coverThumbJPEGQuality JPEG 质量 —— 列表配图,80 视觉无损体积可控。
	coverThumbJPEGQuality = 80
	// coverFetchMaxBytes 原图下载上限。超过直接放弃(疑似非图片/恶意资源)。
	coverFetchMaxBytes = 15 << 20
	// coverMaxPixels 解码前的像素上限(DecodeConfig 预检),防解压炸弹。
	coverMaxPixels = 40 << 20
	// coverFetchTimeout 单张原图的取图超时。上游实测 KB/s 级 trickle,必须给足
	// (156KB@2.6KB/s ≈ 60s);后台任务不占用户路径,宽松无害。
	coverFetchTimeout = 3 * time.Minute
	// newsCoverKeyPrefix MinIO 对象 key 前缀。⚠️ 不要用 tmp/(会挂 24h ILM 自动删)。
	newsCoverKeyPrefix = "news-covers/"

	backfillInterval    = time.Hour
	backfillBatchSize   = 24
	backfillConcurrency = 3
)

// SetCoverProxyBase 注入内部 nginx 基址(如 http://nginx)。取 minicod 原图时优先
// 经它的 /img-remote 走 —— 同一次传输顺带预热 nginx 30d proxy_cache(详情页受益)。
// 空串/不可达时自动回落直连上游。bootstrap 调一次。
func (s *Service) SetCoverProxyBase(base string) {
	s.coverProxyBase = strings.TrimRight(base, "/")
}

// scheduleCoverThumb webhook 落库成功后的异步钩子:单条、立即、不阻塞 webhook 应答。
func (s *Service) scheduleCoverThumb(id string) {
	if !storage.IsEnabled() {
		return // 无 MinIO(本地裸跑等):静默跳过,前端回落原图
	}
	safego.Go("news-cover-thumb", func() {
		ctx, cancel := context.WithTimeout(context.Background(), coverFetchTimeout+time.Minute)
		defer cancel()
		if err := s.ensureCoverThumbByID(ctx, id); err != nil {
			slog.Warn("news: 生成封面缩略图失败(回填任务会重试)", "id", id, "err", err)
		}
	})
}

// ensureCoverThumbByID 重新读行(webhook upsert 不带 thumb 列,内存对象不可信)后收敛:
//   - cover_image 为空:清掉遗留缩略图(上游把图删了)
//   - cover_thumb_src == cover_image 且已有 key:已是最新,no-op
//   - 其余:取图 → 缩略 → 上传 → 落库;旧 key(换图场景)best-effort 删除
func (s *Service) ensureCoverThumbByID(ctx context.Context, id string) error {
	item, err := s.repo.GetByID(id)
	if err != nil || item == nil {
		return fmt.Errorf("load item: %w", err)
	}
	return s.ensureCoverThumb(ctx, item)
}

func (s *Service) ensureCoverThumb(ctx context.Context, item *NewsItem) error {
	src := strings.TrimSpace(item.CoverImage)
	if src == "" {
		if item.CoverThumbKey != "" {
			_ = storage.DeleteObject(ctx, storage.NewsCoversBucket(), item.CoverThumbKey)
			return s.repo.UpdateCoverThumb(item.ID, "", "")
		}
		return nil
	}
	if item.CoverThumbSrc == src && item.CoverThumbKey != "" {
		return nil // 已是当前原图的缩略图
	}
	if !storage.IsEnabled() {
		return nil
	}

	data, err := s.fetchCoverImage(ctx, src)
	if err != nil {
		return fmt.Errorf("fetch %s: %w", src, err)
	}
	thumb, err := makeCoverThumb(data)
	if err != nil {
		return fmt.Errorf("thumb %s: %w", src, err)
	}

	key := newsCoverKeyPrefix + item.ID + "-" + shortHash(src) + ".jpg"
	if _, err := storage.PutObject(ctx, storage.NewsCoversBucket(), key,
		bytes.NewReader(thumb), int64(len(thumb)),
		storage.PutOptions{ContentType: "image/jpeg"}); err != nil {
		return fmt.Errorf("put %s: %w", key, err)
	}
	if err := s.repo.UpdateCoverThumb(item.ID, key, src); err != nil {
		return fmt.Errorf("save key: %w", err)
	}
	// 上游换图产生的旧对象:key 不同(内嵌 src 哈希),清理是 best-effort
	if old := item.CoverThumbKey; old != "" && old != key {
		_ = storage.DeleteObject(ctx, storage.NewsCoversBucket(), old)
	}
	slog.Info("news: 封面缩略图已生成", "id", item.ID, "key", key, "bytes", len(thumb))
	return nil
}

// fetchCoverImage 取原图字节。minicod 图床的图优先经内部 nginx 的 /img-remote 取 ——
// 同一次回源顺带写热 nginx proxy_cache(30d),详情页大图从此秒出;nginx 不可达/失败
// 则回落直连上游(SSRF 防护:Restricted client 拒内网 IP)。
func (s *Service) fetchCoverImage(ctx context.Context, src string) ([]byte, error) {
	proxied := proxifyImageURL(src)
	if proxied != src && s.coverProxyBase != "" {
		data, err := fetchImageBytes(ctx, s.coverProxyBase+proxied, httpclient.Default())
		if err == nil {
			return data, nil
		}
		slog.Warn("news: 经内部 nginx 取原图失败,回落直连", "url", proxied, "err", err)
	}
	if err := httpclient.ValidateOutboundURL(src); err != nil {
		return nil, err
	}
	return fetchImageBytes(ctx, src, httpclient.Restricted(coverFetchTimeout))
}

func fetchImageBytes(ctx context.Context, rawURL string, client *http.Client) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, coverFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, coverFetchMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > coverFetchMaxBytes {
		return nil, errors.New("image too large")
	}
	return data, nil
}

// makeCoverThumb 解码 → 等比缩到长边 ≤ coverThumbMaxDim → JPEG(白底合成,防 PNG
// 透明区发黑)。格式支持 = jpeg/png/gif/webp;解不动的格式返回错误(调用方回落原图)。
func makeCoverThumb(data []byte) ([]byte, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > coverMaxPixels {
		return nil, fmt.Errorf("unreasonable dimensions %dx%d", cfg.Width, cfg.Height)
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	scale := 1.0
	if w > h {
		if w > coverThumbMaxDim {
			scale = float64(coverThumbMaxDim) / float64(w)
		}
	} else if h > coverThumbMaxDim {
		scale = float64(coverThumbMaxDim) / float64(h)
	}
	tw, th := max(1, int(float64(w)*scale+0.5)), max(1, int(float64(h)*scale+0.5))

	dst := image.NewRGBA(image.Rect(0, 0, tw, th))
	stddraw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, stddraw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: coverThumbJPEGQuality}); err != nil {
		return nil, fmt.Errorf("encode: %w", err)
	}
	return buf.Bytes(), nil
}

func shortHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:4]) // 8 个 hex 字符,区分「同一条换图」足够
}

// coverThumbURL key → 对外稳定 URL(backend 流式服务,见 handler.PublicCoverThumb)。
// URL 随 key(内嵌 src 哈希)变化 → 换图自动穿透 immutable 长缓存。
//
// ⚠️ URL 刻意【不带 .jpg 扩展名】:nginx 的静态资源正则 location(~* \.(png|jpg|…)$)
// 优先级高于普通 `location /api/`,带扩展名的 API 路径会被它抢走、误送 frontend SPA,
// 返回带 1y immutable 的 404(/uploads/ 用 ^~ 防的就是这个坑,2026-08-12 实测复踩)。
// 去扩展名后正则完全不匹配;Content-Type 由 handler 显式下发,浏览器不依赖后缀。
func coverThumbURL(key string) string {
	if key == "" {
		return ""
	}
	return "/api/v1/public/news/cover/" +
		strings.TrimSuffix(strings.TrimPrefix(key, newsCoverKeyPrefix), ".jpg")
}

// StartCoverThumbBackfill 常驻回填:启动 30s 后先跑一批(补历史行/上次失败),之后每小时
// 对账一轮。批内【并发】处理(errgroup limit=3)—— 页面上多张图的场景靠并发把整批时间压平。
// 幂等判据全在 SQL(cover_thumb_src != cover_image),重复跑零副作用。
func (s *Service) StartCoverThumbBackfill(ctx context.Context) {
	if !storage.IsEnabled() {
		slog.Info("news: MinIO 未启用,封面缩略图回填不启动(列表将回落原图)")
		return
	}
	safego.GoCtx(ctx, "news-cover-backfill", func(ctx context.Context) {
		select {
		case <-time.After(30 * time.Second):
		case <-ctx.Done():
			return
		}
		s.runCoverThumbBackfill(ctx)
		ticker := time.NewTicker(backfillInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.runCoverThumbBackfill(ctx)
			case <-ctx.Done():
				return
			}
		}
	})
}

func (s *Service) runCoverThumbBackfill(ctx context.Context) {
	items, err := s.repo.ListCoverThumbPending(backfillBatchSize)
	if err != nil {
		slog.Warn("news: 缩略图回填查询失败", "err", err)
		return
	}
	if len(items) == 0 {
		return
	}
	slog.Info("news: 封面缩略图回填开始", "pending", len(items))
	var g errgroup.Group
	g.SetLimit(backfillConcurrency)
	for i := range items {
		item := items[i]
		g.Go(func() error {
			if ctx.Err() != nil {
				return nil
			}
			if err := s.ensureCoverThumb(ctx, &item); err != nil {
				slog.Warn("news: 回填单条失败(下一轮重试)", "id", item.ID, "err", err)
			}
			return nil // 单条失败不污染整批
		})
	}
	_ = g.Wait()
}

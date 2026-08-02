// ============================================================================
// Scholay学术 V1.0
// SEO 主动提交 —— 业务编排层
//
// 职责:
//   1. 提供 Enqueue 系列 API,业务侧"写完入队"即可,不感知具体推哪些引擎
//   2. 维护 Worker 生命周期(启动/停止),后台轮询消费队列
//   3. 把 URL 同时推 IndexNow / 百度,各家失败独立处理(一家挂另一家照走)
//
// 不在这里做的事:
//   - 不做去重(交给 Redis ZSET 天然去重)
//   - 不做 URL 拼接(调用方负责把完整 URL 喂进来,本包不知道 site origin 怎么拼路径)
// ============================================================================

package seosubmit

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/upstream"
)

// Service 主动提交服务。可空使用 —— 当 cfg.SEOSubmit.Enabled=false 时所有方法 no-op。
type Service struct {
	cfg appconfig.SEOSubmitConfig
	// siteOrigin 站点权威域名(https://www.scholay.com),来自 cfg.ExternalServices 系
	siteOrigin string
}

// NewService 构造。cfg 在调用方组装好(见 bootstrap)。
func NewService(cfg appconfig.SEOSubmitConfig, siteOrigin string) *Service {
	return &Service{cfg: cfg, siteOrigin: strings.TrimRight(siteOrigin, "/")}
}

// Enabled 总开关 + 至少一家 sink 启用且配置全 → 才算工作中。
// 开关关 / 配置缺 / siteOrigin 空 任一情况都视作禁用。
func (s *Service) Enabled() bool {
	if s == nil || !s.cfg.Enabled || s.siteOrigin == "" {
		return false
	}
	return s.indexNowReady() || s.baiduReady()
}

func (s *Service) indexNowReady() bool {
	return s.cfg.IndexNowEnabled && s.cfg.IndexNowKey != ""
}

func (s *Service) baiduReady() bool {
	return s.cfg.BaiduEnabled && s.cfg.BaiduToken != "" && s.cfg.BaiduSite != ""
}

// EnqueuePaths 把站内 path 列表(如 ["/paper/abc","/blog/xyz"])拼成完整 URL 入队。
// 业务侧最常用接口 —— 调用方只需关心路径,不操心 host。
func (s *Service) EnqueuePaths(ctx context.Context, paths []string) {
	if !s.Enabled() || len(paths) == 0 {
		return
	}
	urls := make([]string, 0, len(paths))
	for _, p := range paths {
		if p == "" {
			continue
		}
		if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
			urls = append(urls, p)
			continue
		}
		if !strings.HasPrefix(p, "/") {
			p = "/" + p
		}
		urls = append(urls, s.siteOrigin+p)
	}
	if err := Enqueue(ctx, urls); err != nil {
		slog.Warn("seo push enqueue failed", "count", len(urls), "err", err)
	}
}

// EnqueueURLs 直接接收完整 URL 入队(host 必须与 siteOrigin 一致,否则被推送时丢弃)。
func (s *Service) EnqueueURLs(ctx context.Context, urls []string) {
	if !s.Enabled() || len(urls) == 0 {
		return
	}
	if err := Enqueue(ctx, urls); err != nil {
		slog.Warn("seo push enqueue failed", "count", len(urls), "err", err)
	}
}

// IndexNowKey 暴露 key 供 handler 校验文件路由
func (s *Service) IndexNowKey() string {
	return s.cfg.IndexNowKey
}

// StartWorker 启动后台 worker。ctx 关闭时退出。
// worker 是单实例运行(进程内 1 个 goroutine);Redis 队列在多副本时自然分摊。
func (s *Service) StartWorker(ctx context.Context) {
	if !s.Enabled() {
		slog.Info("seo push disabled, worker not started")
		return
	}
	interval := s.cfg.WorkerInterval
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	batch := s.cfg.BatchSize
	if batch <= 0 {
		batch = 100
	}
	slog.Info("seo push worker starting",
		"interval", interval,
		"batch_size", batch,
		"indexnow", s.indexNowReady(),
		"baidu", s.baiduReady(),
		"site_origin", s.siteOrigin,
	)

	safego.Go("seo-push-worker", func() {
		// 启动时先跑一次,加快首次推送
		s.processOne(ctx, batch)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Info("seo push worker stopped")
				return
			case <-ticker.C:
				s.processOne(ctx, batch)
			}
		}
	})
}

// processOne 单轮:从队列拉一批 URL,串行推 IndexNow / 百度,失败 URL 放回队列。
func (s *Service) processOne(ctx context.Context, batch int) {
	urls, err := PopBatch(ctx, batch)
	if err != nil {
		slog.Warn("seo push pop batch failed", "err", err)
		return
	}
	if len(urls) == 0 {
		return
	}

	// IndexNow:整批推一次。2026-07 线上审计修复:
	//   1. 此前任何失败都全批回队 —— 结构性失败(host/key 不匹配)回队后每 5 分钟永动重试。
	//      现按错误类型分流,细则见 submitIndexNowBatch。
	//   2. 此前 IndexNow 失败会 return 短路百度 —— 现两通道独立成败,互不连坐。
	//      (代价:IndexNow 临时失败回队后,下轮百度会重复收到同批 URL;重复提交幂等,
	//      仅多耗每日配额,可接受。)
	if s.indexNowReady() {
		s.submitIndexNowBatch(ctx, urls)
	}

	// 百度:同一批,内部做配额限流。失败不回队(配额耗尽是预期行为,回队也没用)。
	if s.baiduReady() {
		if _, err := SubmitBaidu(ctx, s.cfg.BaiduSite, s.cfg.BaiduToken, urls, s.cfg.BaiduDailyQuota); err != nil {
			slog.Warn("seo push baidu failed", "count", len(urls), "err", err)
		}
	}
}

// indexNowAuthStrikes — 连续多少轮鉴权失败(401/403)才判永久。
// worker 默认 5 分钟一轮 → 3 轮 ≈ 15 分钟持续失败,足以跨过一次部署/CDN 抖动窗口。
const indexNowAuthStrikes = 3

// submitIndexNowBatch 推一批并按错误性质分流。三条路(2026-07 审查定):
//
//   - **结构性永久失败**(本地配置非法 / 400、422 host-key 不匹配):重试一万次也不会好,
//     落死信 ZSET 留档(不是就地丢弃),运维改完配置可回灌。
//   - **鉴权失败**(401/403):IndexNow 的 403 是搜索引擎异步反查 /{key}.txt 没过 ——
//     我们自己部署/CDN 抖动期间它取不到 key 就回 403,单次不判死。连续 N 轮才落死信,
//     否则照常回队。
//   - **其余**(429/5xx/网络/熔断):临时,回队。
func (s *Service) submitIndexNowBatch(ctx context.Context, urls []string) {
	err := SubmitIndexNow(ctx, s.cfg.IndexNowKey, s.siteOrigin, urls)
	if err == nil {
		ResetIndexNowAuthStrike(ctx)
		return
	}

	switch {
	case errors.Is(err, errIndexNowConfig) || errors.Is(err, upstream.ErrBadRequest):
		slog.Error("seo push indexnow structurally rejected, moved to dead-letter — 需运维核对 INDEXNOW_KEY / SITE_URL 与 /{key}.txt",
			"count", len(urls), "dead_key", deadKey, "err", err)
		s.toDeadLetter(ctx, urls, err)

	case errors.Is(err, upstream.ErrAuth):
		if n := IndexNowAuthStrike(ctx); n >= indexNowAuthStrikes {
			slog.Error("seo push indexnow auth failed repeatedly, moved to dead-letter — /{key}.txt 连续多轮取不到或内容不符",
				"count", len(urls), "strikes", n, "dead_key", deadKey, "err", err)
			s.toDeadLetter(ctx, urls, err)
			ResetIndexNowAuthStrike(ctx)
		} else {
			slog.Warn("seo push indexnow auth failed, requeue (可能只是部署窗口内取不到 key 文件)",
				"count", len(urls), "strikes", n, "err", err)
			_ = Requeue(ctx, urls)
		}

	default:
		slog.Warn("seo push indexnow failed, requeue", "count", len(urls), "err", err)
		_ = Requeue(ctx, urls)
	}
}

// toDeadLetter 落死信;死信本身写失败(Redis 挂了)时退回普通队列,绝不静默丢 URL。
func (s *Service) toDeadLetter(ctx context.Context, urls []string, cause error) {
	if err := DeadLetter(ctx, urls, cause.Error()); err != nil {
		slog.Warn("seo push dead-letter write failed, falling back to requeue", "count", len(urls), "err", err)
		_ = Requeue(ctx, urls)
	}
}

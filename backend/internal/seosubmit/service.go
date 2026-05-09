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
	"log/slog"
	"strings"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
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

	// IndexNow:整批推一次,4xx/5xx 全批回队
	if s.indexNowReady() {
		if err := SubmitIndexNow(ctx, s.cfg.IndexNowKey, s.siteOrigin, urls); err != nil {
			slog.Warn("seo push indexnow failed, requeue", "count", len(urls), "err", err)
			_ = Requeue(ctx, urls)
			return // IndexNow 都没过,百度也别推了,等下轮重来
		}
	}

	// 百度:同一批,内部做配额限流。失败不回队(配额耗尽是预期行为,回队也没用)。
	if s.baiduReady() {
		if _, err := SubmitBaidu(ctx, s.cfg.BaiduSite, s.cfg.BaiduToken, urls, s.cfg.BaiduDailyQuota); err != nil {
			slog.Warn("seo push baidu failed", "count", len(urls), "err", err)
		}
	}
}

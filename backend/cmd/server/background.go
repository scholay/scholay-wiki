// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"context"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seoingest"
)

// startBackgroundTasks 启动所有后台任务
func startBackgroundTasks(ctx context.Context, seoService *seo.Service, seoIngestService *seoingest.Service) {
	// 数据库连接池监控
	database.StartConnectionPoolMonitoring(ctx, 5*time.Minute)

	// Redis 逐出监控:correctness 键(吊销/配额/队列)与大缓存共池 allkeys-lru,逐出即告警。
	cache.StartEvictionMonitoring(ctx, 5*time.Minute)

	// 期刊全量摄取:worker 的父 ctx + 每日上游构建版本检查。
	// 检查本体只打一次 /v1/jnl/meta(极廉价);只有 lastBuiltAt 真的变了、且此前
	// 已有成功基线 run 时才自动发起 resync(见 RunDailyUpstreamCheck 头注)。
	// 首查延迟 15 分钟:避开启动窗口(minicod key 池缓存 5 分钟才热)。
	if seoIngestService != nil {
		seoIngestService.SetBaseContext(ctx)
		safego.Go("seoingest-daily-upstream-check", func() {
			select {
			case <-ctx.Done():
				return
			case <-time.After(15 * time.Minute):
			}
			seoIngestService.RunDailyUpstreamCheck(ctx)
			ticker := time.NewTicker(24 * time.Hour)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					seoIngestService.RunDailyUpstreamCheck(ctx)
				}
			}
		})
	}

	// 每 1 分钟回填 seo_papers / seo_authors 的 sitemap_page
	// （新插入行首次 page=0，事后按 id 区间修正）
	//
	// 间隔从 5min 缩短到 1min: BackfillSitemapPage 走 idx_status_sitemap_page 索引,
	// 只扫 page=0 的行,几乎零代价。新写入的论文/作者 ≤1 分钟即可进 sitemap。
	if seoService == nil {
		return
	}
	safego.Go("seo-sitemap-reconcile", func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		slog.Info("SEO sitemap reconcile task started")

		// 启动时先跑一次，让历史回填能立刻生效
		if err := seoService.ReconcileSitemapPages(); err != nil {
			slog.Error("Failed initial SEO paper sitemap reconcile", "err", err)
		}
		if err := seoService.ReconcileAuthorSitemapPages(); err != nil {
			slog.Error("Failed initial SEO author sitemap reconcile", "err", err)
		}
		// 期刊也必须 reconcile —— 否则 seo_journals.sitemap_page 永远=0,GetJournalSitemapSummary
		// 过滤 >0 → sitemap 索引里 0 条 journals 分页,整条 /journal 垂类对搜索引擎不可发现。
		if err := seoService.ReconcileJournalSitemapPages(); err != nil {
			slog.Error("Failed initial SEO journal sitemap reconcile", "err", err)
		}

		for {
			select {
			case <-ticker.C:
				if err := seoService.ReconcileSitemapPages(); err != nil {
					slog.Error("Failed SEO paper sitemap reconcile", "err", err)
				}
				if err := seoService.ReconcileAuthorSitemapPages(); err != nil {
					slog.Error("Failed SEO author sitemap reconcile", "err", err)
				}
				if err := seoService.ReconcileJournalSitemapPages(); err != nil {
					slog.Error("Failed SEO journal sitemap reconcile", "err", err)
				}
			case <-ctx.Done():
				slog.Info("SEO sitemap reconcile task stopped")
				return
			}
		}
	})
}

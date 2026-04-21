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

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/seo"
)

// userSnapshotRecorder 用于记录在线用户快照的接口
type userSnapshotRecorder interface {
	RecordOnlineUserSnapshot() error
}

// startBackgroundTasks 启动所有后台任务
func startBackgroundTasks(ctx context.Context, userService userSnapshotRecorder, seoService *seo.Service) {
	// 数据库连接池监控
	database.StartConnectionPoolMonitoring(ctx, 5*time.Minute)

	// 每 5 分钟记录在线用户快照
	safego.Go("online-user-snapshot", func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		slog.Info("Online user snapshot task started")

		if err := userService.RecordOnlineUserSnapshot(); err != nil {
			slog.Error("Failed to record initial online user snapshot", "err", err)
		}

		for {
			select {
			case <-ticker.C:
				if err := userService.RecordOnlineUserSnapshot(); err != nil {
					slog.Error("Failed to record online user snapshot", "err", err)
				}
			case <-ctx.Done():
				slog.Info("Online user snapshot task stopped")
				return
			}
		}
	})

	// 每 5 分钟回填 seo_papers.sitemap_page（新插入行首次 page=0，事后按 id 区间修正）
	if seoService != nil {
		safego.Go("seo-sitemap-reconcile", func() {
			ticker := time.NewTicker(5 * time.Minute)
			defer ticker.Stop()

			slog.Info("SEO sitemap reconcile task started")

			// 启动时先跑一次，让历史回填能立刻生效
			if err := seoService.ReconcileSitemapPages(); err != nil {
				slog.Error("Failed initial SEO sitemap reconcile", "err", err)
			}

			for {
				select {
				case <-ticker.C:
					if err := seoService.ReconcileSitemapPages(); err != nil {
						slog.Error("Failed SEO sitemap reconcile", "err", err)
					}
				case <-ctx.Done():
					slog.Info("SEO sitemap reconcile task stopped")
					return
				}
			}
		})
	}
}

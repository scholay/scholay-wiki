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
)

// userSnapshotRecorder 用于记录在线用户快照的接口
type userSnapshotRecorder interface {
	RecordOnlineUserSnapshot() error
}

// startBackgroundTasks 启动所有后台任务
func startBackgroundTasks(ctx context.Context, userService userSnapshotRecorder) {
	// 数据库连接池监控
	database.StartConnectionPoolMonitoring(ctx, 5*time.Minute)

	// 每 5 分钟记录在线用户快照
	go func() {
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
	}()
}

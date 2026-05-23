// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cleanup

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/hotcontent"

	"gorm.io/gorm"
)

// CleanupService handles periodic database cleanup tasks
type CleanupService struct {
	db                *gorm.DB
	ctx               context.Context
	cancel            context.CancelFunc
	hotContentService *hotcontent.Service
}

// NewCleanupService creates a new cleanup service
func NewCleanupService(db *gorm.DB) *CleanupService {
	ctx, cancel := context.WithCancel(context.Background())
	return &CleanupService{
		db:     db,
		ctx:    ctx,
		cancel: cancel,
	}
}

// SetHotContentService 设置热门内容服务
func (s *CleanupService) SetHotContentService(service *hotcontent.Service) {
	s.hotContentService = service
}

// Start starts all cleanup tasks as background goroutines
func (s *CleanupService) Start() {
	slog.Info("Starting cleanup service")

	safego.Go("cleanup-old-usage-logs", func() {
		s.runDaily("old_usage_logs", 4, 0, s.cleanOldUsageLogs)
	})
	safego.Go("cleanup-hot-content", func() {
		s.runDaily("hot_content", 4, 30, s.cleanHotContent)
	})

	slog.Info("Cleanup service started")
}

// Stop gracefully stops all cleanup tasks
func (s *CleanupService) Stop() {
	slog.Info("Stopping cleanup service")
	s.cancel()
	slog.Info("Cleanup service stopped")
}

// runPeriodic runs a cleanup task at regular intervals
func (s *CleanupService) runPeriodic(name string, interval time.Duration, task func() error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	if err := task(); err != nil {
		slog.Warn("Cleanup task failed", "task", name, "err", err)
	}

	for {
		select {
		case <-ticker.C:
			if err := task(); err != nil {
				slog.Warn("Cleanup task failed", "task", name, "err", err)
			}
		case <-s.ctx.Done():
			slog.Info("Cleanup task stopped", "task", name)
			return
		}
	}
}

// runDaily runs a cleanup task daily at a specific time
func (s *CleanupService) runDaily(name string, hour, minute int, task func() error) {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())

		// If the scheduled time has passed today, schedule for tomorrow
		if next.Before(now) {
			next = next.Add(24 * time.Hour)
		}

		duration := time.Until(next)
		slog.Info("Next cleanup scheduled", "task", name, "at", next.Format("2006-01-02 15:04:05"), "in", duration)

		timer := time.NewTimer(duration)
		select {
		case <-timer.C:
			if err := task(); err != nil {
				slog.Warn("Cleanup task failed", "task", name, "err", err)
			}
		case <-s.ctx.Done():
			timer.Stop()
			slog.Info("Cleanup task stopped", "task", name)
			return
		}
		timer.Stop()
	}
}

// cleanOldUsageLogs removes old usage logs based on configured retention period
// Uses batch deletion to avoid performance impact
func (s *CleanupService) cleanOldUsageLogs() error {
	// 获取配置的保留天数
	var retentionDays int
	err := s.db.Table("usage_log_config").
		Select("retention_days").
		Where("id = 1").
		Scan(&retentionDays).Error
	if err != nil || retentionDays == 0 {
		retentionDays = 180 // 默认180天
	}

	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)
	slog.Info("Starting cleanup of usage logs", "retentionDays", retentionDays, "before", cutoffTime.Format("2006-01-02"))

	// 分批删除参数
	const batchSize = 1000                    // 每批删除1000条
	const batchDelay = 100 * time.Millisecond // 批次间隔100ms

	var totalDeleted int64

	for {
		// 检查是否需要停止
		select {
		case <-s.ctx.Done():
			slog.Info("Usage logs cleanup interrupted", "deletedSoFar", totalDeleted)
			return nil
		default:
		}

		// 分批删除
		result := s.db.Exec(`
			DELETE FROM usage_logs 
			WHERE created_at < ? 
			ORDER BY created_at ASC 
			LIMIT ?
		`, cutoffTime, batchSize)

		if result.Error != nil {
			return fmt.Errorf("failed to clean old usage logs: %w", result.Error)
		}

		totalDeleted += result.RowsAffected

		// 如果删除的数量小于 batchSize，说明没有更多数据需要删除
		if result.RowsAffected < int64(batchSize) {
			break
		}

		// 批次间休眠，避免对数据库造成压力
		time.Sleep(batchDelay)
	}

	if totalDeleted > 0 {
		slog.Info("Cleaned old usage logs", "count", totalDeleted, "retentionDays", retentionDays)
	}

	return nil
}

// cleanHotContent removes old hot content data based on retention period and max records limit
func (s *CleanupService) cleanHotContent() error {
	if s.hotContentService == nil {
		slog.Warn("Hot content service not configured, skipping cleanup")
		return nil
	}

	slog.Info("Starting cleanup of hot content data", "retentionDays", hotcontent.HotContentRetentionDays, "maxRecords", hotcontent.HotContentMaxRecords)

	stats, err := s.hotContentService.Cleanup()
	if err != nil {
		return fmt.Errorf("failed to clean hot content: %w", err)
	}

	if stats.KeywordsDeleted > 0 || stats.PapersDeleted > 0 {
		slog.Info("Cleaned hot content", "keywordsDeleted", stats.KeywordsDeleted, "papersDeleted", stats.PapersDeleted)
	}

	return nil
}

// CleanOldUsageLogsNow runs the old usage logs cleanup immediately
func (s *CleanupService) CleanOldUsageLogsNow() error {
	slog.Info("Running manual cleanup: old usage logs")
	return s.cleanOldUsageLogs()
}

// GetCleanupStats returns statistics about data to be cleaned
func (s *CleanupService) GetCleanupStats() (map[string]any, error) {
	stats := make(map[string]any)

	// Count old usage logs
	var retentionDays int
	s.db.Table("usage_log_config").
		Select("retention_days").
		Where("id = 1").
		Scan(&retentionDays)
	if retentionDays == 0 {
		retentionDays = 180
	}

	var oldUsageLogsCount int64
	usageLogsCutoff := time.Now().AddDate(0, 0, -retentionDays)
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("usage_logs").
		Where("created_at < ?", usageLogsCutoff).
		Count(&oldUsageLogsCount).Error; err != nil {
		return nil, err
	}
	stats["old_usage_logs_count"] = oldUsageLogsCount
	stats["usage_logs_retention_days"] = retentionDays

	// Total usage logs count
	var totalUsageLogsCount int64
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("usage_logs").
		Count(&totalUsageLogsCount).Error; err != nil {
		return nil, err
	}
	stats["total_usage_logs_count"] = totalUsageLogsCount

	return stats, nil
}

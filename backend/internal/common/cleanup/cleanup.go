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
	"log"
	"time"

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
	log.Println("Starting cleanup service...")

	// Clean expired sessions every hour
	go s.runPeriodic("expired_sessions", 1*time.Hour, s.cleanExpiredSessions)

	// Clean old snapshots every day at 3 AM
	go s.runDaily("old_snapshots", 3, 0, s.cleanOldSnapshots)

	// Clean old usage logs every day at 4 AM
	go s.runDaily("old_usage_logs", 4, 0, s.cleanOldUsageLogs)

	// Clean hot content data every day at 4:30 AM
	go s.runDaily("hot_content", 4, 30, s.cleanHotContent)

	log.Println("✓ Cleanup service started")
}

// Stop gracefully stops all cleanup tasks
func (s *CleanupService) Stop() {
	log.Println("Stopping cleanup service...")
	s.cancel()
	log.Println("✓ Cleanup service stopped")
}

// runPeriodic runs a cleanup task at regular intervals
func (s *CleanupService) runPeriodic(name string, interval time.Duration, task func() error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Run immediately on start
	if err := task(); err != nil {
		log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
	}

	for {
		select {
		case <-ticker.C:
			if err := task(); err != nil {
				log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
			}
		case <-s.ctx.Done():
			log.Printf("Cleanup task '%s' stopped\n", name)
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
		log.Printf("Next '%s' cleanup scheduled at: %s (in %v)\n", name, next.Format("2006-01-02 15:04:05"), duration)

		// Use a timer with context cancellation support
		timer := time.NewTimer(duration)
		select {
		case <-timer.C:
			if err := task(); err != nil {
				log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
			}
		case <-s.ctx.Done():
			timer.Stop()
			log.Printf("Cleanup task '%s' stopped\n", name)
			return
		}
		timer.Stop()
	}
}

// cleanExpiredSessions removes expired user sessions
// Keeps sessions for 30 days after expiration for audit purposes
func (s *CleanupService) cleanExpiredSessions() error {
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)

	result := s.db.Exec(`
		DELETE FROM user_sessions
		WHERE expires_at < ?
	`, cutoffTime)

	if result.Error != nil {
		return fmt.Errorf("failed to clean expired sessions: %w", result.Error)
	}

	if result.RowsAffected > 0 {
		log.Printf("✓ Cleaned %d expired user sessions\n", result.RowsAffected)
	}

	return nil
}

// cleanOldSnapshots removes old online user snapshots
// Keeps only last 30 days of data
func (s *CleanupService) cleanOldSnapshots() error {
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)

	result := s.db.Exec(`
		DELETE FROM online_user_snapshots
		WHERE timestamp < ?
	`, cutoffTime)

	if result.Error != nil {
		return fmt.Errorf("failed to clean old snapshots: %w", result.Error)
	}

	if result.RowsAffected > 0 {
		log.Printf("✓ Cleaned %d old online user snapshots (older than 30 days)\n", result.RowsAffected)
	}

	return nil
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
	log.Printf("Starting cleanup of usage logs older than %d days (before %s)\n",
		retentionDays, cutoffTime.Format("2006-01-02"))

	// 分批删除参数
	const batchSize = 1000                    // 每批删除1000条
	const batchDelay = 100 * time.Millisecond // 批次间隔100ms

	var totalDeleted int64

	for {
		// 检查是否需要停止
		select {
		case <-s.ctx.Done():
			log.Printf("Usage logs cleanup interrupted, deleted %d records so far\n", totalDeleted)
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
		log.Printf("✓ Cleaned %d old usage logs (retention: %d days)\n", totalDeleted, retentionDays)
	}

	return nil
}

// cleanHotContent removes old hot content data based on retention period and max records limit
func (s *CleanupService) cleanHotContent() error {
	if s.hotContentService == nil {
		log.Println("Warning: hot content service not configured, skipping cleanup")
		return nil
	}

	log.Printf("Starting cleanup of hot content data (retention: %d days, max: %d records)\n",
		hotcontent.HotContentRetentionDays, hotcontent.HotContentMaxRecords)

	stats, err := s.hotContentService.Cleanup()
	if err != nil {
		return fmt.Errorf("failed to clean hot content: %w", err)
	}

	if stats.KeywordsDeleted > 0 || stats.PapersDeleted > 0 {
		log.Printf("✓ Cleaned hot content: keywords=%d, papers=%d\n",
			stats.KeywordsDeleted, stats.PapersDeleted)
	}

	return nil
}

// CleanExpiredSessionsNow runs the expired sessions cleanup immediately
func (s *CleanupService) CleanExpiredSessionsNow() error {
	log.Println("Running manual cleanup: expired sessions")
	return s.cleanExpiredSessions()
}

// CleanOldSnapshotsNow runs the old snapshots cleanup immediately
func (s *CleanupService) CleanOldSnapshotsNow() error {
	log.Println("Running manual cleanup: old snapshots")
	return s.cleanOldSnapshots()
}

// CleanOldUsageLogsNow runs the old usage logs cleanup immediately
func (s *CleanupService) CleanOldUsageLogsNow() error {
	log.Println("Running manual cleanup: old usage logs")
	return s.cleanOldUsageLogs()
}

// GetCleanupStats returns statistics about data to be cleaned
func (s *CleanupService) GetCleanupStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// Count expired sessions
	var expiredSessionsCount int64
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("user_sessions").
		Where("expires_at < ?", cutoffTime).
		Count(&expiredSessionsCount).Error; err != nil {
		return nil, err
	}
	stats["expired_sessions_count"] = expiredSessionsCount

	// Count old snapshots
	var oldSnapshotsCount int64
	snapshotCutoff := time.Now().Add(-30 * 24 * time.Hour)
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("online_user_snapshots").
		Where("timestamp < ?", snapshotCutoff).
		Count(&oldSnapshotsCount).Error; err != nil {
		return nil, err
	}
	stats["old_snapshots_count"] = oldSnapshotsCount

	// Total sessions count
	var totalSessionsCount int64
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("user_sessions").
		Count(&totalSessionsCount).Error; err != nil {
		return nil, err
	}
	stats["total_sessions_count"] = totalSessionsCount

	// Total snapshots count
	var totalSnapshotsCount int64
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("online_user_snapshots").
		Count(&totalSnapshotsCount).Error; err != nil {
		return nil, err
	}
	stats["total_snapshots_count"] = totalSnapshotsCount

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

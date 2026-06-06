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

	"scholar-backend/internal/agentbridge"
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

	// 归属表对账(self-heal):实体级 feature 的业务表 → agent_sessions 归属行补漏。
	agentReconciler  *agentbridge.Repository
	reconcileTargets []agentbridge.OwnerReconcileTarget
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

// SetAgentSessionReconciler 注入 agent_sessions 归属对账依赖。targets 列出各实体级 feature
// 的业务表来源(prism/peerreview)。两者都给齐才会启用对账任务。
func (s *CleanupService) SetAgentSessionReconciler(repo *agentbridge.Repository, targets []agentbridge.OwnerReconcileTarget) {
	s.agentReconciler = repo
	s.reconcileTargets = targets
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
	safego.Go("cleanup-old-usage-events", func() {
		s.runDaily("old_usage_events", 4, 15, s.cleanOldUsageEvents)
	})
	safego.Go("cleanup-old-llm-token-usage", func() {
		s.runDaily("old_llm_token_usage", 4, 20, s.cleanOldLLMTokenUsage)
	})

	// 归属表对账(self-heal):启动先跑一次(补上部署间隙/历史漂移),之后每天 04:35 兜底。
	if s.agentReconciler != nil && len(s.reconcileTargets) > 0 {
		safego.Go("reconcile-agent-session-owners", func() {
			if err := s.reconcileAgentSessionOwners(); err != nil {
				slog.Warn("Cleanup task failed", "task", "agent_session_owner_reconcile(boot)", "err", err)
			}
			s.runDaily("agent_session_owner_reconcile", 4, 35, s.reconcileAgentSessionOwners)
		})
	}

	slog.Info("Cleanup service started")
}

// reconcileAgentSessionOwners 把实体级 feature(prism/peerreview)业务表里有 agent 会话、
// 但归属表 agent_sessions 缺行/对不上的行补写回去(self-heal)。纯加法,不删任何行。
// 这是 best-effort 双写的兜底:漂移在这里被周期性扫平,支撑「对账清零后删 prism Trusted 后门」。
func (s *CleanupService) reconcileAgentSessionOwners() error {
	var totalFixed int64
	for _, t := range s.reconcileTargets {
		fixed, err := s.agentReconciler.ReconcileOwnerSessions(t)
		if err != nil {
			// 单个 target 失败不影响其它(best-effort 兜底任务)。
			slog.Warn("agent_sessions owner reconcile target failed",
				"feature", t.FeatureKey, "owner_kind", t.OwnerKind, "table", t.SourceTable, "err", err)
			continue
		}
		if fixed > 0 {
			slog.Warn("agent_sessions owner reconcile fixed drift",
				"feature", t.FeatureKey, "owner_kind", t.OwnerKind, "rows_affected", fixed)
		}
		totalFixed += fixed
	}
	if totalFixed == 0 {
		slog.Info("agent_sessions owner reconcile: no drift", "targets", len(s.reconcileTargets))
	}
	return nil
}

// Stop gracefully stops all cleanup tasks
func (s *CleanupService) Stop() {
	slog.Info("Stopping cleanup service")
	s.cancel()
	slog.Info("Cleanup service stopped")
}

// cleanOldUsageEvents 删除 usage_events (功能使用统计 v2) 中超过保留期的事件。
// 保留 365 天 (与 usagestat.RetentionDays 一致; 此处用字面值避免对 usagestat 的依赖)。
func (s *CleanupService) cleanOldUsageEvents() error {
	cutoff := time.Now().AddDate(0, 0, -365)
	result := s.db.Exec("DELETE FROM usage_events WHERE created_at < ?", cutoff)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		slog.Info("Cleaned old usage_events", "deleted", result.RowsAffected)
	}
	return nil
}

// cleanOldLLMTokenUsage 删除 llm_token_usage (统一 LLM token 账本, 一行一次调用) 中
// 超过保留期的行 —— per-call 表增长快, 不清会涨爆。保留 365 天 (与 llmusage.RetentionDays
// 一致; 此处用字面值避免对 llmusage 的依赖)。
func (s *CleanupService) cleanOldLLMTokenUsage() error {
	cutoff := time.Now().AddDate(0, 0, -365)
	result := s.db.Exec("DELETE FROM llm_token_usage WHERE created_at < ?", cutoff)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		slog.Info("Cleaned old llm_token_usage", "deleted", result.RowsAffected)
	}
	return nil
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

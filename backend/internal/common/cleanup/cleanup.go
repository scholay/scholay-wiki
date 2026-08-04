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

	// 临时经费过期清扫(注入 vip.WalletService.ExpireSweep,用函数型避免 import vip)。
	creditExpirer CreditExpireSweeper

	// 超时 pending 订单作废(注入 vip.OrderService.CancelStalePending)。
	pendingOrderCanceller PendingOrderCanceller

	// 升级满血「待兑现」补偿(注入 vip.Service.ReconcilePendingRefills):删锚遇 Redis 抖动失败后,
	// Redis 恢复时补删锚。用函数型避免 import vip。
	pendingRefillReconciler PendingRefillReconciler

	// 会员到期后的额度窗口对齐(注入 vip.Service.RealignExpiredMembershipWindows)。
	expiredWindowRealigner ExpiredMembershipWindowRealigner

	// 额度窗口 Redis↔MySQL 漂移对账 + 旧窗口清扫(注入 vip.Service,0103)。
	quotaWindowDriftChecker  QuotaWindowDriftChecker
	quotaWindowOrphanChecker QuotaWindowDriftChecker // 反向:Redis 有锚但 DB 无行
	quotaWindowPurger        QuotaWindowPurger
}

// CreditExpireSweeper 把已过期临时经费批次清零并写 expire 流水,返回清理批次数。
type CreditExpireSweeper func(now time.Time) (int, error)

// PendingOrderCanceller 把超过 ttl 仍 pending 的订单作废,返回作废数。
type PendingOrderCanceller func(ttl time.Duration) (int64, error)

// PendingRefillReconciler 补偿未兑现的升级满血(删锚),返回本轮成功条数。
type PendingRefillReconciler func(ctx context.Context) (int, error)

// ExpiredMembershipWindowRealigner 把「刚到期的会员」在高档期开的额度窗口作废,返回本轮处理条数。
// lookback 应明显大于调度间隔(重叠扫描无害,实现侧自带幂等判据)。用函数型避免 import vip。
type ExpiredMembershipWindowRealigner func(ctx context.Context, lookback time.Duration) (int, error)

// QuotaWindowDriftChecker 抽样比对额度窗口的 Redis anchor 与 MySQL 兜底副本,返回(检查数, 漂移数)。
// 只读不修 —— 它的职责是让「沉默的坏掉」变成「吵闹的坏掉」。
type QuotaWindowDriftChecker func(ctx context.Context, sample int) (int, int, error)

// QuotaWindowPurger 删除超过保留期的旧额度窗口行,返回删除行数。
type QuotaWindowPurger func(retainDays int) (int64, error)

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

// SetCreditExpirer 注入临时经费过期清扫(vip.WalletService.ExpireSweep)。给齐才会启用该日任务。
func (s *CleanupService) SetCreditExpirer(sweep CreditExpireSweeper) {
	s.creditExpirer = sweep
}

// SetPendingOrderCanceller 注入超时 pending 订单作废(vip.OrderService.CancelStalePending)。
func (s *CleanupService) SetPendingOrderCanceller(cancel PendingOrderCanceller) {
	s.pendingOrderCanceller = cancel
}

// SetPendingRefillReconciler 注入升级满血待兑现补偿(vip.Service.ReconcilePendingRefills)。
func (s *CleanupService) SetPendingRefillReconciler(fn PendingRefillReconciler) {
	s.pendingRefillReconciler = fn
}

// SetExpiredMembershipWindowRealigner 注入会员到期后的额度窗口对齐(vip.Service.RealignExpiredMembershipWindows)。
func (s *CleanupService) SetExpiredMembershipWindowRealigner(fn ExpiredMembershipWindowRealigner) {
	s.expiredWindowRealigner = fn
}

// SetQuotaWindowMaintainers 注入额度窗口副本的漂移对账与保留期清扫(vip.Service,0103)。
func (s *CleanupService) SetQuotaWindowMaintainers(drift, orphans QuotaWindowDriftChecker, purge QuotaWindowPurger) {
	s.quotaWindowDriftChecker = drift
	s.quotaWindowOrphanChecker = orphans
	s.quotaWindowPurger = purge
}

// Start starts all cleanup tasks as background goroutines
func (s *CleanupService) Start() {
	slog.Info("Starting cleanup service")

	safego.Go("cleanup-hot-content", func() {
		s.runDaily("hot_content", 4, 30, s.cleanHotContent)
	})
	safego.Go("cleanup-old-usage-events", func() {
		s.runDaily("old_usage_events", 4, 15, s.cleanOldUsageEvents)
	})
	safego.Go("cleanup-old-llm-token-usage", func() {
		s.runDaily("old_llm_token_usage", 4, 20, s.cleanOldLLMTokenUsage)
	})

	// 临时经费过期清扫:把已过期批次账面归零并写 expire 流水(余额读时本就按 now 过滤,
	// 这里是为了账本可对账 —— 否则用户账单里 temp 会跨过期界无解释下跌)。每天 04:25。
	if s.creditExpirer != nil {
		safego.Go("cleanup-expired-credits", func() {
			s.runDaily("expired_credits", 4, 25, s.cleanExpiredCredits)
		})
	}

	// 超时 pending 订单作废:网关 120m 关单后这些单永远不会再被履约,清掉防堆积 +
	// 防「逾期支付得到过期会员」(作废后用户须重新下单,新单按支付时刻重算窗口)。每天 04:45。
	if s.pendingOrderCanceller != nil {
		safego.Go("cleanup-stale-pending-orders", func() {
			s.runDaily("stale_pending_orders", 4, 45, s.cleanStalePendingOrders)
		})
	}

	// 升级满血待兑现补偿:删锚遇 Redis 抖动失败后落 DB 标记,这里每 2 分钟扫一次在 Redis 恢复后补删锚。
	// 高频短周期(而非每日)以缩短「续费付了钱却不满血」的窗口;正常无标记时一次轻量 SELECT,几乎零开销。
	if s.pendingRefillReconciler != nil {
		safego.Go("cleanup-pending-quota-refills", func() {
			s.runPeriodic("pending_quota_refill", 2*time.Minute, s.reconcilePendingRefills)
		})
	}

	// 会员到期 → 作废高档期开的额度窗口(审计 P1-2)。5 分钟一轮、回看 30 分钟:
	// 重叠扫描是有意的(容忍漏跑/重启),幂等由「只删早于到期时刻的锚」保证。
	// 到期这件事没有事件源(vip_expires_at 是惰性判定的),只能靠扫;5 分钟是「用户几乎无感」
	// 与「一次轻量 SELECT」之间的折中。
	if s.expiredWindowRealigner != nil {
		safego.Go("cleanup-expired-membership-windows", func() {
			s.runPeriodic("expired_membership_window", 5*time.Minute, s.realignExpiredMembershipWindows)
		})
	}

	// 额度窗口副本漂移对账(0103)。**这条任务存在的理由不是它能修什么,而是它每 15 分钟
	// 走一遍恢复路径依赖的那份数据。** 恢复路径本身平时不跑,真出事那天才第一次被执行 ——
	// 本仓库有两次「只在灾难时跑的代码长期是坏的」前科(flushTokenWatermark 的注释宣称它防
	// 优雅重启丢水位,而 SIGTERM 路径从不调用它;AddUsageCostOnly 带着「已接线」的注释却是
	// 零调用点的孤儿)。没有这条对账,「MySQL 副本其实一直没写进去」会安静地藏到出事那一刻。
	// 15 分钟 + 200 行抽样:一次 PK 前缀正序扫(user_id 游标轮转)+ **一次 pipeline** 取回全部 anchor。
	// ⚠️ 这句话此前写的是「一次带 LIMIT 的主键范围扫,开销可忽略」,而当时的实现是
	// `ORDER BY updated_at DESC`(该列无索引)—— LIMIT 根本下推不了,实际是二级索引 range +
	// 全量回表 + filesort,10 万在飞行实测 799ms~3.29s、推 512MB 冷页过 buffer pool。
	// **这句错注释正是那个问题在评审时被放过的原因**,留档提醒:注释声称的复杂度不等于真实计划,
	// 说「开销可忽略」之前先 EXPLAIN。
	if s.quotaWindowDriftChecker != nil {
		safego.Go("cleanup-quota-window-drift", func() {
			s.runPeriodic("quota_window_drift", 15*time.Minute, s.checkQuotaWindowDrift)
		})
	}
	// 反向对账(Redis 有活锚 → DB 应有行)。**不能与上面那条合并** —— 上面是 DB→Redis,
	// 结构上看不见「副本压根没写进去」这个形状,而那恰恰是这套持久化最该防的故障。
	if s.quotaWindowOrphanChecker != nil {
		safego.Go("cleanup-quota-window-orphans", func() {
			s.runPeriodic("quota_window_orphans", 15*time.Minute, s.checkQuotaWindowOrphans)
		})
	}
	// 旧窗口清扫:一行/用户/周,增长有界,但没有上界就是没有上界。每天 05:25。
	if s.quotaWindowPurger != nil {
		safego.Go("cleanup-quota-windows", func() {
			s.runDaily("quota_windows", 5, 25, s.purgeQuotaWindows)
		})
	}

	// 归属表对账(self-heal):启动先跑一次(补上部署间隙/历史漂移),之后每天 04:35 兜底。
	if s.agentReconciler != nil && len(s.reconcileTargets) > 0 {
		safego.Go("reconcile-agent-session-owners", func() {
			if err := s.reconcileAgentSessionOwners(); err != nil {
				slog.Warn("Cleanup task failed", "task", "agent_session_owner_reconcile(boot)", "err", err)
			}
			s.runDaily("agent_session_owner_reconcile", 4, 35, s.reconcileAgentSessionOwners)
		})
	}

	// 文献集:MinIO 孤儿 PDF 对账 reaper(05:00)+ 过期/撤销分享的子表清理(05:15)。
	s.startLibraryCleanupTasks()

	// agent 事件日志分区延展(性能审计 P0):把 agent_turn_events 的月度 RANGE 分区持续向后延展,
	// 防数据堆进 p_future(见迁移 0071)。迁移只在部署时延展一次;这里每天维持领先,即使长期不重部署
	// 也不会耗尽。启动先跑一次(补上部署间隙),之后每天 05:40。幂等(按分区名跳过已存在)。
	safego.Go("cleanup-agent-event-partitions", func() {
		if err := s.ensureAgentEventPartitions(); err != nil {
			slog.Warn("Cleanup task failed", "task", "agent_event_partitions(boot)", "err", err)
		}
		s.runDaily("agent_event_partitions", 5, 40, s.ensureAgentEventPartitions)
	})

	slog.Info("Cleanup service started")
}

// ensureAgentEventPartitions 延展 agent_turn_events 的未来月份分区(见 0000_utils.ensure_month_range_partitions)。
// 会话历史【永久保留、绝不删除】(产品要求):本任务只【延展】未来分区、【永不 DROP】分区,让永久增长的
// journal 始终按月分好区、保持可查与写入性能。零数据删除。
func (s *CleanupService) ensureAgentEventPartitions() error {
	// #nosec G202 -- 全为代码内常量,非用户输入。
	if err := s.db.Exec("CALL ensure_month_range_partitions('agent_turn_events', 15)").Error; err != nil {
		return err
	}
	return nil
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

// batchDeleteByCreatedAt 按 created_at 分批删除过期行 (LIMIT 1000 + 100ms 间隔)。
// 取代单条 `DELETE ... WHERE created_at < ?`：稳态每天只删一天量无所谓，但首次跨过保留期
// 边界或长时间停机恢复时，单语句可能删数百万行，生成巨大 undo/purge 积压、阻塞同表并发 INSERT。
// 分批 + created_at 索引对在线写入友好。
func (s *CleanupService) batchDeleteByCreatedAt(table string, cutoff time.Time) (int64, error) {
	const batchSize = 1000                    // 每批删除 1000 条
	const batchDelay = 100 * time.Millisecond // 批次间隔 100ms

	var totalDeleted int64
	for {
		select {
		case <-s.ctx.Done():
			return totalDeleted, nil
		default:
		}

		// #nosec G202 -- table 为代码内常量, 非用户输入
		result := s.db.Exec(
			"DELETE FROM "+table+" WHERE created_at < ? ORDER BY created_at ASC LIMIT ?",
			cutoff, batchSize,
		)
		if result.Error != nil {
			return totalDeleted, result.Error
		}
		totalDeleted += result.RowsAffected

		if result.RowsAffected < int64(batchSize) {
			break
		}
		time.Sleep(batchDelay)
	}
	return totalDeleted, nil
}

// cleanOldUsageEvents 删除 usage_events (功能使用统计 v2) 中超过保留期的事件。
// 保留 365 天 (与 usagestat.RetentionDays 一致; 此处用字面值避免对 usagestat 的依赖)。
func (s *CleanupService) cleanOldUsageEvents() error {
	cutoff := time.Now().AddDate(0, 0, -365)
	deleted, err := s.batchDeleteByCreatedAt("usage_events", cutoff)
	if err != nil {
		return err
	}
	if deleted > 0 {
		slog.Info("Cleaned old usage_events", "deleted", deleted)
	}
	return nil
}

// cleanOldLLMTokenUsage 删除 llm_token_usage (统一 LLM token 账本, 一行一次调用) 中
// 超过保留期的行 —— per-call 表增长快, 不清会涨爆。保留 365 天 (与 llmusage.RetentionDays
// 一致; 此处用字面值避免对 llmusage 的依赖)。
func (s *CleanupService) cleanOldLLMTokenUsage() error {
	cutoff := time.Now().AddDate(0, 0, -365)
	deleted, err := s.batchDeleteByCreatedAt("llm_token_usage", cutoff)
	if err != nil {
		return err
	}
	if deleted > 0 {
		slog.Info("Cleaned old llm_token_usage", "deleted", deleted)
	}
	return nil
}

// cleanExpiredCredits 调用注入的 ExpireSweep 把过期临时经费批次归零并留痕。
func (s *CleanupService) cleanExpiredCredits() error {
	if s.creditExpirer == nil {
		return nil
	}
	n, err := s.creditExpirer(time.Now())
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("Cleaned expired credit lots", "lots", n)
	}
	return nil
}

// cleanStalePendingOrders 作废超过 24h 仍 pending 的订单(网关 120m 已关单,此后永不履约)。
func (s *CleanupService) cleanStalePendingOrders() error {
	if s.pendingOrderCanceller == nil {
		return nil
	}
	n, err := s.pendingOrderCanceller(24 * time.Hour)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("Cancelled stale pending orders", "orders", n)
	}
	return nil
}

// reconcilePendingRefills 补偿升级满血待兑现(删锚遇 Redis 抖动失败后,Redis 恢复时补删锚)。
func (s *CleanupService) reconcilePendingRefills() error {
	if s.pendingRefillReconciler == nil {
		return nil
	}
	n, err := s.pendingRefillReconciler(s.ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("Reconciled pending quota refills", "count", n)
	}
	return nil
}

// realignExpiredMembershipWindows 把刚到期的会员在高档期开的额度窗口作废(审计 P1-2)。
func (s *CleanupService) realignExpiredMembershipWindows() error {
	if s.expiredWindowRealigner == nil {
		return nil
	}
	n, err := s.expiredWindowRealigner(s.ctx, 30*time.Minute)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("Realigned quota windows after membership expiry", "count", n)
	}
	return nil
}

// checkQuotaWindowDrift 抽样比对额度窗口的 Redis 与 MySQL 副本(0103)。只读、只告警。
func (s *CleanupService) checkQuotaWindowDrift() error {
	if s.quotaWindowDriftChecker == nil {
		return nil
	}
	checked, drift, err := s.quotaWindowDriftChecker(s.ctx, 200)
	if err != nil {
		return err
	}
	// 🔴 用 Info 不用 Debug。生产 logger 是 LevelInfo(common/logger/logger.go),Debug 不输出 ——
	// 那会让「健康(checked=200, drift=0)」与「这条任务其实什么都没查到(checked=0)」在生产日志里
	// **完全同形,都是 0 字节**。而 checked=0 恰恰是最该被看见的状态:它意味着兜底副本可能压根没在写。
	// 每 15 分钟一条 = 96 行/天,占 backend 日志总量(约 2.5 万行/天)的 0.4%,淹不掉任何东西。
	slog.Info("Checked quota window drift", "checked", checked, "drift", drift)
	return nil
}

// checkQuotaWindowOrphans 反向对账:Redis 有活锚但 MySQL 无行 = 副本没在写(0103)。
// 与上面那条方向相反且不可互相替代,理由见 vip.ReconcileQuotaWindowOrphans 的红字。
func (s *CleanupService) checkQuotaWindowOrphans() error {
	if s.quotaWindowOrphanChecker == nil {
		return nil
	}
	checked, missing, err := s.quotaWindowOrphanChecker(s.ctx, 200)
	if err != nil {
		return err
	}
	slog.Info("Checked quota window orphans", "checked", checked, "missing", missing)
	return nil
}

// purgeQuotaWindows 清扫超保留期的额度窗口副本行(0103)。
func (s *CleanupService) purgeQuotaWindows() error {
	if s.quotaWindowPurger == nil {
		return nil
	}
	n, err := s.quotaWindowPurger(400)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("Purged old quota windows", "rows", n)
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

// 注:原 CleanOldUsageLogsNow / GetCleanupStats 已随旧 usagelog(usage_logs v1)下线一并删除 ——
// 二者都零调用方,且 GetCleanupStats 只统计 usage_logs。usage_logs / usage_log_config 两张表
// 作为 stranded 历史数据保留(无代码读写,故也不再需要定期清理)。

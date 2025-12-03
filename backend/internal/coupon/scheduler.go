// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package coupon

import (
	"log"
	"time"
)

// Scheduler 定时任务调度器
type Scheduler struct {
	service *Service
	stopCh  chan struct{}
}

// NewScheduler 创建新的调度器
func NewScheduler(service *Service) *Scheduler {
	return &Scheduler{
		service: service,
		stopCh:  make(chan struct{}),
	}
}

// Start 启动调度器
func (s *Scheduler) Start() {
	log.Println("[Coupon Scheduler] Starting coupon scheduler...")

	// 启动过期券清理任务（每小时执行一次）
	go s.runExpireCouponsTask()

	// 启动月度优惠券发放任务（每天检查一次）
	go s.runMonthlyDistributionTask()

	// 启动定期批次执行任务（每10分钟检查一次）
	go s.runScheduledBatchTask()

	log.Println("[Coupon Scheduler] Coupon scheduler started successfully")
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	close(s.stopCh)
	log.Println("[Coupon Scheduler] Coupon scheduler stopped")
}

// runExpireCouponsTask 运行过期券清理任务
func (s *Scheduler) runExpireCouponsTask() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	// 立即执行一次
	s.executeExpireCoupons()

	for {
		select {
		case <-ticker.C:
			s.executeExpireCoupons()
		case <-s.stopCh:
			return
		}
	}
}

// executeExpireCoupons 执行过期券清理
func (s *Scheduler) executeExpireCoupons() {
	count, err := s.service.ExpireOutdatedCoupons()
	if err != nil {
		log.Printf("[Coupon Scheduler] Failed to expire coupons: %v", err)
		return
	}
	if count > 0 {
		log.Printf("[Coupon Scheduler] Expired %d coupons", count)
	}
}

// runMonthlyDistributionTask 运行月度优惠券发放任务
func (s *Scheduler) runMonthlyDistributionTask() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// 立即执行一次检查
	s.executeMonthlyDistribution()

	for {
		select {
		case <-ticker.C:
			s.executeMonthlyDistribution()
		case <-s.stopCh:
			return
		}
	}
}

// executeMonthlyDistribution 执行月度优惠券发放
func (s *Scheduler) executeMonthlyDistribution() {
	now := time.Now()

	// 检查是否是每月1号
	if now.Day() != 1 {
		return
	}

	log.Println("[Coupon Scheduler] Executing monthly coupon distribution...")

	// 获取所有标记为月度自动发放的模板
	templates, err := s.service.GetAutoDistributionTemplates("monthly")
	if err != nil {
		log.Printf("[Coupon Scheduler] Failed to get monthly templates: %v", err)
		return
	}

	if len(templates) == 0 {
		log.Println("[Coupon Scheduler] No monthly distribution templates found")
		return
	}

	// 为每个模板创建批次并执行
	for _, template := range templates {
		if template.Status != TemplateStatusActive {
			continue
		}

		// 创建月度发放批次
		batchName := time.Now().Format("2006年1月月度优惠券")
		batch, err := s.service.CreateBatch(
			template.ID,
			batchName,
			"all", // 发放给所有用户
			0,     // 不限制数量
			0,     // 系统自动创建
		)
		if err != nil {
			log.Printf("[Coupon Scheduler] Failed to create monthly batch for template %d: %v", template.ID, err)
			continue
		}

		// 执行批次发放
		if err := s.service.ExecuteBatch(batch.ID); err != nil {
			log.Printf("[Coupon Scheduler] Failed to execute monthly batch %d: %v", batch.ID, err)
			continue
		}

		log.Printf("[Coupon Scheduler] Successfully distributed monthly coupons for template %s (batch: %d)", template.Name, batch.ID)
	}
}

// runScheduledBatchTask 运行定时批次任务
func (s *Scheduler) runScheduledBatchTask() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	// 立即执行一次
	s.executeScheduledBatches()

	for {
		select {
		case <-ticker.C:
			s.executeScheduledBatches()
		case <-s.stopCh:
			return
		}
	}
}

// executeScheduledBatches 执行定时批次
func (s *Scheduler) executeScheduledBatches() {
	batches, err := s.service.GetScheduledBatches()
	if err != nil {
		log.Printf("[Coupon Scheduler] Failed to get scheduled batches: %v", err)
		return
	}

	now := time.Now()
	for _, batch := range batches {
		// 检查是否到达执行时间
		if batch.ScheduledAt != nil && batch.ScheduledAt.Before(now) {
			log.Printf("[Coupon Scheduler] Executing scheduled batch %d (%s)", batch.ID, batch.Name)

			if err := s.service.ExecuteBatch(batch.ID); err != nil {
				log.Printf("[Coupon Scheduler] Failed to execute scheduled batch %d: %v", batch.ID, err)
			} else {
				log.Printf("[Coupon Scheduler] Successfully executed scheduled batch %d", batch.ID)
			}
		}
	}
}

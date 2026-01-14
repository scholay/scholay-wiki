package currency

import (
	"log"

	"github.com/robfig/cron/v3"
)

// CronScheduler 定时任务调度器
// 使用 robfig/cron 库实现稳定的定时任务调度
type CronScheduler struct {
	cron               *cron.Cron
	membershipGiftSvc  *MembershipGiftService
}

// NewCronScheduler 创建定时任务调度器
func NewCronScheduler(membershipGiftSvc *MembershipGiftService) *CronScheduler {
	// 创建 cron 实例，使用秒级精度
	c := cron.New(cron.WithSeconds())

	return &CronScheduler{
		cron:              c,
		membershipGiftSvc: membershipGiftSvc,
	}
}

// Start 启动定时任务调度器
func (s *CronScheduler) Start() error {
	// 注册定时任务

	// 每月1号凌晨0点执行会员经费发放和非会员经费清空
	// cron 表达式: 秒 分 时 日 月 周
	// "0 0 0 1 * *" = 每月1号 00:00:00
	_, err := s.cron.AddFunc("0 0 0 1 * *", func() {
		log.Println("[CronScheduler] Monthly membership gift task triggered")
		s.membershipGiftSvc.ExecuteMonthlyTasks()
	})
	if err != nil {
		log.Printf("[CronScheduler] Failed to add monthly gift task: %v", err)
		return err
	}
	log.Println("[CronScheduler] Registered monthly membership gift task: 0 0 0 1 * * (every 1st day at 00:00)")

	// 每天00:00执行每日清空任务（宽限期结束清空）
	// cron 表达式: "0 0 0 * * *" = 每天 00:00:00
	_, err = s.cron.AddFunc("0 0 0 * * *", func() {
		log.Println("[CronScheduler] Daily clear task triggered")
		s.membershipGiftSvc.ExecuteDailyClearTasks()
	})
	if err != nil {
		log.Printf("[CronScheduler] Failed to add daily clear task: %v", err)
		return err
	}
	log.Println("[CronScheduler] Registered daily clear task: 0 0 0 * * * (every day at 00:00)")

	// 每天09:00执行每日提醒检查
	// cron 表达式: "0 0 9 * * *" = 每天 09:00:00
	_, err = s.cron.AddFunc("0 0 9 * * *", func() {
		log.Println("[CronScheduler] Daily reminder task triggered")
		s.membershipGiftSvc.ExecuteDailyReminders()
	})
	if err != nil {
		log.Printf("[CronScheduler] Failed to add daily reminder task: %v", err)
		return err
	}
	log.Println("[CronScheduler] Registered daily reminder task: 0 0 9 * * * (every day at 09:00)")

	// 启动 cron 调度器
	s.cron.Start()
	log.Println("[CronScheduler] Cron scheduler started")

	// 打印所有已注册的任务
	entries := s.cron.Entries()
	log.Printf("[CronScheduler] Total registered tasks: %d", len(entries))
	for i, entry := range entries {
		log.Printf("[CronScheduler] Task %d: Next run at %s", i+1, entry.Next.Format("2006-01-02 15:04:05"))
	}

	return nil
}

// Stop 停止定时任务调度器
func (s *CronScheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Println("[CronScheduler] Cron scheduler stopped")
}

// TriggerMonthlyTaskNow 立即触发月度任务（用于测试或手动补发）
func (s *CronScheduler) TriggerMonthlyTaskNow() {
	log.Println("[CronScheduler] Manually triggering monthly membership gift task")
	s.membershipGiftSvc.ExecuteMonthlyTasks()
}

// TriggerDailyRemindersNow 立即触发每日提醒任务（用于测试）
func (s *CronScheduler) TriggerDailyRemindersNow() {
	log.Println("[CronScheduler] Manually triggering daily reminders task")
	s.membershipGiftSvc.ExecuteDailyReminders()
}

// TriggerDailyClearTasksNow 立即触发每日清空任务（用于测试）
func (s *CronScheduler) TriggerDailyClearTasksNow() {
	log.Println("[CronScheduler] Manually triggering daily clear tasks")
	s.membershipGiftSvc.ExecuteDailyClearTasks()
}

// GetNextRunTime 获取下次执行时间
func (s *CronScheduler) GetNextRunTime() string {
	entries := s.cron.Entries()
	if len(entries) == 0 {
		return "No tasks registered"
	}
	return entries[0].Next.Format("2006-01-02 15:04:05")
}

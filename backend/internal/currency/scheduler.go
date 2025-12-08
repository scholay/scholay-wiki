package currency

import (
	"context"
	"log"
	"sync"
	"time"
)

// SubscriptionGetter 获取活跃订阅信息的函数类型
type SubscriptionGetter func(planCodes []string) ([]MemberSubscription, error)

// ExpiredMemberGetter 获取过期会员信息的函数类型
// graceDays: 宽限期天数，返回过期超过该天数的用户
type ExpiredMemberGetter func(graceDays int) ([]ExpiredMember, error)

// MemberSubscription 会员订阅信息
type MemberSubscription struct {
	UserID   uint
	PlanCode string
}

// ExpiredMember 过期会员信息
type ExpiredMember struct {
	UserID     uint
	PlanCode   string    // 原会员类型
	ExpiredAt  time.Time // 过期时间
}

// MembershipGiftScheduler 会员赠送定时任务调度器
type MembershipGiftScheduler struct {
	currencyService     *Service
	getSubscriptions    SubscriptionGetter
	getExpiredMembers   ExpiredMemberGetter
	stopCh              chan struct{}
	wg                  sync.WaitGroup
	lastGiftMonth       string // 记录上次赠送的月份，防止重复赠送
	mu                  sync.Mutex
}

const (
	// GracePeriodDays 会员过期后的宽限期天数
	GracePeriodDays = 7
)

// NewMembershipGiftScheduler 创建会员赠送调度器
func NewMembershipGiftScheduler(currencyService *Service, getSubscriptions SubscriptionGetter) *MembershipGiftScheduler {
	return &MembershipGiftScheduler{
		currencyService:  currencyService,
		getSubscriptions: getSubscriptions,
		stopCh:           make(chan struct{}),
	}
}

// SetExpiredMemberGetter 设置过期会员获取函数
func (s *MembershipGiftScheduler) SetExpiredMemberGetter(getter ExpiredMemberGetter) {
	s.getExpiredMembers = getter
}

// Start 启动定时任务
func (s *MembershipGiftScheduler) Start() {
	s.wg.Add(1)
	go s.runScheduler()
	log.Println("Membership gift scheduler started")
}

// Stop 停止定时任务
func (s *MembershipGiftScheduler) Stop() {
	close(s.stopCh)
	s.wg.Wait()
	log.Println("Membership gift scheduler stopped")
}

// runScheduler 运行调度器
func (s *MembershipGiftScheduler) runScheduler() {
	defer s.wg.Done()

	// 服务启动时检查一次（用于服务重启后的补发）
	s.checkMonthlyTasks()

	// 计算到下一个凌晨1点的等待时间
	now := time.Now()
	next := time.Date(now.Year(), now.Month(), now.Day()+1, 1, 0, 0, 0, now.Location())
	waitDuration := next.Sub(now)

	log.Printf("Membership scheduler: next check at %s (in %v)", next.Format("2006-01-02 15:04:05"), waitDuration)

	// 等待到第一个凌晨1点
	select {
	case <-time.After(waitDuration):
		s.checkMonthlyTasks()
	case <-s.stopCh:
		return
	}

	// 之后每24小时检查一次（每天凌晨1点）
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkMonthlyTasks()
		case <-s.stopCh:
			return
		}
	}
}

// checkMonthlyTasks 检查并执行任务
func (s *MembershipGiftScheduler) checkMonthlyTasks() {
	now := time.Now()
	day := now.Day()

	// 每月1日：赠送会员金币/钻石
	if day == 1 {
		s.checkAndGift()
	}

	// 每天检查：清空过期超过宽限期的会员金币
	s.checkAndClearExpired()
}

// checkAndGift 检查并执行赠送（仅在每月1日执行）
func (s *MembershipGiftScheduler) checkAndGift() {
	now := time.Now()
	currentMonth := now.Format("2006-01")

	s.mu.Lock()
	// 检查本月是否已经赠送过
	if s.lastGiftMonth == currentMonth {
		s.mu.Unlock()
		log.Printf("Membership gift: %s already processed, skipping", currentMonth)
		return
	}
	s.lastGiftMonth = currentMonth
	s.mu.Unlock()

	log.Printf("Starting monthly membership gift for %s", currentMonth)
	s.executeMonthlyGift(currentMonth)
}

// checkAndClearExpired 检查并清空过期会员金币（每天执行）
func (s *MembershipGiftScheduler) checkAndClearExpired() {
	today := time.Now().Format("2006-01-02")
	log.Printf("Checking expired membership gold clear for %s (grace period: %d days)", today, GracePeriodDays)
	s.executeExpiredClear(today)
}

// executeMonthlyGift 执行月度赠送
func (s *MembershipGiftScheduler) executeMonthlyGift(month string) {
	if s.getSubscriptions == nil {
		log.Println("Warning: subscription getter not set, skipping monthly gift")
		return
	}

	// 获取所有 pro 和 max 会员
	subscriptions, err := s.getSubscriptions([]string{"pro", "max"})
	if err != nil {
		log.Printf("Failed to get active subscriptions: %v", err)
		return
	}

	ctx := context.Background()
	successCount := 0
	failCount := 0

	for _, sub := range subscriptions {
		// 月度赠送不减半
		_, err := s.currencyService.GiftMembershipReward(ctx, sub.UserID, sub.PlanCode, false, "membership_monthly", month)
		if err != nil {
			log.Printf("Failed to gift membership reward to user %d: %v", sub.UserID, err)
			failCount++
		} else {
			successCount++
		}
	}

	log.Printf("Monthly membership gift completed for %s: success=%d, failed=%d", month, successCount, failCount)
}

// executeExpiredClear 执行过期会员金币清空
func (s *MembershipGiftScheduler) executeExpiredClear(month string) {
	if s.getExpiredMembers == nil {
		log.Println("Warning: expired member getter not set, skipping gold clear")
		return
	}

	// 获取过期超过宽限期的会员
	expiredMembers, err := s.getExpiredMembers(GracePeriodDays)
	if err != nil {
		log.Printf("Failed to get expired members: %v", err)
		return
	}

	if len(expiredMembers) == 0 {
		log.Printf("No expired members to clear gold for %s", month)
		return
	}

	ctx := context.Background()
	successCount := 0
	failCount := 0
	totalCleared := int64(0)

	for _, member := range expiredMembers {
		// 获取用户当前金币余额
		wallet, err := s.currencyService.GetWallet(member.UserID)
		if err != nil {
			log.Printf("Failed to get wallet for user %d: %v", member.UserID, err)
			failCount++
			continue
		}

		// 如果没有金币，跳过
		if wallet.Gold <= 0 {
			continue
		}

		// 清空金币（扣除全部金币）
		bizID := generateBizID("membership_expired_clear", member.UserID)
		desc := "会员过期金币清空"
		_, err = s.currencyService.doTransaction(ctx, member.UserID, CurrencyGold, -wallet.Gold, TxTypeDeduct,
			"membership_expired", bizID, desc)
		if err != nil {
			log.Printf("Failed to clear gold for user %d: %v", member.UserID, err)
			failCount++
		} else {
			successCount++
			totalCleared += wallet.Gold
			log.Printf("Cleared %d gold from user %d (expired at: %s, days since: %d)",
				wallet.Gold, member.UserID, member.ExpiredAt.Format("2006-01-02"), 
				int(time.Since(member.ExpiredAt).Hours()/24))
		}
	}

	log.Printf("Expired membership gold clear completed for %s: cleared=%d users, total_gold=%d, failed=%d",
		month, successCount, totalCleared, failCount)
}

// GiftOnActivation 开通会员时的即时赠送
// 根据开通日期决定是否半额赠送
// 返回 any 类型以兼容 order.MembershipGiftService 接口
func (s *MembershipGiftScheduler) GiftOnActivation(userID uint, planCode string) (any, error) {
	if planCode != "pro" && planCode != "max" {
		return nil, nil // 非付费会员不赠送
	}

	ctx := context.Background()
	now := time.Now()
	month := now.Format("2006-01")
	isHalf := now.Day() > 15

	return s.currencyService.GiftMembershipReward(ctx, userID, planCode, isHalf, "membership_activate", month)
}


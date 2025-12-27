package currency

import (
	"context"
	"fmt"
	"log"
	"time"

	"scholar-backend/internal/common/cache"
)

// MessageService 消息服务接口（用于发送站内信）
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

const (
	// 分布式锁相关常量（用于月度任务）
	lockKeyMonthlyGift  = "lock:membership:monthly_gift:%s"  // %s = 月份 (2006-01)
	lockKeyMonthlyClear = "lock:membership:monthly_clear:%s" // %s = 月份 (2006-01)
	monthlyLockExpiration = 30 * time.Minute                 // 月度任务锁过期时间
)

// MemberSubscription 会员订阅信息
type MemberSubscription struct {
	UserID   uint
	PlanCode string
}

// ExpiredMember 过期会员信息（已废弃，保留兼容）
type ExpiredMember struct {
	UserID    uint
	PlanCode  string    // 原会员类型
	ExpiredAt time.Time // 过期时间
}

// NonMember 非会员用户信息
type NonMember struct {
	UserID              uint
	Gold                int64
	LastSubscriptionEnd *time.Time // 最后一次订阅结束时间，可能为空（从未开通过）
}

// SubscriptionGetter 获取活跃订阅信息的函数类型
type SubscriptionGetter func(planCodes []string) ([]MemberSubscription, error)

// ExpiredMemberGetter 获取过期会员信息的函数类型（已废弃）
type ExpiredMemberGetter func(graceDays int) ([]ExpiredMember, error)

// NonMemberGetter 获取非会员用户信息的函数类型
// 返回所有当前没有活跃 pro/max 订阅且有经费的用户
type NonMemberGetter func() ([]NonMember, error)

// MemberInGracePeriod 宽限期内的会员信息
type MemberInGracePeriod struct {
	UserID    uint
	Gold      int64
	ExpiredAt *time.Time // 会员过期时间
}

// MembersInGracePeriodGetter 获取宽限期内会员的函数类型
type MembersInGracePeriodGetter func(graceDays int) ([]MemberInGracePeriod, error)

// NonMembersAfterGraceGetter 获取超过宽限期的非会员的函数类型
type NonMembersAfterGraceGetter func(graceDays int) ([]NonMember, error)

// MembershipGiftService 会员经费发放业务服务
// 负责处理会员经费/恩特币的发放和清空逻辑
// 与定时任务调度器解耦，可以被定时任务或其他方式调用
type MembershipGiftService struct {
	currencyService          *Service
	messageService           MessageService
	getSubscriptions         SubscriptionGetter
	getExpiredMembers        ExpiredMemberGetter        // 已废弃，保留兼容
	getNonMembers            NonMemberGetter            // 已废弃，使用 getNonMembersAfterGrace
	getMembersInGracePeriod  MembersInGracePeriodGetter // 获取宽限期内的会员
	getNonMembersAfterGrace  NonMembersAfterGraceGetter // 获取超过宽限期的非会员
}

// NewMembershipGiftService 创建会员经费业务服务
func NewMembershipGiftService(currencyService *Service) *MembershipGiftService {
	return &MembershipGiftService{
		currencyService: currencyService,
	}
}

// SetSubscriptionGetter 设置订阅获取函数
func (s *MembershipGiftService) SetSubscriptionGetter(getter SubscriptionGetter) {
	s.getSubscriptions = getter
}

// SetExpiredMemberGetter 设置过期会员获取函数（已废弃，保留兼容）
func (s *MembershipGiftService) SetExpiredMemberGetter(getter ExpiredMemberGetter) {
	s.getExpiredMembers = getter
}

// SetNonMemberGetter 设置非会员用户获取函数（已废弃，使用 SetNonMembersAfterGraceGetter）
func (s *MembershipGiftService) SetNonMemberGetter(getter NonMemberGetter) {
	s.getNonMembers = getter
}

// SetMembersInGracePeriodGetter 设置宽限期内会员获取函数
func (s *MembershipGiftService) SetMembersInGracePeriodGetter(getter MembersInGracePeriodGetter) {
	s.getMembersInGracePeriod = getter
}

// SetNonMembersAfterGraceGetter 设置超过宽限期的非会员获取函数
func (s *MembershipGiftService) SetNonMembersAfterGraceGetter(getter NonMembersAfterGraceGetter) {
	s.getNonMembersAfterGrace = getter
}

// SetMessageService 设置消息服务（用于发送站内信通知）
func (s *MembershipGiftService) SetMessageService(ms MessageService) {
	s.messageService = ms
}

// ExecuteMonthlyTasks 执行每月1号的任务
// 包括：1. 发放会员经费/恩特币  2. 清空非会员用户经费
// 使用分布式锁保证多实例部署时的并发安全
func (s *MembershipGiftService) ExecuteMonthlyTasks() {
	now := time.Now()
	month := now.Format("2006-01")
	ctx := context.Background()

	log.Printf("[MembershipGift] Starting monthly tasks for %s", month)

	// 1. 发放会员经费/恩特币（带分布式锁）
	giftLockKey := fmt.Sprintf(lockKeyMonthlyGift, month)
	acquired, err := cache.SetNX(ctx, giftLockKey, "1", monthlyLockExpiration)
	if err != nil {
		log.Printf("[MembershipGift] Failed to acquire gift lock: %v", err)
	} else if acquired {
		log.Printf("[MembershipGift] Acquired gift lock for %s", month)
		s.GiftToAllMembers(month)
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		log.Printf("[MembershipGift] Gift task already running or completed for %s, skipping", month)
	}

	// 2. 处理宽限期内的会员（发送提醒站内信）
	graceLockKey := fmt.Sprintf("lock:membership:grace_notify:%s", month)
	acquired, err = cache.SetNX(ctx, graceLockKey, "1", monthlyLockExpiration)
	if err != nil {
		log.Printf("[MembershipGift] Failed to acquire grace notify lock: %v", err)
	} else if acquired {
		log.Printf("[MembershipGift] Acquired grace notify lock for %s", month)
		s.NotifyMembersInGracePeriod()
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		log.Printf("[MembershipGift] Grace notify task already running or completed for %s, skipping", month)
	}

	// 3. 清空超过宽限期的非会员用户经费（带分布式锁）
	clearLockKey := fmt.Sprintf(lockKeyMonthlyClear, month)
	acquired, err = cache.SetNX(ctx, clearLockKey, "1", monthlyLockExpiration)
	if err != nil {
		log.Printf("[MembershipGift] Failed to acquire clear lock: %v", err)
	} else if acquired {
		log.Printf("[MembershipGift] Acquired clear lock for %s", month)
		s.ClearNonMembersGold()
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		log.Printf("[MembershipGift] Clear task already running or completed for %s, skipping", month)
	}

	log.Printf("[MembershipGift] Monthly tasks completed for %s", month)
}

// GiftToAllMembers 给所有会员发放经费/恩特币
func (s *MembershipGiftService) GiftToAllMembers(month string) {
	if s.getSubscriptions == nil {
		log.Println("[MembershipGift] Warning: subscription getter not set, skipping monthly gift")
		return
	}

	log.Printf("[MembershipGift] Starting to gift all members for %s", month)

	// 获取所有 pro 和 max 会员
	subscriptions, err := s.getSubscriptions([]string{"pro", "max"})
	if err != nil {
		log.Printf("[MembershipGift] Failed to get active subscriptions: %v", err)
		return
	}

	log.Printf("[MembershipGift] Found %d active subscriptions", len(subscriptions))

	ctx := context.Background()
	successCount := 0
	failCount := 0
	skipCount := 0

	for _, sub := range subscriptions {
		// 月度赠送不减半
		result, err := s.currencyService.GiftMembershipReward(ctx, sub.UserID, sub.PlanCode, false, "membership_monthly", month)
		if err != nil {
			if err.Error() == "本月已发放过会员经费" {
				skipCount++
				log.Printf("[MembershipGift] User %d already received gift this month, skipping", sub.UserID)
			} else {
				log.Printf("[MembershipGift] Failed to gift user %d: %v", sub.UserID, err)
				failCount++
			}
		} else {
			successCount++
			log.Printf("[MembershipGift] Gifted user %d: gold=%d, diamond=%d", sub.UserID, result.GoldAmount, result.DiamondAmount)
			
			// 发送站内信通知
			s.sendMonthlyGiftNotification(sub.UserID, sub.PlanCode, result, month)
		}
	}

	log.Printf("[MembershipGift] Monthly gift completed for %s: success=%d, skipped=%d, failed=%d",
		month, successCount, skipCount, failCount)
}

// ClearNonMembersGold 清空超过宽限期的非会员用户的经费
// 包括：从未开通过会员的用户、会员已过期且超过宽限期的用户
func (s *MembershipGiftService) ClearNonMembersGold() {
	today := time.Now().Format("2006-01-02")
	log.Printf("[MembershipGift] Checking non-members to clear gold for %s", today)

	// 获取宽限期天数配置
	graceDays := s.getGraceDays()
	log.Printf("[MembershipGift] Using grace period of %d days", graceDays)

	var nonMembers []NonMember
	var err error

	// 优先使用支持宽限期的获取函数
	if s.getNonMembersAfterGrace != nil {
		nonMembers, err = s.getNonMembersAfterGrace(graceDays)
	} else if s.getNonMembers != nil {
		// 兼容旧的获取函数（不支持宽限期）
		log.Println("[MembershipGift] Warning: using legacy non-member getter without grace period support")
		nonMembers, err = s.getNonMembers()
	} else {
		log.Println("[MembershipGift] Warning: non-member getter not set, skipping gold clear")
		return
	}

	if err != nil {
		log.Printf("[MembershipGift] Failed to get non-members: %v", err)
		return
	}

	if len(nonMembers) == 0 {
		log.Printf("[MembershipGift] No non-members with gold to clear for %s", today)
		return
	}

	log.Printf("[MembershipGift] Found %d non-members with gold to process", len(nonMembers))

	ctx := context.Background()
	successCount := 0
	failCount := 0
	totalCleared := int64(0)

	for _, member := range nonMembers {
		// 清空经费（扣除全部经费）
		bizID := generateBizID("non_member_gold_clear", member.UserID)
		desc := "非会员经费清空"
		_, err = s.currencyService.doTransaction(ctx, member.UserID, CurrencyGold, -member.Gold, TxTypeDeduct,
			"non_member_clear", bizID, desc)
		if err != nil {
			log.Printf("[MembershipGift] Failed to clear gold for user %d: %v", member.UserID, err)
			failCount++
		} else {
			successCount++
			totalCleared += member.Gold
			if member.LastSubscriptionEnd != nil {
				log.Printf("[MembershipGift] Cleared %d gold from user %d (last subscription ended: %s)",
					member.Gold, member.UserID, member.LastSubscriptionEnd.Format("2006-01-02"))
			} else {
				log.Printf("[MembershipGift] Cleared %d gold from user %d (never had subscription)",
					member.Gold, member.UserID)
			}
			
			// 发送站内信通知
			s.sendGoldClearNotification(member.UserID, member.Gold)
		}
	}

	log.Printf("[MembershipGift] Non-member gold clear completed: cleared=%d users, total_gold=%d, failed=%d",
		successCount, totalCleared, failCount)
}

// GiftOnActivation 会员激活时发放经费（新开通会员时调用）
// userID: 用户ID
// planCode: 套餐代码 (pro/max)
// isNewActivation: 是否是新开通（true=新开通发放奖励，false=续费不发放）
func (s *MembershipGiftService) GiftOnActivation(userID uint, planCode string, isNewActivation bool) {
	if planCode != "pro" && planCode != "max" {
		return // 非付费会员不赠送
	}

	if !isNewActivation {
		log.Printf("[MembershipGift] User %d is renewing subscription, skip activation gift", userID)
		return // 续费不赠送
	}

	ctx := context.Background()
	now := time.Now()
	month := now.Format("2006-01")
	isHalf := now.Day() > 15

	log.Printf("[MembershipGift] Gifting activation reward to new member user %d, plan %s, month %s, isHalf %v",
		userID, planCode, month, isHalf)

	result, err := s.currencyService.GiftMembershipReward(ctx, userID, planCode, isHalf, "membership_activate", month)
	if err != nil {
		log.Printf("[MembershipGift] Warning: Failed to gift membership reward to user %d: %v", userID, err)
	} else {
		log.Printf("[MembershipGift] Activation reward gifted to user %d: gold=%d, diamond=%d",
			userID, result.GoldAmount, result.DiamondAmount)
		
		// 发送站内信通知
		s.sendActivationGiftNotification(userID, planCode, result, isHalf)
	}
}

// OnSubscriptionActivated 实现 ActivationCallback 接口
// 供 subscription.Service 在会员激活时回调
func (s *MembershipGiftService) OnSubscriptionActivated(userID uint, planCode string, isNewActivation bool) {
	s.GiftOnActivation(userID, planCode, isNewActivation)
}

// NotifyMembersInGracePeriod 通知宽限期内的会员
// 发送站内信提醒用户及时续费，宽限期内只发送一次
func (s *MembershipGiftService) NotifyMembersInGracePeriod() {
	if s.getMembersInGracePeriod == nil {
		log.Println("[MembershipGift] Warning: members in grace period getter not set, skipping grace notification")
		return
	}

	graceDays := s.getGraceDays()
	log.Printf("[MembershipGift] Checking members in grace period (grace days: %d)", graceDays)

	members, err := s.getMembersInGracePeriod(graceDays)
	if err != nil {
		log.Printf("[MembershipGift] Failed to get members in grace period: %v", err)
		return
	}

	if len(members) == 0 {
		log.Println("[MembershipGift] No members in grace period to notify")
		return
	}

	log.Printf("[MembershipGift] Found %d members in grace period to notify", len(members))

	successCount := 0
	for _, member := range members {
		s.sendGracePeriodNotification(member.UserID, member.Gold, member.ExpiredAt, graceDays)
		successCount++
	}

	log.Printf("[MembershipGift] Grace period notification completed: notified=%d users", successCount)
}

// getGraceDays 获取宽限期天数配置
func (s *MembershipGiftService) getGraceDays() int {
	graceDays, err := s.currencyService.GetCurrencyConfigAmount(ConfigKeyMembershipGraceDays)
	if err != nil || graceDays <= 0 {
		return 7 // 默认7天宽限期
	}
	return int(graceDays)
}

// ========== 站内信通知方法 ==========

// sendActivationGiftNotification 发送会员开通奖励站内信
func (s *MembershipGiftService) sendActivationGiftNotification(userID uint, planCode string, result *MembershipGiftResult, isHalf bool) {
	if s.messageService == nil {
		return
	}

	planName := "Pro"
	if planCode == "max" {
		planName = "Max"
	}

	title := "会员福利到账"
	var content string

	if result.DiamondAmount > 0 {
		content = fmt.Sprintf("恭喜您成为%s会员！\n\n本月会员福利已发放：\n- 经费：%d\n- 恩特币：%d\n\n感谢您的支持！",
			planName, result.GoldAmount, result.DiamondAmount)
	} else {
		content = fmt.Sprintf("恭喜您成为%s会员！\n\n本月会员福利已发放：\n- 经费：%d\n\n感谢您的支持！",
			planName, result.GoldAmount)
	}

	if isHalf {
		content += "\n\n（本月15日后开通，享受半月福利）"
	}

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "transaction", "/wallet", "查看钱包"); err != nil {
			log.Printf("[MembershipGift] Failed to send activation notification to user %d: %v", userID, err)
		}
	}()
}

// sendMonthlyGiftNotification 发送月度发放站内信
func (s *MembershipGiftService) sendMonthlyGiftNotification(userID uint, planCode string, result *MembershipGiftResult, month string) {
	if s.messageService == nil {
		return
	}

	planName := "Pro"
	if planCode == "max" {
		planName = "Max"
	}

	title := "会员月度福利到账"
	var content string

	if result.DiamondAmount > 0 {
		content = fmt.Sprintf("尊敬的%s会员，您的%s月度福利已发放：\n\n- 经费：%d\n- 恩特币：%d\n\n感谢您的支持！",
			planName, month, result.GoldAmount, result.DiamondAmount)
	} else {
		content = fmt.Sprintf("尊敬的%s会员，您的%s月度福利已发放：\n\n- 经费：%d\n\n感谢您的支持！",
			planName, month, result.GoldAmount)
	}

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "transaction", "/wallet", "查看钱包"); err != nil {
			log.Printf("[MembershipGift] Failed to send monthly gift notification to user %d: %v", userID, err)
		}
	}()
}

// sendGoldClearNotification 发送经费清空站内信
func (s *MembershipGiftService) sendGoldClearNotification(userID uint, clearedAmount int64) {
	if s.messageService == nil {
		return
	}

	title := "经费已清空"
	content := fmt.Sprintf("您的账户经费 %d 已于月初清空。\n\n经费为会员专属福利，开通会员即可获得每月经费发放。\n\n立即开通会员，享受更多权益！",
		clearedAmount)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "查看会员方案"); err != nil {
			log.Printf("[MembershipGift] Failed to send gold clear notification to user %d: %v", userID, err)
		}
	}()
}

// sendGracePeriodNotification 发送宽限期提醒站内信
func (s *MembershipGiftService) sendGracePeriodNotification(userID uint, gold int64, expiredAt *time.Time, graceDays int) {
	if s.messageService == nil {
		return
	}

	title := "会员已到期，经费即将清空"
	
	var expiredStr string
	var remainingDays int
	if expiredAt != nil {
		expiredStr = expiredAt.Format("2006年01月02日")
		// 计算剩余天数
		deadline := expiredAt.AddDate(0, 0, graceDays)
		remainingDays = int(time.Until(deadline).Hours() / 24)
		if remainingDays < 0 {
			remainingDays = 0
		}
	} else {
		expiredStr = "未知"
		remainingDays = graceDays
	}

	content := fmt.Sprintf("您的会员已于%s到期。\n\n您当前账户经费：%d\n\n为保障您的权益，我们提供 %d 天宽限期。宽限期内续费，经费将保留；超过宽限期未续费，经费将被清空。\n\n剩余宽限期：%d 天\n\n请及时续费，以免经费被清空！",
		expiredStr, gold, graceDays, remainingDays)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "立即续费"); err != nil {
			log.Printf("[MembershipGift] Failed to send grace period notification to user %d: %v", userID, err)
		}
	}()
}

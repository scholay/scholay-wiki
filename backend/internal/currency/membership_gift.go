package currency

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
)

// ErrAlreadyReceived 表示用户本月已领取过奖励
var ErrAlreadyReceived = errors.New("已发放过奖励")

// MessageService 消息服务接口（用于发送站内信）
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

const (
	// 分布式锁相关常量（用于月度任务）
	lockKeyMonthlyGift  = "lock:membership:monthly_gift:%s"  // %s = 月份 (2006-01)
	lockKeyMonthlyClear = "lock:membership:monthly_clear:%s" // %s = 月份 (2006-01)
	monthlyLockExpiration = 30 * time.Minute                 // 月度任务锁过期时间

	// 分布式锁相关常量（用于每日提醒，防止同月重复发送）
	lockKeyExpiryReminder      = "lock:reminder:expiry:%d:%s"       // 用户ID:月份 - 会员即将到期提醒
	lockKeyExpiredTodayReminder = "lock:reminder:expired_today:%d:%s" // 用户ID:日期 - 会员到期当天提醒
	lockKeyGraceEndingReminder = "lock:reminder:grace_ending:%d:%s" // 用户ID:月份 - 宽限期即将结束提醒
	lockKeyMonthEndReminder    = "lock:reminder:month_end:%d:%s"    // 用户ID:月份 - 月底清空提醒
	lockKeyGraceExpiredClear   = "lock:clear:grace_expired:%d:%s"   // 用户ID:日期 - 宽限期结束清空
	reminderLockExpiration     = 35 * 24 * time.Hour                // 35天，跨月后自动释放
	dailyLockExpiration        = 48 * time.Hour                     // 48小时，确保当天不重复
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

// ExpiringMember 即将到期的会员信息
type ExpiringMember struct {
	UserID   uint
	PlanCode string
	EndDate  *time.Time // 会员到期时间
}

// ExpiringMembersGetter 获取即将到期会员的函数类型
type ExpiringMembersGetter func(days int) ([]ExpiringMember, error)

// GracePeriodEndingMember 宽限期即将结束的会员信息
type GracePeriodEndingMember struct {
	UserID       uint
	Gold         int64
	ExpiredAt    *time.Time // 会员过期时间
	GraceEndDate *time.Time // 宽限期结束时间
}

// GracePeriodEndingGetter 获取宽限期即将结束会员的函数类型
type GracePeriodEndingGetter func(graceDays, reminderDays int) ([]GracePeriodEndingMember, error)

// NonMembersForMonthEndGetter 获取需要月底提醒的非会员的函数类型
type NonMembersForMonthEndGetter func(graceDays int) ([]NonMember, error)

// ExpiredTodayMember 今天到期的会员信息
type ExpiredTodayMember struct {
	UserID   uint
	PlanCode string
	EndDate  *time.Time // 会员到期时间
}

// ExpiredTodayMembersGetter 获取今天到期会员的函数类型
type ExpiredTodayMembersGetter func() ([]ExpiredTodayMember, error)

// GraceExpiredMember 宽限期刚结束的用户信息（昨天结束）
type GraceExpiredMember struct {
	UserID       uint
	Gold         int64
	GraceEndDate *time.Time // 宽限期结束时间
}

// GraceExpiredMembersGetter 获取宽限期刚结束用户的函数类型
type GraceExpiredMembersGetter func(graceDays int) ([]GraceExpiredMember, error)

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
	// 每日提醒相关的 getter
	getExpiringMembers          ExpiringMembersGetter       // 获取即将到期的会员
	getGracePeriodEndingMembers GracePeriodEndingGetter     // 获取宽限期即将结束的会员
	getNonMembersForMonthEnd    NonMembersForMonthEndGetter // 获取需要月底提醒的非会员
	// 新增：到期当天和宽限期结束相关
	getExpiredTodayMembers ExpiredTodayMembersGetter  // 获取今天到期的会员
	getGraceExpiredMembers GraceExpiredMembersGetter  // 获取宽限期刚结束的用户
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

// SetExpiringMembersGetter 设置即将到期会员获取函数
func (s *MembershipGiftService) SetExpiringMembersGetter(getter ExpiringMembersGetter) {
	s.getExpiringMembers = getter
}

// SetGracePeriodEndingGetter 设置宽限期即将结束会员获取函数
func (s *MembershipGiftService) SetGracePeriodEndingGetter(getter GracePeriodEndingGetter) {
	s.getGracePeriodEndingMembers = getter
}

// SetNonMembersForMonthEndGetter 设置月底提醒非会员获取函数
func (s *MembershipGiftService) SetNonMembersForMonthEndGetter(getter NonMembersForMonthEndGetter) {
	s.getNonMembersForMonthEnd = getter
}

// SetExpiredTodayMembersGetter 设置今天到期会员获取函数
func (s *MembershipGiftService) SetExpiredTodayMembersGetter(getter ExpiredTodayMembersGetter) {
	s.getExpiredTodayMembers = getter
}

// SetGraceExpiredMembersGetter 设置宽限期刚结束用户获取函数
func (s *MembershipGiftService) SetGraceExpiredMembersGetter(getter GraceExpiredMembersGetter) {
	s.getGraceExpiredMembers = getter
}

// ExecuteMonthlyTasks 执行每月1号的任务
// 包括：1. 发放会员经费/恩特币  2. 清空非会员用户经费
// 使用分布式锁保证多实例部署时的并发安全
func (s *MembershipGiftService) ExecuteMonthlyTasks() {
	now := time.Now()
	month := now.Format("2006-01")
	ctx := context.Background()

	slog.Info("starting monthly tasks", "month", month)

	// 1. 发放会员经费/恩特币（带分布式锁）
	giftLockKey := fmt.Sprintf(lockKeyMonthlyGift, month)
	acquired, err := cache.SetNX(ctx, giftLockKey, "1", monthlyLockExpiration)
	if err != nil {
		slog.Error("failed to acquire gift lock", "err", err)
	} else if acquired {
		slog.Info("acquired gift lock", "month", month)
		s.GiftToAllMembers(month)
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		slog.Info("gift task already running or completed, skipping", "month", month)
	}

	// 2. 处理宽限期内的会员（发送提醒站内信）
	graceLockKey := fmt.Sprintf("lock:membership:grace_notify:%s", month)
	acquired, err = cache.SetNX(ctx, graceLockKey, "1", monthlyLockExpiration)
	if err != nil {
		slog.Error("failed to acquire grace notify lock", "err", err)
	} else if acquired {
		slog.Info("acquired grace notify lock", "month", month)
		s.NotifyMembersInGracePeriod()
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		slog.Info("grace notify task already running or completed, skipping", "month", month)
	}

	// 3. 清空超过宽限期的非会员用户经费（带分布式锁）
	clearLockKey := fmt.Sprintf(lockKeyMonthlyClear, month)
	acquired, err = cache.SetNX(ctx, clearLockKey, "1", monthlyLockExpiration)
	if err != nil {
		slog.Error("failed to acquire clear lock", "err", err)
	} else if acquired {
		slog.Info("acquired clear lock", "month", month)
		s.ClearNonMembersGold()
		// 注意：不主动释放锁，让它自然过期，防止同月重复执行
	} else {
		slog.Info("clear task already running or completed, skipping", "month", month)
	}

	slog.Info("monthly tasks completed", "month", month)
}

// GiftToAllMembers 给所有会员发放经费/恩特币
func (s *MembershipGiftService) GiftToAllMembers(month string) {
	if s.getSubscriptions == nil {
		slog.Warn("subscription getter not set, skipping monthly gift")
		return
	}

	slog.Info("starting to gift all members", "month", month)

	// 获取所有 pro 和 max 会员
	subscriptions, err := s.getSubscriptions([]string{"pro", "max"})
	if err != nil {
		slog.Error("failed to get active subscriptions", "err", err)
		return
	}

	slog.Info("found active subscriptions", "count", len(subscriptions))

	ctx := context.Background()
	successCount := 0
	failCount := 0
	skipCount := 0

	for _, sub := range subscriptions {
		// 月度赠送不减半
		result, err := s.currencyService.GiftMembershipReward(ctx, sub.UserID, sub.PlanCode, false, "membership_monthly", month)
		if err != nil {
			if errors.Is(err, ErrAlreadyReceived) {
				skipCount++
				slog.Info("user already received gift this month, skipping", "user_id", sub.UserID)
			} else {
				slog.Error("failed to gift user", "user_id", sub.UserID, "err", err)
				failCount++
			}
		} else {
			successCount++
			slog.Info("gifted user", "user_id", sub.UserID, "gold", result.GoldAmount, "diamond", result.DiamondAmount)
			
			// 发送站内信通知
			s.sendMonthlyGiftNotification(sub.UserID, sub.PlanCode, result, month)
		}
	}

	slog.Info("monthly gift completed", "month", month, "success", successCount, "skipped", skipCount, "failed", failCount)
}

// ClearNonMembersGold 清空超过宽限期的非会员用户的经费
// 包括：从未开通过会员的用户、会员已过期且超过宽限期的用户
func (s *MembershipGiftService) ClearNonMembersGold() {
	today := time.Now().Format("2006-01-02")
	slog.Info("checking non-members to clear gold", "date", today)

	// 获取宽限期天数配置
	graceDays := s.getGraceDays()
	slog.Info("using grace period", "grace_days", graceDays)

	var nonMembers []NonMember
	var err error

	// 优先使用支持宽限期的获取函数
	if s.getNonMembersAfterGrace != nil {
		nonMembers, err = s.getNonMembersAfterGrace(graceDays)
	} else if s.getNonMembers != nil {
		// 兼容旧的获取函数（不支持宽限期）
		slog.Warn("using legacy non-member getter without grace period support")
		nonMembers, err = s.getNonMembers()
	} else {
		slog.Warn("non-member getter not set, skipping gold clear")
		return
	}

	if err != nil {
		slog.Error("failed to get non-members", "err", err)
		return
	}

	if len(nonMembers) == 0 {
		slog.Info("no non-members with gold to clear", "date", today)
		return
	}

	slog.Info("found non-members with gold to process", "count", len(nonMembers))

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
			slog.Error("failed to clear gold for user", "user_id", member.UserID, "err", err)
			failCount++
		} else {
			successCount++
			totalCleared += member.Gold
			if member.LastSubscriptionEnd != nil {
				slog.Info("cleared gold from user", "gold", member.Gold, "user_id", member.UserID, "last_subscription_end", member.LastSubscriptionEnd.Format("2006-01-02"))
			} else {
				slog.Info("cleared gold from user", "gold", member.Gold, "user_id", member.UserID, "subscription_history", "never")
			}
			
			// 发送站内信通知
			s.sendGoldClearNotification(member.UserID, member.Gold)
		}
	}

	slog.Info("non-member gold clear completed", "cleared", successCount, "total_gold", totalCleared, "failed", failCount)
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
		slog.Info("user is renewing subscription, skip activation gift", "user_id", userID)
		return // 续费不赠送
	}

	ctx := context.Background()
	now := time.Now()
	month := now.Format("2006-01")
	isHalf := now.Day() > 15

	slog.Info("gifting activation reward to new member", "user_id", userID, "plan", planCode, "month", month, "is_half", isHalf)

	result, err := s.currencyService.GiftMembershipReward(ctx, userID, planCode, isHalf, "membership_activate", month)
	if err != nil {
		slog.Warn("failed to gift membership reward", "user_id", userID, "err", err)
	} else {
		slog.Info("activation reward gifted", "user_id", userID, "gold", result.GoldAmount, "diamond", result.DiamondAmount)
		
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
		slog.Warn("members in grace period getter not set, skipping grace notification")
		return
	}

	graceDays := s.getGraceDays()
	slog.Info("checking members in grace period", "grace_days", graceDays)

	members, err := s.getMembersInGracePeriod(graceDays)
	if err != nil {
		slog.Error("failed to get members in grace period", "err", err)
		return
	}

	if len(members) == 0 {
		slog.Info("no members in grace period to notify")
		return
	}

	slog.Info("found members in grace period to notify", "count", len(members))

	successCount := 0
	for _, member := range members {
		s.sendGracePeriodNotification(member.UserID, member.Gold, member.ExpiredAt, graceDays)
		successCount++
	}

	slog.Info("grace period notification completed", "notified", successCount)
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
		content = fmt.Sprintf("欢迎成为%s会员！本月福利已发放：经费%d + 恩特币%d", planName, result.GoldAmount, result.DiamondAmount)
	} else {
		content = fmt.Sprintf("欢迎成为%s会员！本月福利已发放：经费%d", planName, result.GoldAmount)
	}

	if isHalf {
		content += "（15日后开通享半月福利）"
	}

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "transaction", "/wallet", "查看钱包"); err != nil {
			slog.Error("failed to send activation notification", "user_id", userID, "err", err)
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

	title := "月度福利到账"
	var content string

	if result.DiamondAmount > 0 {
		content = fmt.Sprintf("%s会员%s福利已发放：经费%d + 恩特币%d", planName, month, result.GoldAmount, result.DiamondAmount)
	} else {
		content = fmt.Sprintf("%s会员%s福利已发放：经费%d", planName, month, result.GoldAmount)
	}

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "transaction", "/wallet", "查看钱包"); err != nil {
			slog.Error("failed to send monthly gift notification", "user_id", userID, "err", err)
		}
	}()
}

// sendGoldClearNotification 发送经费清空站内信
func (s *MembershipGiftService) sendGoldClearNotification(userID uint, clearedAmount int64) {
	if s.messageService == nil {
		return
	}

	title := "经费已清空"
	content := fmt.Sprintf("账户%d经费已于月初清空。经费为会员专属福利，开通会员可每月领取~", clearedAmount)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "开通会员"); err != nil {
			slog.Error("failed to send gold clear notification", "user_id", userID, "err", err)
		}
	}()
}

// sendGracePeriodNotification 发送宽限期提醒站内信
func (s *MembershipGiftService) sendGracePeriodNotification(userID uint, gold int64, expiredAt *time.Time, graceDays int) {
	if s.messageService == nil {
		return
	}

	title := "经费即将清空"

	var remainingDays int
	if expiredAt != nil {
		deadline := expiredAt.AddDate(0, 0, graceDays)
		remainingDays = int(time.Until(deadline).Hours() / 24)
		if remainingDays < 0 {
			remainingDays = 0
		}
	} else {
		remainingDays = graceDays
	}

	content := fmt.Sprintf("会员已到期，账户%d经费将在%d天后清空，续费可保留全部经费", gold, remainingDays)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "立即续费"); err != nil {
			slog.Error("failed to send grace period notification", "user_id", userID, "err", err)
		}
	}()
}

// ========== 每日清空任务（00:00执行）==========

// ExecuteDailyClearTasks 执行每日清空任务
// 每天00:00执行，清空宽限期刚结束（昨天结束）的用户经费
func (s *MembershipGiftService) ExecuteDailyClearTasks() {
	now := time.Now()
	today := now.Format("2006-01-02")

	slog.Info("starting daily clear tasks", "date", today)

	// 获取宽限期天数配置
	graceDays := s.getGraceDays()

	slog.Info("grace days config", "grace_days", graceDays)

	// 清空宽限期刚结束的用户经费
	s.clearGraceExpiredMembers(graceDays)

	slog.Info("daily clear tasks completed", "date", today)
}

// clearGraceExpiredMembers 清空宽限期刚结束的用户经费
// 发送条件：宽限期昨天结束（即宽限期结束时间是昨天）
func (s *MembershipGiftService) clearGraceExpiredMembers(graceDays int) {
	if s.getGraceExpiredMembers == nil {
		slog.Warn("grace expired members getter not set, skipping grace expired clear")
		return
	}

	slog.Info("checking members whose grace period just ended")

	members, err := s.getGraceExpiredMembers(graceDays)
	if err != nil {
		slog.Error("failed to get grace expired members", "err", err)
		return
	}

	if len(members) == 0 {
		slog.Info("no members with grace period just ended")
		return
	}

	slog.Info("found members whose grace period just ended", "count", len(members))

	ctx := context.Background()
	today := time.Now().Format("2006-01-02")
	successCount := 0
	failCount := 0
	skipCount := 0
	totalCleared := int64(0)

	for _, member := range members {
		// 只处理有经费的用户
		if member.Gold <= 0 {
			continue
		}

		// 使用分布式锁防止当天重复清空
		lockKey := fmt.Sprintf(lockKeyGraceExpiredClear, member.UserID, today)
		acquired, err := cache.SetNX(ctx, lockKey, "1", dailyLockExpiration)
		if err != nil {
			slog.Error("failed to acquire grace expired clear lock", "user_id", member.UserID, "err", err)
			continue
		}
		if !acquired {
			skipCount++
			continue // 今天已处理过，跳过
		}

		// 清空经费
		bizID := generateBizID("grace_expired_clear", member.UserID)
		desc := "宽限期结束经费清空"
		_, err = s.currencyService.doTransaction(ctx, member.UserID, CurrencyGold, -member.Gold, TxTypeDeduct,
			"grace_expired_clear", bizID, desc)
		if err != nil {
			slog.Error("failed to clear gold for user (grace expired)", "user_id", member.UserID, "err", err)
			failCount++
		} else {
			successCount++
			totalCleared += member.Gold
			slog.Info("cleared gold from user (grace period ended)", "gold", member.Gold, "user_id", member.UserID, "grace_end_date", member.GraceEndDate.Format("2006-01-02"))

			// 发送站内信通知
			s.sendGraceExpiredClearNotification(member.UserID, member.Gold)
		}
	}

	slog.Info("grace expired clear completed", "cleared", successCount, "total_gold", totalCleared, "failed", failCount, "skipped", skipCount)
}

// sendGraceExpiredClearNotification 发送宽限期结束经费清空通知站内信
func (s *MembershipGiftService) sendGraceExpiredClearNotification(userID uint, gold int64) {
	if s.messageService == nil {
		return
	}

	title := "经费已清空"
	content := fmt.Sprintf("宽限期已结束，账户%d经费已清空。开通会员可获得新的经费福利~", gold)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "开通会员"); err != nil {
			slog.Error("failed to send grace expired clear notification", "user_id", userID, "err", err)
		} else {
			slog.Info("sent grace expired clear notification", "user_id", userID)
		}
	}()
}

// ========== 每日提醒方法（09:00执行）==========

// ExecuteDailyReminders 执行每日提醒检查
// 每天09:00执行，检查并发送以下提醒：
// 1. 会员即将到期提醒（到期前3天）
// 2. 会员到期当天提醒（告知进入宽限期）
// 3. 宽限期即将结束提醒（结束前3天）
// 4. 非会员月底经费清空提醒（月底前3天，排除宽限期用户）
func (s *MembershipGiftService) ExecuteDailyReminders() {
	now := time.Now()
	today := now.Format("2006-01-02")

	slog.Info("starting daily reminders", "date", today)

	// 获取提醒天数配置（默认3天）
	reminderDays := s.getReminderDays()
	graceDays := s.getGraceDays()

	slog.Info("reminder config", "reminder_days", reminderDays, "grace_days", graceDays)

	// 1. 会员即将到期提醒（到期前N天）
	s.notifyExpiringMembers(reminderDays)

	// 2. 会员到期当天提醒（告知进入宽限期）
	s.notifyExpiredTodayMembers(graceDays)

	// 3. 宽限期即将结束提醒（结束前N天）
	s.notifyGracePeriodEnding(graceDays, reminderDays)

	// 4. 非会员月底经费清空提醒（月底前N天，排除宽限期用户）
	s.notifyNonMembersBeforeMonthEnd(graceDays, reminderDays)

	slog.Info("daily reminders completed", "date", today)
}

// getReminderDays 获取提前提醒天数配置
func (s *MembershipGiftService) getReminderDays() int {
	reminderDays, err := s.currencyService.GetCurrencyConfigAmount(ConfigKeyReminderDays)
	if err != nil || reminderDays <= 0 {
		return 3 // 默认提前3天提醒
	}
	return int(reminderDays)
}

// notifyExpiringMembers 通知即将到期的会员
// 发送条件：会员到期时间在未来N天内（含当天）
func (s *MembershipGiftService) notifyExpiringMembers(reminderDays int) {
	if s.getExpiringMembers == nil {
		slog.Warn("expiring members getter not set, skipping expiry reminder")
		return
	}

	slog.Info("checking members expiring within days", "reminder_days", reminderDays)

	members, err := s.getExpiringMembers(reminderDays)
	if err != nil {
		slog.Error("failed to get expiring members", "err", err)
		return
	}

	if len(members) == 0 {
		slog.Info("no members expiring soon to notify")
		return
	}

	slog.Info("found members expiring soon", "count", len(members))

	ctx := context.Background()
	month := time.Now().Format("2006-01")
	graceDays := s.getGraceDays()
	successCount := 0
	skipCount := 0

	for _, member := range members {
		// 使用分布式锁防止同月重复发送
		lockKey := fmt.Sprintf(lockKeyExpiryReminder, member.UserID, month)
		acquired, err := cache.SetNX(ctx, lockKey, "1", reminderLockExpiration)
		if err != nil {
			slog.Error("failed to acquire expiry reminder lock", "user_id", member.UserID, "err", err)
			continue
		}
		if !acquired {
			skipCount++
			continue // 本月已发送过，跳过
		}

		// 发送站内信
		s.sendExpiryReminder(member.UserID, member.PlanCode, member.EndDate, graceDays)
		successCount++
	}

	slog.Info("expiry reminder completed", "sent", successCount, "skipped", skipCount)
}

// notifyExpiredTodayMembers 通知今天到期的会员（告知进入宽限期）
// 发送条件：会员今天到期
func (s *MembershipGiftService) notifyExpiredTodayMembers(graceDays int) {
	if s.getExpiredTodayMembers == nil {
		slog.Warn("expired today members getter not set, skipping expired today reminder")
		return
	}

	slog.Info("checking members expired today")

	members, err := s.getExpiredTodayMembers()
	if err != nil {
		slog.Error("failed to get expired today members", "err", err)
		return
	}

	if len(members) == 0 {
		slog.Info("no members expired today to notify")
		return
	}

	slog.Info("found members expired today", "count", len(members))

	ctx := context.Background()
	today := time.Now().Format("2006-01-02")
	successCount := 0
	skipCount := 0

	for _, member := range members {
		// 使用分布式锁防止当天重复发送
		lockKey := fmt.Sprintf(lockKeyExpiredTodayReminder, member.UserID, today)
		acquired, err := cache.SetNX(ctx, lockKey, "1", dailyLockExpiration)
		if err != nil {
			slog.Error("failed to acquire expired today reminder lock", "user_id", member.UserID, "err", err)
			continue
		}
		if !acquired {
			skipCount++
			continue // 今天已发送过，跳过
		}

		// 发送站内信
		s.sendExpiredTodayReminder(member.UserID, member.PlanCode, member.EndDate, graceDays)
		successCount++
	}

	slog.Info("expired today reminder completed", "sent", successCount, "skipped", skipCount)
}

// notifyGracePeriodEnding 通知宽限期即将结束的会员
// 发送条件：宽限期在未来N天内结束 + 有经费
func (s *MembershipGiftService) notifyGracePeriodEnding(graceDays, reminderDays int) {
	if s.getGracePeriodEndingMembers == nil {
		slog.Warn("grace period ending getter not set, skipping grace ending reminder")
		return
	}

	slog.Info("checking members with grace period ending", "reminder_days", reminderDays)

	members, err := s.getGracePeriodEndingMembers(graceDays, reminderDays)
	if err != nil {
		slog.Error("failed to get members with grace period ending", "err", err)
		return
	}

	if len(members) == 0 {
		slog.Info("no members with grace period ending soon to notify")
		return
	}

	slog.Info("found members with grace period ending soon", "count", len(members))

	ctx := context.Background()
	month := time.Now().Format("2006-01")
	successCount := 0
	skipCount := 0

	for _, member := range members {
		// 只通知有经费的用户
		if member.Gold <= 0 {
			continue
		}

		// 使用分布式锁防止同月重复发送
		lockKey := fmt.Sprintf(lockKeyGraceEndingReminder, member.UserID, month)
		acquired, err := cache.SetNX(ctx, lockKey, "1", reminderLockExpiration)
		if err != nil {
			slog.Error("failed to acquire grace ending reminder lock", "user_id", member.UserID, "err", err)
			continue
		}
		if !acquired {
			skipCount++
			continue // 本月已发送过，跳过
		}

		// 发送站内信
		s.sendGraceEndingReminder(member.UserID, member.Gold, member.GraceEndDate)
		successCount++
	}

	slog.Info("grace ending reminder completed", "sent", successCount, "skipped", skipCount)
}

// notifyNonMembersBeforeMonthEnd 通知非会员月底经费将被清空
// 发送条件：月底前N天 + 有经费 + 不在宽限期内
func (s *MembershipGiftService) notifyNonMembersBeforeMonthEnd(graceDays, reminderDays int) {
	// 检查是否是月底前N天
	now := time.Now()
	// 获取当月最后一天
	firstOfNextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, now.Location())
	lastDayOfMonth := firstOfNextMonth.AddDate(0, 0, -1)
	// 使用日期差计算，避免时间部分导致的误差
	// 例如：12月28日到12月31日，应该是 31-28+1=4 天
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	daysToMonthEnd := int(lastDayOfMonth.Sub(today).Hours()/24) + 1

	if daysToMonthEnd > reminderDays {
		slog.Info("not within reminder window, skipping month-end reminder", "reminder_days", reminderDays, "days_remaining", daysToMonthEnd)
		return
	}

	if s.getNonMembersForMonthEnd == nil {
		slog.Warn("non-members for month end getter not set, skipping month-end reminder")
		return
	}

	slog.Info("checking non-members for month-end reminder", "days_to_month_end", daysToMonthEnd)

	nonMembers, err := s.getNonMembersForMonthEnd(graceDays)
	if err != nil {
		slog.Error("failed to get non-members for month-end reminder", "err", err)
		return
	}

	if len(nonMembers) == 0 {
		slog.Info("no non-members to notify for month-end")
		return
	}

	slog.Info("found non-members for month-end reminder", "count", len(nonMembers))

	ctx := context.Background()
	month := now.Format("2006-01")
	successCount := 0
	skipCount := 0

	for _, member := range nonMembers {
		// 只通知有经费的用户
		if member.Gold <= 0 {
			continue
		}

		// 使用分布式锁防止同月重复发送
		lockKey := fmt.Sprintf(lockKeyMonthEndReminder, member.UserID, month)
		acquired, err := cache.SetNX(ctx, lockKey, "1", reminderLockExpiration)
		if err != nil {
			slog.Error("failed to acquire month-end reminder lock", "user_id", member.UserID, "err", err)
			continue
		}
		if !acquired {
			skipCount++
			continue // 本月已发送过，跳过
		}

		// 发送站内信
		s.sendMonthEndClearReminder(member.UserID, member.Gold)
		successCount++
	}

	slog.Info("month-end reminder completed", "sent", successCount, "skipped", skipCount)
}

// ========== 每日提醒站内信发送方法 ==========

// sendExpiryReminder 发送会员即将到期提醒站内信
func (s *MembershipGiftService) sendExpiryReminder(userID uint, planCode string, endDate *time.Time, graceDays int) {
	if s.messageService == nil {
		return
	}

	planName := "Pro"
	if planCode == "max" {
		planName = "Max"
	}

	var endDateStr string
	if endDate != nil {
		endDateStr = endDate.Format("01月02日")
	} else {
		endDateStr = "即将"
	}

	title := "会员即将到期"
	content := fmt.Sprintf("%s会员将于%s到期，届时进入%d天宽限期。续费可保留经费，过期将清空~", planName, endDateStr, graceDays)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "立即续费"); err != nil {
			slog.Error("failed to send expiry reminder", "user_id", userID, "err", err)
		} else {
			slog.Info("sent expiry reminder", "user_id", userID)
		}
	}()
}

// sendExpiredTodayReminder 发送会员到期当天提醒站内信（告知进入宽限期）
func (s *MembershipGiftService) sendExpiredTodayReminder(userID uint, planCode string, endDate *time.Time, graceDays int) {
	if s.messageService == nil {
		return
	}

	planName := "Pro"
	if planCode == "max" {
		planName = "Max"
	}

	// 计算宽限期结束日期
	graceEndDate := time.Now().AddDate(0, 0, graceDays)
	graceEndStr := graceEndDate.Format("01月02日")

	title := "会员已到期"
	content := fmt.Sprintf("%s会员今日到期，已进入%d天宽限期（至%s）。续费可保留经费~", planName, graceDays, graceEndStr)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "立即续费"); err != nil {
			slog.Error("failed to send expired today reminder", "user_id", userID, "err", err)
		} else {
			slog.Info("sent expired today reminder", "user_id", userID)
		}
	}()
}

// sendGraceEndingReminder 发送宽限期即将结束提醒站内信
func (s *MembershipGiftService) sendGraceEndingReminder(userID uint, gold int64, graceEndDate *time.Time) {
	if s.messageService == nil {
		return
	}

	var remainingDays int
	if graceEndDate != nil {
		remainingDays = int(time.Until(*graceEndDate).Hours()/24) + 1
		if remainingDays < 0 {
			remainingDays = 0
		}
	} else {
		remainingDays = 0
	}

	title := "经费即将清空"
	content := fmt.Sprintf("宽限期仅剩%d天，届时账户%d经费将清空，续费可保留全部经费", remainingDays, gold)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "立即续费"); err != nil {
			slog.Error("failed to send grace ending reminder", "user_id", userID, "err", err)
		} else {
			slog.Info("sent grace ending reminder", "user_id", userID)
		}
	}()
}

// sendMonthEndClearReminder 发送非会员月底清空提醒站内信
func (s *MembershipGiftService) sendMonthEndClearReminder(userID uint, gold int64) {
	if s.messageService == nil {
		return
	}

	// 计算下月1日的日期
	now := time.Now()
	firstOfNextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, now.Location())
	clearDateStr := firstOfNextMonth.Format("01月02日")

	title := "经费月底清空"
	content := fmt.Sprintf("账户%d经费将于%s清空，开通会员可保留经费并每月领取福利", gold, clearDateStr)

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/pricing", "开通会员"); err != nil {
			slog.Error("failed to send month-end clear reminder", "user_id", userID, "err", err)
		} else {
			slog.Info("sent month-end clear reminder", "user_id", userID)
		}
	}()
}

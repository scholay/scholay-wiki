// ============================================================================
// 统一每日 token 额度(取代旧的「每功能每日次数」)。
//
// 每用户一条每日额度 = FreeDailyTokens × 倍率(tier);所有 AI 功能共用,消耗按真实
// token 后置累加(AddUsage, 由 llmusage.Record 唯一咽喉喂数)。额度耗尽:可消耗经费
// 立即重置(ResetQuota),或每日 00:00 自然滚动到新 key 满血。
//
// 计数走 Redis:quota:tokens:<uid>:<YYYYMMDD>,TTL 25h,fail-open(Redis 挂→放行)。
// 北京时区直接 time.Now()(项目铁律:不做 UTC 转换)。
// ============================================================================

package vip

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"scholar-backend/internal/common/cache"
)

// resetLockShards 把「配额重置」按 user 分片串行化(单实例进程锁)。
// 防 CheckDailyQuota 的 check-then-act 并发双扣:钱包行锁只防透支、不防「两个并发耗尽请求
// 各自决定重置各扣一次重置费」。256 片足够分散,偶发跨用户假争用可忽略。
// 多副本部署时换成 Redis SETNX quota:reset:<uid>:<day>。
var resetLockShards [256]sync.Mutex

func lockUserReset(userID uint) func() {
	m := &resetLockShards[userID%uint(len(resetLockShards))]
	m.Lock()
	return m.Unlock
}

// tokenDayKey —— 当日 token 计数 key(含日期,跨 0 点自然换 key = 自动满血)。
func tokenDayKey(userID uint, now time.Time) string {
	return fmt.Sprintf("quota:tokens:%d:%s", userID, now.Format("20060102"))
}

// tokenUsed 读当日已消耗 token。Redis 挂 / key 不存在 → 0。
func (s *Service) tokenUsed(ctx context.Context, userID uint) int64 {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0
	}
	v, err := rdb.Get(ctx, tokenDayKey(userID, time.Now())).Int64()
	if err != nil {
		return 0 // key 不存在(redis.Nil)或读失败 → 视为 0
	}
	return v
}

// CheckDailyQuota —— **每日 token 额度闸门**(统一池, 所有 AI 功能共用, 不分功能)。
// 只读闸门, 不预扣;真实消耗由 AddUsage 后置累加。
//
// 流程:取用户生效等级 → 算上限 → 当日已耗 < 上限则放行;超限时若开了「自动重置」且经费够,
// 自动消耗经费重置后放行,否则回 ErrQuotaExceeded(友好文案)。
// 上限 <0 = 不限;收费总开关关 = 不限;Redis 挂 = fail-open(放行)。
func (s *Service) CheckDailyQuota(ctx context.Context, userID uint) error {
	if userID == 0 {
		return nil // 未登录(这些功能均已强制登录)安全放行
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return nil
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.DailyCeiling(tier)
	if ceiling < 0 {
		return nil // 不限额
	}
	if s.tokenUsed(ctx, userID) < ceiling {
		return nil
	}
	// 超限:尝试自动重置(开关开 + 经费足)。
	if s.wallet.AutoResetEnabled(userID) {
		if err := s.resetInternal(ctx, userID, cfg); err == nil {
			slog.Info("billing: auto-reset on quota exhausted", "user_id", userID, "tier", tier)
			return nil
		}
		// 自动重置失败(多半经费不足)→ 落到超限文案
	}
	return NewQuotaError(quotaExceededMessage(tier, cfg))
}

// AddUsage —— 把一次 LLM 调用的真实 token 计入当日额度(由 llmusage.Record 观察者调用)。
// 唯一的额度「扣减」点。userID==0 / tokens<=0 / Redis 挂 → 跳过(best-effort, 绝不阻塞)。
func (s *Service) AddUsage(ctx context.Context, userID uint, tokens int) {
	if userID == 0 || tokens <= 0 {
		return
	}
	if !s.cfg.Get().Enabled {
		return
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return
	}
	key := tokenDayKey(userID, time.Now())
	n, err := rdb.IncrBy(ctx, key, int64(tokens)).Result()
	if err != nil {
		slog.Warn("billing: token usage incr failed", "user_id", userID, "err", err)
		return
	}
	if n == int64(tokens) { // 当日首次累加 → 设 25h 过期(防时钟漂移)
		if e := rdb.Expire(ctx, key, 25*time.Hour).Err(); e != nil {
			slog.Warn("billing: token usage expire set failed", "user_id", userID, "err", e)
		}
	}
}

// ResetResult 重置后的额度 + 钱包余额(回前端刷新 UI)。
type ResetResult struct {
	Used    int64        `json:"used"`
	Ceiling int64        `json:"ceiling"`
	Balance *BalanceView `json:"balance"`
}

// ResetQuota —— 手动重置:消耗经费 → 清当日 token 计数(额度满血)。
// 经费不足回 ErrInsufficientCredit。
func (s *Service) ResetQuota(ctx context.Context, userID uint) (*ResetResult, error) {
	cfg := s.cfg.Get()
	if err := s.resetInternal(ctx, userID, cfg); err != nil {
		return nil, err
	}
	bal, err := s.wallet.Balance(userID)
	if err != nil {
		return nil, err
	}
	return &ResetResult{
		Used:    s.tokenUsed(ctx, userID),
		Ceiling: cfg.DailyCeiling(s.EffectiveTier(userID)),
		Balance: bal,
	}, nil
}

// resetInternal 消耗经费 → 清当日 token 计数(额度满血)。经费不足 → ErrInsufficientCredit(不清计数)。
//
// 并发与失败安全(per-user 锁内):
//   1. 锁内重读计数:已被并发重置 / 跨 0 点自然滚动清空 → 直接成功,绝不重复扣费(防双扣)。
//   2. 先校验余额,再【先清计数(Redis 写)、后扣费】:Redis 写失败(宕机/MISCONF)直接返回错误、
//      不扣费 —— 杜绝旧实现「扣了钱但 DEL 失败仅 Warn 返 nil → 计数没清 → 每条消息再扣一次」的循环扣费。
func (s *Service) resetInternal(ctx context.Context, userID uint, cfg *BillingConfig) error {
	unlock := lockUserReset(userID)
	defer unlock()

	// 1) 锁内重读:已被并发重置 / 自然滚动清空 → 无需再扣。
	if ceiling := cfg.DailyCeiling(s.EffectiveTier(userID)); ceiling >= 0 && s.tokenUsed(ctx, userID) < ceiling {
		return nil
	}

	cost := cfg.ResetCostCredits
	// 2) 余额预检(锁内、本用户已串行化):不足直接返回,不清计数、不扣费。
	if cost > 0 {
		bal, err := s.wallet.Balance(userID)
		if err != nil {
			return err
		}
		if bal.Total < cost {
			return ErrInsufficientCredit
		}
	}

	// 3) 先清计数(Redis 写)。失败即返回错误、不扣费,杜绝循环扣费。
	rdb := cache.GetRedisPersist()
	if rdb != nil {
		if err := rdb.Del(ctx, tokenDayKey(userID, time.Now())).Err(); err != nil {
			slog.Warn("billing: reset del key failed, not charging", "user_id", userID, "err", err)
			return err
		}
	}

	// 4) 计数已清,扣费(余额已校验足够,Consume 行锁兜底)。
	if cost > 0 {
		if err := s.wallet.Consume(userID, cost, TxResetConsume, "reset", time.Now().Format("20060102"), "重置每日额度"); err != nil {
			// 计数已清(用户已得重置)但扣费失败 —— 校验后到此被掏空,已被本锁串行化基本排除。
			// 给一次免费重置远胜把用户卡死或重复扣费,这里只告警不回滚。
			slog.Error("billing: reset consume failed after counter cleared (free reset granted)", "user_id", userID, "err", err)
		}
	}
	return nil
}

// quotaExceededMessage 超限友好文案(含重置花费 + 升级/充值引导)。
func quotaExceededMessage(tier string, cfg *BillingConfig) string {
	if tier == TierFree {
		return fmt.Sprintf("今日 AI 额度已用完。升级会员可获更高额度,或消耗 %d 经费立即重置额度。", cfg.ResetCostCredits)
	}
	return fmt.Sprintf("今日 AI 额度已用完。可消耗 %d 经费立即重置额度,或明日 00:00 自动恢复。", cfg.ResetCostCredits)
}

// ─── 会员/额度总览(给前端「账户资产 · 总览」+ 旧「我的会员」)────────────────────

// TokenStatus 当日额度状态。
type TokenStatus struct {
	Used      int64 `json:"used"`
	Ceiling   int64 `json:"ceiling"` // -1 = 不限
	Percent   int   `json:"percent"` // 已用百分比(0..100;不限时 0)
	Unlimited bool  `json:"unlimited"`
}

// Overview 账户资产总览:等级 + 到期 + 额度 + 经费 + 重置参数。
type Overview struct {
	Tier      string       `json:"tier"`
	ExpiresAt *time.Time   `json:"expires_at"`
	Token     TokenStatus  `json:"token"`
	Credit    *BalanceView `json:"credit"`
	AutoReset bool         `json:"auto_reset"`
	ResetCost int          `json:"reset_cost"`
}

// DayUsage 当月某日的 token 用量(热力图用)。
type DayUsage struct {
	Date   string `json:"date"`   // YYYY-MM-DD
	Tokens int64  `json:"tokens"`
}

// DailyUsageThisMonth 从 llm_token_usage 聚合「当月每日 token 用量」(给前端按日绿格热力图)。
func (s *Service) DailyUsageThisMonth(userID uint) ([]DayUsage, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []DayUsage
	err := s.repo.DB().Table("llm_token_usage").
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COALESCE(SUM(total_tokens),0) AS tokens").
		Where("user_id = ? AND created_at >= ?", userID, monthStart).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Scan(&rows).Error
	return rows, err
}

// GetOverview 组装总览。
func (s *Service) GetOverview(ctx context.Context, userID uint) (*Overview, error) {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tier := effectiveTier(uv, now)
	cfg := s.cfg.Get()
	ceiling := cfg.DailyCeiling(tier)
	used := s.tokenUsed(ctx, userID)
	ts := TokenStatus{Used: used, Ceiling: ceiling, Unlimited: ceiling < 0}
	if ceiling > 0 {
		p := int(used * 100 / ceiling)
		if p > 100 {
			p = 100
		}
		ts.Percent = p
	}
	bal, err := s.wallet.Balance(userID)
	if err != nil {
		return nil, err
	}
	ov := &Overview{
		Tier: tier, Token: ts, Credit: bal,
		AutoReset: bal.AutoReset, ResetCost: cfg.ResetCostCredits, // auto_reset 已随 Balance 的钱包行读出, 省一次查询
	}
	if isPaidTier(tier) {
		ov.ExpiresAt = uv.VIPExpiresAt
	}
	return ov, nil
}

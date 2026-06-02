// ============================================================================
// vip.Service —— 等级判定 + 每日限额(Redis 计数)+ 兑换码生成/兑换 + 会员状态。
// 限额计数走 Redis(同 agentbridge 日额度风格, fail-open);兑换/发码落 DB。
// ============================================================================

package vip

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// EffectiveTier 返回**当前生效**等级:pro 且未过期 → pro;否则 free(到期自动回落, 无需定时任务)。
func (s *Service) EffectiveTier(userID uint) string {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		slog.Warn("vip: get user vip failed, fallback free", "user_id", userID, "err", err)
		return TierFree
	}
	return effectiveTier(uv, time.Now())
}

func effectiveTier(uv UserVIP, now time.Time) string {
	if uv.VIPTier == TierPro && (uv.VIPExpiresAt == nil || uv.VIPExpiresAt.After(now)) {
		return TierPro
	}
	return TierFree
}

func dailyKey(feature string, userID uint) string {
	// 与容器时区(北京)一致, 直接 time.Now();不做 UTC 转换(项目铁律)。
	return fmt.Sprintf("vip:quota:%s:%d:%s", feature, userID, time.Now().Format("20060102"))
}

// CheckAndConsume 在一次受限功能调用前调:按用户当前等级取该功能的每日上限, Redis INCR 计数,
// 超限返回 vip.ErrQuotaExceeded(带友好文案)。limit<=0 不限;Redis 不可用 fail-open(放行)。
// 含 retry 的功能每次调用各算一次(与 total_requests / 现有日额度口径一致)。
func (s *Service) CheckAndConsume(ctx context.Context, userID uint, feature string) error {
	if userID == 0 {
		return nil // 无登录用户(理论上这些功能都已强制登录)不计, 安全放行
	}
	tier := s.EffectiveTier(userID)
	limit := limitFor(feature, tier)
	if limit <= 0 {
		return nil // 不限额
	}
	rdb := cache.GetRedis()
	if rdb == nil {
		slog.Warn("vip: redis unavailable, quota fail-open", "feature", feature, "user_id", userID)
		return nil
	}
	key := dailyKey(feature, userID)
	count, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		slog.Warn("vip: redis incr failed, quota fail-open", "feature", feature, "user_id", userID, "err", err)
		return nil
	}
	if count == 1 {
		if e := rdb.Expire(ctx, key, 25*time.Hour).Err(); e != nil {
			slog.Warn("vip: redis expire failed", "feature", feature, "user_id", userID, "err", e)
		}
	}
	if count > int64(limit) {
		return NewQuotaError(quotaMessage(feature, tier, limit))
	}
	return nil
}

func quotaMessage(feature, tier string, limit int) string {
	if tier == TierFree {
		return fmt.Sprintf("今日「%s」免费额度已用完(%d 次/天),升级专业版可大幅提升额度。", featureName(feature), limit)
	}
	return fmt.Sprintf("今日「%s」额度已用完(%d 次/天),请明天再试。", featureName(feature), limit)
}

// ─── 会员状态(给前端「我的会员」页)─────────────────────────────────────────

// FeatureUsage 单个功能的今日用量。
type FeatureUsage struct {
	Feature   string `json:"feature"`
	Label     string `json:"label"`
	Limit     int    `json:"limit"`     // <=0 表示不限
	Used      int    `json:"used"`      // 今日已用
	Remaining int    `json:"remaining"` // 剩余(不限时为 -1)
}

// Status 会员状态总览。
type Status struct {
	Tier      string         `json:"tier"`       // 当前生效等级 free/pro
	ExpiresAt *time.Time     `json:"expires_at"` // pro 到期(free 为 null)
	Features  []FeatureUsage `json:"features"`   // 各受限功能今日用量
}

// GetStatus 拼装会员状态:等级 + 到期 + 各功能今日 used/limit/remaining。
func (s *Service) GetStatus(ctx context.Context, userID uint) (*Status, error) {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tier := effectiveTier(uv, now)
	st := &Status{Tier: tier, Features: make([]FeatureUsage, 0, len(GatedFeatures()))}
	if tier == TierPro {
		st.ExpiresAt = uv.VIPExpiresAt
	}
	rdb := cache.GetRedis()
	for _, f := range GatedFeatures() {
		limit := limitFor(f, tier)
		used := 0
		if rdb != nil {
			if v, e := rdb.Get(ctx, dailyKey(f, userID)).Int(); e == nil {
				used = v
			}
		}
		remaining := -1
		if limit > 0 {
			remaining = limit - used
			if remaining < 0 {
				remaining = 0
			}
		}
		st.Features = append(st.Features, FeatureUsage{
			Feature: f, Label: featureName(f), Limit: limit, Used: used, Remaining: remaining,
		})
	}
	return st, nil
}

// ─── 兑换 / 发码 ─────────────────────────────────────────────────────────

// RedeemResult 兑换成功返回。
type RedeemResult struct {
	Tier      string    `json:"tier"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Redeem 用户兑换:归一化码 → 事务里校验+授予。错误是 vip.ErrCode*（handler 翻文案）。
func (s *Service) Redeem(ctx context.Context, userID uint, rawCode string) (*RedeemResult, error) {
	code := normalizeCode(rawCode)
	if code == "" {
		return nil, ErrCodeNotFound
	}
	tier, expires, err := s.repo.Redeem(userID, code, time.Now())
	if err != nil {
		return nil, err
	}
	return &RedeemResult{Tier: tier, ExpiresAt: expires}, nil
}

// GenerateCodes 管理员批量生成兑换码, 返回生成的码字符串。count 限 1..1000。
func (s *Service) GenerateCodes(count int, tier string, grantDays int, validUntil *time.Time, note string, createdBy *uint) ([]string, error) {
	if count < 1 {
		count = 1
	}
	if count > 1000 {
		count = 1000
	}
	// 兑换码只授予 pro —— 不允许生成 free 码(否则被在期 pro 用户兑换会触发降级语义, 无意义)。
	tier = TierPro
	if grantDays <= 0 {
		grantDays = 30
	}
	codes := make([]RedemptionCode, 0, count)
	out := make([]string, 0, count)
	seen := make(map[string]struct{}, count)
	for len(out) < count {
		c, err := randomCode(12)
		if err != nil {
			return nil, err
		}
		if _, dup := seen[c]; dup {
			continue
		}
		// DB 去重(极小概率撞已存在的码)。
		if exists, err := s.repo.CodeExists(c); err != nil {
			return nil, err
		} else if exists {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
		codes = append(codes, RedemptionCode{
			Code: c, GrantTier: tier, GrantDays: grantDays, ValidUntil: validUntil, Note: note, CreatedBy: createdBy,
		})
	}
	if err := s.repo.CreateCodes(codes); err != nil {
		return nil, err
	}
	slog.Info("vip: generated redemption codes", "count", len(out), "tier", tier, "grant_days", grantDays)
	return out, nil
}

// GrantToUser 管理员**直接**授予/续期会员(不走兑换码)。同等级未过期则顺延, 否则从 now 起算。
// 返回新的到期时间。
func (s *Service) GrantToUser(userID uint, tier string, days int) (time.Time, error) {
	if tier != TierPro && tier != TierFree {
		tier = TierPro
	}
	if days <= 0 {
		days = 30
	}
	now := time.Now()
	uv, _ := s.repo.GetUserVIP(userID)
	base := now
	if uv.VIPTier == tier && uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(now) {
		base = *uv.VIPExpiresAt
	}
	exp := base.AddDate(0, 0, days)
	if err := s.repo.SetUserVIP(userID, tier, &exp); err != nil {
		return time.Time{}, err
	}
	slog.Info("vip: admin granted membership", "user_id", userID, "tier", tier, "days", days)
	return exp, nil
}

// RevokeUser 管理员取消某用户会员(回 free, 清到期)。
func (s *Service) RevokeUser(userID uint) error {
	return s.repo.SetUserVIP(userID, TierFree, nil)
}

// ListCodes 管理员分页查看兑换码。
func (s *Service) ListCodes(f CodeFilter, page, pageSize int) ([]RedemptionCode, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 30
	}
	return s.repo.ListCodes(f, pageSize, (page-1)*pageSize)
}

// ─── 工具 ────────────────────────────────────────────────────────────────

// codeAlphabet 去掉了易混字符(0/O/1/I/L), 方便人工抄写。
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randomCode(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i := range buf {
		out[i] = codeAlphabet[int(buf[i])%len(codeAlphabet)]
	}
	return string(out), nil
}

func normalizeCode(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

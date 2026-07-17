// ============================================================================
// ConfigService —— 计费单行配置(billing_config)的读写 + 内存缓存。
//
// 配置被每次额度闸门 / 钱包操作高频读取, 故带短 TTL 内存缓存(写后立即失效)。
// DB 读失败时回退到 DefaultBillingConfig, 保证额度判定不因配置读不到而硬挂。
// ============================================================================

package vip

import (
	"errors"
	"log/slog"
	"sync"
	"time"
)

// BillingConfigError 计费配置校验失败(承重旋钮被零化会让全档静默不限额 = 收入泄漏)。
// handler 据此回 400 + 友好文案,而非 500。
type BillingConfigError struct{ msg string }

func (e *BillingConfigError) Error() string { return e.msg }

// AsBillingConfigError 便于 handler 用 errors.As 识别。
func AsBillingConfigError(err error) (*BillingConfigError, bool) {
	var e *BillingConfigError
	if errors.As(err, &e) {
		return e, true
	}
	return nil, false
}

// validateBillingConfig 校验承重旋钮(评审 R3):启用收费时 FreeWindowTokens / WindowDays 必须 > 0
// —— base<=0 会让 WindowCeiling 对**全档(含 Pro/Max)**返回 -1=不限,admin 误设 0 即全站免费无限。
// 倍率 <=0 = 该付费档不限 是既定 fail-open 语义(admin 表单 hint 已注明),不在此拦。
func validateBillingConfig(c *BillingConfig) error {
	if !c.Enabled {
		return nil // 收费总开关关闭:本就全档不限,无需校验
	}
	if c.FreeWindowTokens <= 0 {
		return &BillingConfigError{msg: "Free 周期基准额度必须大于 0(设为 0 会让所有会员档变成不限额度)"}
	}
	if c.WindowDays <= 0 {
		return &BillingConfigError{msg: "周期天数必须大于 0"}
	}
	return nil
}

// DefaultBillingConfig 与迁移 0015 的列默认值一致, 作为 DB 读不到时的兜底。
func DefaultBillingConfig() *BillingConfig {
	return &BillingConfig{
		ID:                     1,
		FreeDailyTokens:        200000,    // 旧日额度基准(P4 起判定不读,回滚兜底)
		FreeWindowTokens:       1_400_000, // 7 天周期基准(=旧日额度×7,与迁移 0064 回填一致)
		WindowDays:             7,
		ProMultiplier:          5, // Pro = 5× Free
		MaxMultiplier:          5, // Max = 5× Pro(= 25× Free)
		ProPriceCents:          5900,
		ProOriginalCents:       19900,
		MaxPriceCents:          26900,
		MaxOriginalCents:       99900,
		ProGrantCredits:        600,
		MaxGrantCredits:        3000,
		RechargeRate:           1,
		MinRechargeCents:       1000,
		ResetCostCredits:       60,
		SubscriptionPeriodDays: 30,
		PopularPlan:            TierPro,
		Enabled:                true,
	}
}

// configCacheTTL —— 配置缓存有效期(admin 改动后最多 30s 全量生效;写操作会主动失效)。
const configCacheTTL = 30 * time.Second

type ConfigService struct {
	repo *Repository

	mu       sync.RWMutex
	cached   *BillingConfig
	cachedAt time.Time
}

func NewConfigService(repo *Repository) *ConfigService { return &ConfigService{repo: repo} }

// Get 返回当前配置(带缓存)。DB 读不到 → 兜底默认 + Warn(不阻断额度判定)。
func (s *ConfigService) Get() *BillingConfig {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.cachedAt) < configCacheTTL {
		c := s.cached
		s.mu.RUnlock()
		return c
	}
	s.mu.RUnlock()

	cfg, err := s.repo.GetBillingConfig()
	if err != nil || cfg == nil {
		slog.Warn("billing: load config failed, using default", "err", err)
		cfg = DefaultBillingConfig()
	}
	s.mu.Lock()
	s.cached = cfg
	s.cachedAt = time.Now()
	s.mu.Unlock()
	return cfg
}

// Update 写入 admin 提交的配置并立即失效缓存。承重旋钮先过服务端校验(挡「全档静默不限额」误配)。
func (s *ConfigService) Update(in *BillingConfig) error {
	if err := validateBillingConfig(in); err != nil {
		return err
	}
	if err := s.repo.UpdateBillingConfig(in); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

func (s *ConfigService) invalidate() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

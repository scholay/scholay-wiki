// ============================================================================
// ConfigService —— 计费单行配置(billing_config)的读写 + 内存缓存。
//
// 配置被每次额度闸门 / 钱包操作高频读取, 故带短 TTL 内存缓存(写后立即失效)。
// DB 读失败时回退到 DefaultBillingConfig, 保证额度判定不因配置读不到而硬挂。
// ============================================================================

package vip

import (
	"log/slog"
	"sync"
	"time"
)

// DefaultBillingConfig 与迁移 0015 的列默认值一致, 作为 DB 读不到时的兜底。
func DefaultBillingConfig() *BillingConfig {
	return &BillingConfig{
		ID:                     1,
		FreeDailyTokens:        200000,
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

// Update 写入 admin 提交的配置并立即失效缓存。
func (s *ConfigService) Update(in *BillingConfig) error {
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

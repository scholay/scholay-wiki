// ============================================================================
// ConfigService —— 计费单行配置(billing_config)的读写 + 内存缓存。
//
// 配置被每次额度闸门 / 钱包操作高频读取, 故带短 TTL 内存缓存(写后立即失效)。
// DB 读失败时回退到 DefaultBillingConfig, 保证额度判定不因配置读不到而硬挂。
// ============================================================================

package vip

import (
	"errors"
	"fmt"
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
	// 0094 按量付费:兑换率必须 > 0(<=0 会让 MicroCreditForCost 除零/白送)。
	if c.CreditToPoints <= 0 {
		return &BillingConfigError{msg: "经费兑换率必须大于 0(1 经费可兑换的算力点数)"}
	}
	// 🔴 承重校验:**按量付费单价必须严格高于所有套餐档的满额单价**,否则「买套餐比直充便宜」
	// 这条产品承诺当场失效 —— 而且是静默失效(页面照常渲染,只是套餐失去了存在理由)。
	// 单价口径统一成「每 ¥1 买到多少算力点」,数越大越便宜,所以要求 直充 < 每一个套餐档。
	if err := validatePaygCheaperThanPlans(c); err != nil {
		return err
	}
	return nil
}

// planPointsPerYuan 某档某周期「每 ¥1 买到多少算力点」(满额口径)。价格未配置(<=0)返回 0 = 跳过。
func planPointsPerYuan(c *BillingConfig, tier, cycle string) float64 {
	priceCents := c.PriceCentsFor(tier, cycle)
	if priceCents <= 0 {
		return 0
	}
	ceilingMicro := c.WindowCeiling(tier)
	if ceilingMicro <= 0 {
		return 0 // 不限额档没有「满额单价」可言
	}
	days := c.WindowDays
	if days <= 0 {
		days = 7
	}
	// 周期额度(算力点) → 每月 → 每 ¥1。月 = 365/12 天;年付把价格摊到 12 个月。
	pointsPerCycle := float64(ceilingMicro) / 1000.0
	pointsPerMonth := pointsPerCycle * (365.0 / 12.0) / float64(days)
	monthlyYuan := float64(priceCents) / 100.0
	if normCycle(cycle) == CycleYearly {
		monthlyYuan /= 12.0
	}
	if monthlyYuan <= 0 {
		return 0
	}
	return pointsPerMonth / monthlyYuan
}

// validatePaygCheaperThanPlans 见 validateBillingConfig 的红字。
func validatePaygCheaperThanPlans(c *BillingConfig) error {
	if c.RechargeRate <= 0 {
		return nil // 充值关闭 → 没有按量付费,无需比较
	}
	paygPointsPerYuan := c.RechargeRate * float64(c.creditToPoints())
	for _, t := range []string{TierPro, TierMax} {
		for _, cy := range []string{CycleMonthly, CycleYearly} {
			p := planPointsPerYuan(c, t, cy)
			if p > 0 && paygPointsPerYuan >= p {
				return &BillingConfigError{msg: fmt.Sprintf(
					"按量付费比套餐还便宜了:¥1 直充可得 %.0f 算力点,而 %s %s 每 ¥1 只有 %.0f 点。"+
						"请调低「经费兑换率」或调整该档定价 —— 否则用户没有任何理由购买套餐。",
					paygPointsPerYuan, t, cycleLabelZh(cy), p)}
			}
		}
	}
	return nil
}

func cycleLabelZh(cycle string) string {
	if normCycle(cycle) == CycleYearly {
		return "年付"
	}
	return "月付"
}

// DefaultBillingConfig DB 读不到时的兜底默认值。出厂种子以迁移 0097 的重锚为准
// (0095 口径:recharge_rate=100 / credit_to_points=3),这里与其对齐;
// 历史上「与迁移 0015 列默认值一致」的说法已过时(0015 后多轮迁移改过种子)。
func DefaultBillingConfig() *BillingConfig {
	return &BillingConfig{
		ID:                     1,
		FreeDailyTokens:        200000, // 旧日额度基准(P4 起判定不读,回滚兜底)
		// P5 成本制:单位=微元真实成本(显示 ÷1000=算力点)。Free 300000 微元 = ¥0.3 = 300 算力点。
		FreeWindowTokens:       300_000, // Free 300 算力点 / 7 天
		WindowDays:             7,
		ProMultiplier:          20, // Pro = 20× Free = 6000 算力点
		MaxMultiplier:          5,  // Max = 5× Pro = 30000 算力点
		ProPriceCents:          5900,
		ProOriginalCents:       19900,
		MaxPriceCents:          26900,
		MaxOriginalCents:       99900,
		// 年度订阅(0079 种子同口径):年价=月价×10(送 2 个月),划线=月划线×12。
		// 0090:四个 grant 默认值与两个「周期天数」默认值已删(订阅不赠送经费;周期改真自然月/年)。
		ProYearPriceCents:    59000,
		ProYearOriginalCents: 238800,
		MaxYearPriceCents:    269000,
		MaxYearOriginalCents: 1198800,
		// 0095 重锚:¥1 = 100 经费(**经费 = 分**),1 经费 = 3 算力点 ⇒ ¥1 = 300 算力点。
		// 乘积 300 是定价真源:比最贵的套餐档(Pro 月付 442 点/¥)贵 47%,
		// 订阅优势 1.47×(Pro月)~1.94×(Max年),落在业界 1.5×~2× 区间内。
		// 拆成 100 × 3 而不是旧的 60 × 5,是为了让两个数各自有意义 ——
		// 「经费 = 分」用户一眼可读,60 和 5 谁都不对应任何真实事物。
		RechargeRate:     100,
		CreditToPoints:   3,
		MinRechargeCents: 1000,
		// 邀请奖励(0100)默认关闭:发钱的活动必须由 admin 显式开启,兜底配置绝不能自带发钱。
		InviteRewardCredits:  0,
		InviteRewardDailyCap: 0,
		// ResetCostCredits 运行时已不读(重置改扣次数),但**必须保留取值**:
		// 迁移 0092 拿它当「N 经费 = 1 次」的换算除数,每次容器启动都重放。被写成 0 会让
		// GREATEST(0,1)=1 → 未换算批次按 1:1 换,相对拍板值 120 超发 120 倍。
		ResetCostCredits: 60,
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
	// 年度字段负数归一化为 0(=年付关闭):-1 是迁移 0079 的「未配置」哨兵,admin 若把负值
	// 存回去,下次迁移重放会误判未配置而回填覆写;拦在写入口杜绝。
	clampNeg := func(v *int) {
		if *v < 0 {
			*v = 0
		}
	}
	clampNeg(&in.ProYearPriceCents)
	clampNeg(&in.ProYearOriginalCents)
	clampNeg(&in.MaxYearPriceCents)
	clampNeg(&in.MaxYearOriginalCents)
	// 邀请奖励(0100)两旋钮:负数无意义,一律归 0(0=关闭/不限)。
	clampNeg(&in.InviteRewardCredits)
	clampNeg(&in.InviteRewardDailyCap)
	// (两个 year_grant_credits 的 clamp 已删 —— 字段本身退休。
	//  上面四个年度**价格**的 clamp 一行都不能删:0079 的 -1 哨兵回填每次启动都重放,
	//  价格被存成负数后会被静默复活成「月价×10」,直接改掉用户被收的价。)
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

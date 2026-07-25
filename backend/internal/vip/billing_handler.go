// ============================================================================
// 计费 HTTP handler —— 用户端(总览 / 重置 / 自动重置开关 / 流水)+ 管理端(配置 / 钱包调账)。
// 复用 vip.Handler(已持有 *Service)。
// ============================================================================

package vip

import (
	"errors"
	"strconv"
	"time"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// testPaymentEnabled 读全局配置:是否开启"测试支付"(PAYMENT_TEST_ENABLED)。
func testPaymentEnabled() bool {
	return config.AppConfig != nil && config.AppConfig.App.TestPaymentEnabled
}

// ─── 用户端 ──────────────────────────────────────────────────────────────

// BillingOverview GET /user/billing/overview —— 等级/到期/今日额度/经费余额/重置参数。
func (h *Handler) BillingOverview(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	ov, err := h.svc.GetOverview(c.Request.Context(), uid)
	if err != nil {
		utils.InternalError(c, 500, "获取账户资产失败", err)
		return
	}
	utils.Success(c, ov.StripQuotaAmounts()) // 用户端只看百分比,不下发额度绝对值
}

// ResetQuota POST /user/billing/reset —— 消耗经费立即重置今日额度。
func (h *Handler) ResetQuota(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	res, err := h.svc.ResetQuota(c.Request.Context(), uid)
	if err != nil {
		if errors.Is(err, ErrInsufficientCredit) {
			utils.BadRequest(c, "经费不足,无法重置。可升级会员或充值经费后再试。")
			return
		}
		utils.InternalError(c, 500, "重置额度失败,请稍后重试", err)
		return
	}
	utils.SuccessWithMessage(c, "已重置今日额度", res)
}

// (SetAutoReset / 自动消耗经费重置开关已下线 —— 额度耗尽不再自动扣经费,只保留用户显式手动重置。)

// ListOrders GET /user/billing/orders?type=subscription|recharge —— 已支付订单(明细查看)。
func (h *Handler) ListOrders(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	orders, err := h.svc.Order().ListUserOrders(uid, c.Query("type"))
	if err != nil {
		utils.ServerError(c, "获取订单明细失败")
		return
	}
	utils.Success(c, gin.H{"items": orders})
}

// UsageCalendar GET /user/billing/usage-calendar —— 当月每日 token 用量(绿格热力图)+ 日均参考线。
// P4:额度是 7 天周期,无「每日上限」;daily_ceiling 字段名保留(老 bundle 兼容),
// 语义改为 **窗口上限 ÷ 周期天数** 的日均参考线(前端分档基准/标签同步改)。
func (h *Handler) UsageCalendar(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	rows, err := h.svc.DailyUsageThisMonth(uid)
	if err != nil {
		utils.ServerError(c, "获取用量失败")
		return
	}
	cfg := h.svc.Config().Get()
	ceiling := cfg.WindowCeiling(h.svc.EffectiveTier(uid))
	daily := ceiling // -1 不限原样透传
	if ceiling > 0 {
		days := cfg.WindowDays
		if days <= 0 {
			days = 7
		}
		daily = ceiling / int64(days)
	}
	utils.Success(c, gin.H{"days": rows, "daily_ceiling": daily})
}

// ListTransactions GET /user/billing/transactions?type=&page=&page_size= —— 经费流水。
func (h *Handler) ListTransactions(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	items, total, err := h.svc.Wallet().ListTransactions(uid, c.Query("type"), pageSize, (page-1)*pageSize)
	if err != nil {
		utils.ServerError(c, "获取流水失败")
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// CreateRecharge POST /user/billing/recharge {amount_cents} —— 建充值订单, 返回 order_no(再走支付 create)。
func (h *Handler) CreateRecharge(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		AmountCents int `json:"amount_cents"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	ord, err := h.svc.Order().CreateRecharge(uid, req.AmountCents)
	if err != nil {
		if errors.Is(err, ErrInvalidOrder) {
			utils.BadRequest(c, "充值金额不符合要求(低于起充额)")
			return
		}
		utils.InternalError(c, 500, "创建充值订单失败", err)
		return
	}
	utils.Success(c, ord)
}

// CreateSubscription POST /user/billing/subscribe {plan, cycle} —— 建订阅订单
// (plan=pro|max;cycle=monthly|yearly,缺省 monthly)。
func (h *Handler) CreateSubscription(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		Plan  string `json:"plan"`
		Cycle string `json:"cycle"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	ord, err := h.svc.Order().CreateSubscription(uid, req.Plan, req.Cycle)
	if err != nil {
		switch {
		case errors.Is(err, ErrNoDowngrade):
			utils.BadRequest(c, "不支持降级到更低套餐")
		case errors.Is(err, ErrPendingOrderExists):
			utils.BadRequest(c, "您有一笔待支付的会员订单,请先完成支付或稍后再试")
		case errors.Is(err, ErrInvalidOrder):
			utils.BadRequest(c, "套餐无效或未配置价格")
		default:
			utils.InternalError(c, 500, "创建订阅订单失败", err)
		}
		return
	}
	utils.Success(c, ord)
}

// SubscribeQuote GET /user/billing/subscribe/quote?tier=pro|max&cycle=monthly|yearly
// —— 算订阅/续期/升级的动作 + 应付金额(不建单)。
func (h *Handler) SubscribeQuote(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	q, err := h.svc.QuoteSubscription(uid, c.Query("tier"), c.Query("cycle"))
	if err != nil {
		switch {
		case errors.Is(err, ErrNoDowngrade):
			utils.BadRequest(c, "不支持降级到更低套餐")
		case errors.Is(err, ErrInvalidOrder):
			utils.BadRequest(c, "套餐无效或未配置价格")
		default:
			utils.InternalError(c, 500, "获取报价失败", err)
		}
		return
	}
	utils.Success(c, q)
}

// TestPay POST /user/billing/test-pay {order_no} —— 测试支付:无网关, 一键完成订单履约。
// 仅在 PAYMENT_TEST_ENABLED 开启时可用(否则 403), 供本地测试 / 演示。
func (h *Handler) TestPay(c *gin.Context) {
	if !testPaymentEnabled() {
		utils.Error(c, 403, "测试支付未开启")
		return
	}
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		OrderNo string `json:"order_no"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.svc.Order().FulfillManually(uid, req.OrderNo); err != nil {
		utils.InternalError(c, 500, "测试支付失败,请稍后重试", err)
		return
	}
	ov, _ := h.svc.GetOverview(c.Request.Context(), uid)
	utils.SuccessWithMessage(c, "测试支付成功", ov.StripQuotaAmounts()) // 用户端只看百分比
}

// dayEquivalent 老 bundle 兼容:窗口额度换算成日均口径(free_daily_tokens 字段的过渡值)。
func dayEquivalent(cfg *BillingConfig) int64 {
	if cfg.FreeWindowTokens <= 0 {
		return cfg.FreeWindowTokens
	}
	days := cfg.WindowDays
	if days <= 0 {
		days = 7
	}
	return cfg.FreeWindowTokens / int64(days)
}

// clampNonNeg 年度字段对外展示口径:<0(未配置哨兵)按 0(=年付未开放)透出,不泄漏 -1。
func clampNonNeg(v int) int {
	if v < 0 {
		return 0
	}
	return v
}

// PublicPlans GET /billing/plans(公开)—— 套餐价格/倍率/赠送 + 充值/重置参数(非敏感)。
// 年度字段(0079):year_price_cents<=0 = 该档年付未开放(前端隐藏年付入口)。
func (h *Handler) PublicPlans(c *gin.Context) {
	cfg := h.svc.Config().Get()
	alipay, wechat := h.svc.PaymentMethods()
	utils.Success(c, gin.H{
		// P4:额度是 7 天周期。free_daily_tokens 保留给老 bundle(值=窗口÷天数的日均口径)。
		"free_window_tokens":     cfg.FreeWindowTokens,
		"window_days":            cfg.WindowDays,
		"free_daily_tokens":      dayEquivalent(cfg),
		"reset_cost_credits":     cfg.ResetCostCredits,
		"recharge_rate":          cfg.RechargeRate,
		"min_recharge_cents":     cfg.MinRechargeCents,
		"popular_plan":           cfg.PopularPlan,
		"enabled":                cfg.Enabled,
		"test_payment":           testPaymentEnabled(),
		"subscription_year_days": cfg.PeriodDaysFor(CycleYearly),
		"payment_methods":        gin.H{"alipay": alipay, "wechat": wechat},
		"plans": []gin.H{
			{"tier": TierFree, "price_cents": 0, "original_cents": 0, "multiplier": 1, "grant_credits": 0,
				"year_price_cents": 0, "year_original_cents": 0, "year_grant_credits": 0},
			{"tier": TierPro, "price_cents": cfg.ProPriceCents, "original_cents": cfg.ProOriginalCents, "multiplier": cfg.ProMultiplier, "grant_credits": cfg.ProGrantCredits,
				"year_price_cents": clampNonNeg(cfg.ProYearPriceCents), "year_original_cents": clampNonNeg(cfg.ProYearOriginalCents), "year_grant_credits": clampNonNeg(cfg.ProYearGrantCredits)},
			{"tier": TierMax, "price_cents": cfg.MaxPriceCents, "original_cents": cfg.MaxOriginalCents, "multiplier": cfg.MaxMultiplier, "grant_credits": cfg.MaxGrantCredits,
				"year_price_cents": clampNonNeg(cfg.MaxYearPriceCents), "year_original_cents": clampNonNeg(cfg.MaxYearOriginalCents), "year_grant_credits": clampNonNeg(cfg.MaxYearGrantCredits)},
		},
	})
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// AdminGetBillingConfig GET /admin/billing/config —— 读计费配置(供后台配置页)。
func (h *Handler) AdminGetBillingConfig(c *gin.Context) {
	utils.Success(c, h.svc.Config().Get())
}

// AdminUpdateBillingConfig PUT /admin/billing/config —— 保存计费配置(所有旋钮)。
func (h *Handler) AdminUpdateBillingConfig(c *gin.Context) {
	var req BillingConfig
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.svc.Config().Update(&req); err != nil {
		if bce, ok := AsBillingConfigError(err); ok {
			utils.BadRequest(c, bce.Error()) // 校验失败(承重旋钮零化)→ 400 友好文案,非 500
			return
		}
		utils.InternalError(c, 500, "保存配置失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已保存", h.svc.Config().Get())
}

// AdminAdjustWallet POST /admin/users/:id/wallet/adjust {amount, kind, days, note}
// 管理员给某用户加/扣经费(kind=temp|perm;amount>0 加、<0 扣[仅 perm]);temp 加需 days。
func (h *Handler) AdminAdjustWallet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	var req struct {
		Amount int    `json:"amount"` // >0 加, <0 扣(仅 perm 支持扣)
		Kind   string `json:"kind"`   // temp | perm
		Days   int    `json:"days"`   // temp 加时有效天数
		Note   string `json:"note"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	uid := uint(id)
	w := h.svc.Wallet()
	switch {
	case req.Amount > 0 && req.Kind == CreditKindTemp:
		days := req.Days
		if days <= 0 {
			days = 30
		}
		err = w.GrantTemp(uid, req.Amount, SourceAdmin, "admin", time.Now().AddDate(0, 0, days), TxAdminAdjust)
	case req.Amount > 0:
		err = w.GrantPerm(uid, req.Amount, SourceAdmin, "admin", TxAdminAdjust)
	case req.Amount < 0 && req.Kind == CreditKindTemp:
		// 显式扣临时经费(临时优先,Consume 语义即此)。
		err = w.Consume(uid, -req.Amount, TxAdminAdjust, "admin", "admin", req.Note)
	case req.Amount < 0:
		// 默认/Kind==perm:扣永久经费 —— 不烧用户的临时经费(与「扣 perm」意图一致)。
		err = w.ConsumePerm(uid, -req.Amount, TxAdminAdjust, "admin", "admin", req.Note)
	default:
		utils.BadRequest(c, "调账金额不能为 0")
		return
	}
	if err != nil {
		if errors.Is(err, ErrInsufficientCredit) {
			utils.BadRequest(c, "该用户经费不足,无法扣减")
			return
		}
		utils.InternalError(c, 500, "调账失败", err)
		return
	}
	bal, _ := w.Balance(uid)
	utils.SuccessWithMessage(c, "已调账", bal)
}

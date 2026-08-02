// ============================================================================
// 计费 HTTP handler —— 用户端(总览 / 重置 / 自动重置开关 / 流水)+ 管理端(配置 / 钱包调账)。
// 复用 vip.Handler(已持有 *Service)。
// ============================================================================

package vip

import (
	"errors"
	"log/slog"
	"strconv"
	"time"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// testPaymentEnabled 读全局配置:是否开启"测试支付"(PAYMENT_TEST_ENABLED)。
//
// 🔴 生产硬闸:GIN_MODE=release 时**无视开关一律关闭**。测试支付 = 任何登录用户可对
// 自建 pending 单(含 Max 年付)免费履约,生产误开就是资损洞;而 .env 是会被整份拷贝的
// (本机就是 true),单靠「生产务必 false」的注释拦不住。要在本地用测试支付,
// 在 .env 显式设 GIN_MODE=debug(docker-compose 默认 release)。
func testPaymentEnabled() bool {
	return config.AppConfig != nil &&
		config.AppConfig.App.TestPaymentEnabled &&
		!config.AppConfig.App.IsRelease
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

// ResetQuota POST /user/billing/reset —— 消耗 1 次「重置次数」立即重置本周期额度。
// 0090 起不再扣经费(owner 拍板);次数目前唯一来源是临时经费的历史换算,用完即止。
func (h *Handler) ResetQuota(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	res, err := h.svc.ResetQuota(c.Request.Context(), uid)
	if err != nil {
		if errors.Is(err, ErrNoResetPass) {
			// 刻意不提「充值」——充值买不到重置次数了,给一条走不通的路比不给更糟。
			utils.BadRequest(c, "重置次数已用完,无法立即重置。可等待本周期自动重置,或升级会员获得更高额度。")
			return
		}
		utils.InternalError(c, 500, "重置额度失败,请稍后重试", err)
		return
	}
	utils.SuccessWithMessage(c, "已重置本周期额度", res.StripAmounts()) // 用户端只看百分比,不下发额度绝对值
}

// SetCreditAutopay PUT /user/billing/autopay {enabled} —— 开/关「周期额度用完后自动用经费续」。
//
// 🔴 **默认关,只能由用户在这里显式开**。历史上的 auto_reset(额度耗尽自动扣经费重置)
// 就是因为不知情扣费被整个下线的;按量付费是同一类风险,开关的默认值与入口都要保守。
func (h *Handler) SetCreditAutopay(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.svc.Wallet().SetCreditAutopay(uid, req.Enabled); err != nil {
		utils.InternalError(c, 500, "保存失败,请稍后重试", err)
		return
	}
	msg := "已关闭:额度用完后将不再自动使用经费"
	if req.Enabled {
		msg = "已开启:周期额度用完后将自动使用经费继续"
	}
	utils.SuccessWithMessage(c, msg, gin.H{"enabled": req.Enabled})
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

// DayUsagePct 当月某日的用量强度(热力图用)——**只有相对百分比,没有绝对成本**。
type DayUsagePct struct {
	Date string `json:"date"` // YYYY-MM-DD
	Pct  int    `json:"pct"`  // 相对参考线的百分比(0..999);0 = 当日无使用
}

// UsageCalendar GET /user/billing/usage-calendar —— 当月每日用量热力图(相对强度)。
//
// 🔴 **只下发相对百分比**。此前回的是 days[].cost(每日精算成本,微元)+ daily_ceiling(日均参考线,微元),
// 而前端拿到后**只用来算比值**(cost/ceiling 分四档 + tooltip 百分比),绝对数一个都没渲染 ——
// 也就是说整整一个月的绝对消耗被下发出去只为了在浏览器里做一次除法。这与 StripQuotaAmounts
// 抹掉 consumed_today(单日绝对消耗)是同一条不变量,漏这里等于抹了一天、给了三十天;
// 且 daily_ceiling × window_days 能直接还原出被抹掉的周期上限。除法搬到后端,不变量才闭合。
//
// 参考线的选取:
//   - 限额档 → 日均参考线 = 周期上限 ÷ 周期天数(与旧口径一致,pct 语义不变);
//   - 不限档 → **该用户本月自己的峰值**。自比不泄漏任何配置,且比旧实现更好:
//     旧的不限档回落到写死的微元台阶(¥0.2/¥0.05/¥0.01),对重度用户整月糊成满格。
// pct 上限 999:限额档可能超过 100%(单日爆用),截断防前端拿到离谱值。
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
	unlimited := ceiling <= 0

	var ref int64 // 参考线(微元)
	if !unlimited {
		days := cfg.WindowDays
		if days <= 0 {
			days = 7
		}
		ref = ceiling / int64(days)
	} else {
		for _, r := range rows { // 不限档:以本月自身峰值为参考
			if r.Cost > ref {
				ref = r.Cost
			}
		}
	}

	out := make([]DayUsagePct, 0, len(rows))
	for _, r := range rows {
		p := 0
		if r.Cost > 0 && ref > 0 {
			// 四舍五入(× 200 + ref)/(2×ref) —— 与搬走前前端的 Math.round 同口径,纯整数无浮点误差。
			// 整数除法截断会让 2.6% 显示成 2%,是没必要的行为差异。
			if p = int((r.Cost*200 + ref) / (2 * ref)); p > 999 {
				p = 999
			}
			if p == 0 {
				p = 1 // 有使用就不能显示成「无使用」:整数除法会把 <1% 的日子抹成 0
			}
		} else if r.Cost > 0 {
			p = 1 // ref 不可得(不限档且全月仅此一天有量)时,至少标出「有使用」
		}
		out = append(out, DayUsagePct{Date: r.Date, Pct: p})
	}
	utils.Success(c, gin.H{"days": out, "unlimited": unlimited})
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
		// 🔴 free_window_tokens / free_daily_tokens(Free 档周期额度基数,微元)**已不再下发**。
		// 这是个免登录端点:基数 × 同响应里的 multiplier = 三档的绝对上限,任何访客都能算出来 ——
		// 等于把 StripQuotaAmounts 费力抹掉的数字从正门送出去。用户侧对这两个字段**零渲染**
		// (只在 TS interface 里声明过),删掉无 UI 影响;真要看基数去 admin 的 /admin/billing/config。
		// 保留 multiplier:「Pro 是 Free 的 20×」是相对表述,正是产品想讲的故事,不泄漏绝对量。
		"window_days":            cfg.WindowDays,
		// reset_cost_credits 已移除:0090 起重置扣「重置次数」不扣经费,这个数对用户没有意义了。
		// (DB 列与 admin 配置仍保留 —— 迁移 0092 拿它当换算率。)
		"recharge_rate":          cfg.RechargeRate,
		// 0094 按量付费:¥1 = recharge_rate × credit_to_points 算力点。两个数都要下发 ——
		// 只给「1 元 = 100 经费」用户无从知道经费值多少算力(经费对用户是抽象单位)。
		"credit_to_points":       cfg.CreditToPoints,
		"min_recharge_cents":     cfg.MinRechargeCents,
		"popular_plan":           cfg.PopularPlan,
		// 邀请奖励活动(0100):>0 = 活动开启,前端据此点亮「邀请有奖」入口与引导。
		// 公开下发是刻意的 —— 活动本身就是要对外宣传的;0 = 关闭,入口全部隐藏。
		// daily_cap 用于活动页规则行的正向措辞「每日最多计入 N 位好友的奖励」(0=不限,不显示)。
		"invite_reward_credits":   clampNonNeg(cfg.InviteRewardCredits),
		"invite_reward_daily_cap": clampNonNeg(cfg.InviteRewardDailyCap),
		"enabled":                cfg.Enabled,
		"test_payment":           testPaymentEnabled(),
		// subscription_year_days 已移除:0090 起年度 = +1 个自然年,不再有「年度天数」这个概念。
		"payment_methods":        gin.H{"alipay": alipay, "wechat": wechat},
		"plans": []gin.H{
			// grant_credits / year_grant_credits 已移除:0090 起订阅不再赠送经费(四个 DB 列保留作历史)。
			{"tier": TierFree, "price_cents": 0, "original_cents": 0, "multiplier": 1,
				"year_price_cents": 0, "year_original_cents": 0},
			{"tier": TierPro, "price_cents": cfg.ProPriceCents, "original_cents": cfg.ProOriginalCents, "multiplier": cfg.ProMultiplier,
				"year_price_cents": clampNonNeg(cfg.ProYearPriceCents), "year_original_cents": clampNonNeg(cfg.ProYearOriginalCents)},
			{"tier": TierMax, "price_cents": cfg.MaxPriceCents, "original_cents": cfg.MaxOriginalCents, "multiplier": cfg.MaxMultiplier,
				"year_price_cents": clampNonNeg(cfg.MaxYearPriceCents), "year_original_cents": clampNonNeg(cfg.MaxYearOriginalCents)},
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
	adminID, _ := utils.GetUserID(c)
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
	// 审计留痕:计费配置改动直接改全站定价/额度,谁改的 + 承重旋钮改成了什么必须可追溯。
	slog.Info("audit: admin 更新计费配置", "admin_id", adminID,
		"enabled", req.Enabled, "free_window_tokens", req.FreeWindowTokens, "window_days", req.WindowDays,
		"pro_multiplier", req.ProMultiplier, "max_multiplier", req.MaxMultiplier,
		"recharge_rate", req.RechargeRate, "credit_to_points", req.CreditToPoints,
		"pro_price_cents", req.ProPriceCents, "max_price_cents", req.MaxPriceCents,
		"pro_year_price_cents", req.ProYearPriceCents, "max_year_price_cents", req.MaxYearPriceCents)
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
		Amount int `json:"amount"` // >0 加, <0 扣
		// Kind / Days 已废弃:0090 起只有永久经费一种,临时经费退休。字段保留仅为兼容旧前端
		// 提交的表单(值一律被忽略),后台表单已移除这两项。
		Kind string `json:"kind"`
		Days int    `json:"days"`
		Note string `json:"note"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	adminID, _ := utils.GetUserID(c)
	uid := uint(id)
	w := h.svc.Wallet()
	_ = req.Kind // 0090:临时经费退休,kind/days 不再分叉
	switch {
	case req.Amount > 0:
		// note 随加款透传到流水(扣款分支的 ConsumePerm 一直就带;加款漏了 = 对账时无从归因)。
		err = w.GrantPerm(uid, req.Amount, SourceAdmin, "admin", TxAdminAdjust, req.Note)
	case req.Amount < 0:
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
	// 审计留痕:动用户的钱包必须能追溯到操作人与金额。
	slog.Info("audit: admin 钱包调账", "admin_id", adminID, "target_user_id", uid,
		"amount", req.Amount, "note", req.Note)
	bal, _ := w.Balance(uid, h.svc.Config().Get())
	utils.SuccessWithMessage(c, "已调账", bal)
}

// AdminGrantResetPasses POST /admin/users/:id/reset-passes {count, days, note}
// —— 给用户发放一批重置次数(补偿/运营)。0090 起次数是重置额度的唯一凭证,
// 此前唯一来源是 0092 历史换算,用户次数用尽后运营只能发经费绕行(而经费买不到重置)——
// 这里补上干预链的缺口。days = 有效期天数(缺省 365)。
func (h *Handler) AdminGrantResetPasses(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	var req struct {
		Count int    `json:"count"`
		Days  int    `json:"days"`
		Note  string `json:"note"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Count <= 0 || req.Count > 1000 {
		utils.BadRequest(c, "发放次数须在 1~1000 之间")
		return
	}
	if req.Days <= 0 {
		req.Days = 365
	}
	adminID, _ := utils.GetUserID(c)
	uid := uint(id)
	expires := time.Now().AddDate(0, 0, req.Days)
	if err := h.svc.Wallet().GrantResetPasses(uid, req.Count, expires, req.Note); err != nil {
		utils.InternalError(c, 500, "发放重置次数失败", err)
		return
	}
	slog.Info("audit: admin 发放重置次数", "admin_id", adminID, "target_user_id", uid,
		"count", req.Count, "days", req.Days, "note", req.Note)
	view, _ := h.svc.Wallet().ResetPasses(uid)
	utils.SuccessWithMessage(c, "已发放重置次数", view)
}

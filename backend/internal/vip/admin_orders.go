// ============================================================================
// 管理端订单/营收 —— 「订单与营收」后台页的数据面。
//
// 数据真源:orders 表(vip 充值 recharge / 订阅 subscription,status=pending|paid|expired,
// 金额「元」,见 order.go)。列表 LEFT JOIN users 取用户名/邮箱;营收按日聚合拆
// 充值/订阅 两段(前端堆叠柱)。admin 流量低,直查不缓存(与 llmusage 看板同策略)。
// ============================================================================

package vip

import (
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminOrderRow 订单列表一行(订单全字段 + 用户展示名)。
type AdminOrderRow struct {
	Order
	Username string `json:"username"`
	Email    string `json:"email"`
}

// AdminOrderFilter 列表/统计共用过滤。
type AdminOrderFilter struct {
	Status    string // pending | paid | expired
	OrderType string // recharge | subscription
	Keyword   string // 用户 ID / 用户名 / 邮箱 / 手机号
	Days      int    // 回看天数(按 created_at;含今天共 Days 个自然日)
}

// adminOrderCutoff 窗口起点(与 llmusage.cutoff 同口径:-(days-1),含今天共 days 天)。
func adminOrderCutoff(days int) time.Time {
	if days <= 0 {
		days = 30
	}
	now := time.Now()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return day0.AddDate(0, 0, -(days - 1))
}

// AdminList 分页订单列表(全部用户、全部状态)。
func (o *OrderService) AdminList(f AdminOrderFilter, limit, offset int) ([]AdminOrderRow, int64, error) {
	base := o.db.Table("orders").
		Joins("LEFT JOIN users ON users.id = orders.user_id").
		Where("orders.created_at >= ?", adminOrderCutoff(f.Days))
	if f.Status != "" {
		base = base.Where("orders.status = ?", f.Status)
	}
	if f.OrderType != "" {
		base = base.Where("orders.order_type = ?", f.OrderType)
	}
	if sql, args := utils.UserSearchClause(f.Keyword, "users.id", "users.username", "users.email", "users.phone"); sql != "" {
		base = base.Where(sql, args...)
	}

	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []AdminOrderRow
	err := base.
		Select("orders.*, COALESCE(users.username,'') AS username, COALESCE(users.email,'') AS email").
		Order("orders.created_at DESC").
		Limit(limit).Offset(offset).
		Scan(&rows).Error
	return rows, total, err
}

// AdminOrderTotals 窗口内 KPI。
type AdminOrderTotals struct {
	Revenue             float64 `json:"revenue"`              // 窗口内已支付总额
	RechargeRevenue     float64 `json:"recharge_revenue"`     // 其中:充值
	SubscriptionRevenue float64 `json:"subscription_revenue"` // 其中:订阅
	RevenueToday        float64 `json:"revenue_today"`
	PaidCount           int64   `json:"paid_count"`
	PendingCount        int64   `json:"pending_count"`
	ExpiredCount        int64   `json:"expired_count"`
	RedeemedCodes       int64   `json:"redeemed_codes"` // 窗口内兑换码核销数
}

// AdminRevenueDay 每日营收一格(充值/订阅 两段,前端堆叠柱)。
type AdminRevenueDay struct {
	Date         string  `json:"date"`
	Recharge     float64 `json:"recharge"`
	Subscription float64 `json:"subscription"`
	Orders       int64   `json:"orders"`
}

// AdminOrderStatsResult 统计端点响应。
type AdminOrderStatsResult struct {
	Days   int               `json:"days"`
	Totals AdminOrderTotals  `json:"totals"`
	Daily  []AdminRevenueDay `json:"daily"`
}

// AdminStats 窗口内营收 KPI + 每日趋势(已支付口径按 payment_time;状态计数按 created_at)。
func (o *OrderService) AdminStats(days int) (*AdminOrderStatsResult, error) {
	if days <= 0 {
		days = 30
	}
	cutoff := adminOrderCutoff(days)
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	res := &AdminOrderStatsResult{Days: days, Daily: []AdminRevenueDay{}}
	t := &res.Totals

	// 营收(已支付,按支付时间落窗口;一次查出 总额/充值/订阅/单数)
	type revRow struct {
		Revenue      float64
		Recharge     float64
		Subscription float64
		Paid         int64
	}
	var rv revRow
	if err := o.db.Table("orders").
		Select("COALESCE(SUM(final_amount),0) AS revenue, "+
			"COALESCE(SUM(CASE WHEN order_type='recharge' THEN final_amount END),0) AS recharge, "+
			"COALESCE(SUM(CASE WHEN order_type='subscription' THEN final_amount END),0) AS subscription, "+
			"COUNT(*) AS paid").
		Where("status = 'paid' AND payment_time >= ?", cutoff).
		Scan(&rv).Error; err != nil {
		return nil, err
	}
	t.Revenue, t.RechargeRevenue, t.SubscriptionRevenue, t.PaidCount = rv.Revenue, rv.Recharge, rv.Subscription, rv.Paid

	o.db.Table("orders").
		Select("COALESCE(SUM(final_amount),0)").
		Where("status = 'paid' AND payment_time >= ?", todayStart).
		Scan(&t.RevenueToday)
	o.db.Table("orders").Where("status = 'pending' AND created_at >= ?", cutoff).Count(&t.PendingCount)
	o.db.Table("orders").Where("status = 'expired' AND created_at >= ?", cutoff).Count(&t.ExpiredCount)
	o.db.Table("vip_code_redemptions").Where("created_at >= ?", cutoff).Count(&t.RedeemedCodes)

	// 每日营收(充值/订阅 拆段)。DATE_FORMAT 而非 DATE():DSN parseTime 坑(同 llmusage)。
	var sparse []AdminRevenueDay
	err := o.db.Table("orders").
		Select("DATE_FORMAT(payment_time, '%Y-%m-%d') AS date, "+
			"COALESCE(SUM(CASE WHEN order_type='recharge' THEN final_amount END),0) AS recharge, "+
			"COALESCE(SUM(CASE WHEN order_type='subscription' THEN final_amount END),0) AS subscription, "+
			"COUNT(*) AS orders").
		Where("status = 'paid' AND payment_time >= ?", cutoff).
		Group("DATE_FORMAT(payment_time, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&sparse).Error
	if err != nil {
		return nil, err
	}
	// 补成 [cutoff .. 今天] 连续日(缺失日补 0),否则没有订单的天会被折线跳过、最后一桶也不一定是今天。
	byDate := make(map[string]AdminRevenueDay, len(sparse))
	for _, d := range sparse {
		byDate[d.Date] = d
	}
	for d := cutoff; !d.After(todayStart); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		if row, ok := byDate[ds]; ok {
			res.Daily = append(res.Daily, row)
		} else {
			res.Daily = append(res.Daily, AdminRevenueDay{Date: ds})
		}
	}
	return res, nil
}

// ─── HTTP handlers(AdminAuthMiddleware 之后)───────────────────────────────

// AdminListOrders GET /admin/billing/orders?page=&page_size=&status=&type=&keyword=&days=
func (h *Handler) AdminListOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	f := AdminOrderFilter{
		Status:    c.Query("status"),
		OrderType: c.Query("type"),
		Keyword:   c.Query("keyword"),
		Days:      days,
	}
	rows, total, err := h.svc.Order().AdminList(f, pageSize, (page-1)*pageSize)
	if err != nil {
		utils.ServerError(c, "获取订单列表失败")
		return
	}
	utils.Success(c, gin.H{"items": rows, "total": total})
}

// AdminOrderStats GET /admin/billing/orders/stats?days=30 —— 营收 KPI + 每日趋势。
func (h *Handler) AdminOrderStats(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	res, err := h.svc.Order().AdminStats(days)
	if err != nil {
		utils.ServerError(c, "获取营收统计失败")
		return
	}
	utils.Success(c, res)
}

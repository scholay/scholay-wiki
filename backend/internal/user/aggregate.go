// Package user — admin 端"用户详情聚合"查询
//
// 用 GET /admin/users/:id/aggregate 一次拿到:
//   - 基础信息(GetUserDetail 返回的所有字段)
//   - 最近 10 个订单
//   - 最近 10 条反馈
//   - 最近 10 个活跃会话
//
// 故意用 GORM raw query 不引入 order/feedback 模块依赖
// (跨模块直接 import 容易循环依赖)
package user

import (
	"time"

	"scholar-backend/internal/common/database"
)

// AggregateOrder 详情页订单卡片用的轻量数据
type AggregateOrder struct {
	ID            uint      `json:"id"`
	OrderNo       string    `json:"order_no"`
	OrderType     string    `json:"order_type"`
	PlanName      *string   `json:"plan_name"`
	BillingCycle  *string   `json:"billing_cycle"`
	Status        string    `json:"status"`
	PaidAmount    float64   `json:"paid_amount"`
	CreatedAt     time.Time `json:"created_at"`
}

// AggregateFeedback 详情页反馈卡片用的轻量数据
type AggregateFeedback struct {
	ID        uint      `json:"id"`
	Status    string    `json:"status"`
	Category  string    `json:"category"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// AggregateSession 详情页活跃会话(单点登录信息)
type AggregateSession struct {
	ID           uint      `json:"id"`
	DeviceType   string    `json:"device_type"`
	IP           *string   `json:"ip"`
	UserAgent    *string   `json:"user_agent"`
	LastActiveAt time.Time `json:"last_active_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// UserAggregate UserDetail 的扩展,包含跨模块聚合数据
type UserAggregate struct {
	*UserDetail
	Orders    []AggregateOrder    `json:"orders"`
	Feedbacks []AggregateFeedback `json:"feedbacks"`
	Sessions  []AggregateSession  `json:"sessions"`
}

// GetUserAggregate 拼装用户详情 + 跨模块聚合
func (s *Service) GetUserAggregate(userID uint) (*UserAggregate, error) {
	detail, err := s.GetUserDetail(userID)
	if err != nil {
		return nil, err
	}

	db := database.GetDB()

	var orders []AggregateOrder
	db.Table("orders").
		Select("id, order_no, order_type, plan_name, billing_cycle, status, paid_amount, created_at").
		Where("user_id = ?", userID).
		Order("created_at DESC, id DESC").
		Limit(10).
		Find(&orders)

	var feedbacks []AggregateFeedback
	db.Table("feedbacks").
		Select("id, status, COALESCE(category,'other') AS category, LEFT(content, 200) AS content, created_at").
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("created_at DESC, id DESC").
		Limit(10).
		Find(&feedbacks)

	var sessions []AggregateSession
	// user_sessions.last_activity 是实际字段名(0001_fields.sql L7)
	db.Table("user_sessions").
		Select("id, device_type, ip, user_agent, last_activity AS last_active_at, created_at").
		Where("user_id = ?", userID).
		Order("created_at DESC, id DESC").
		Limit(10).
		Find(&sessions)

	return &UserAggregate{
		UserDetail: detail,
		Orders:     orders,
		Feedbacks:  feedbacks,
		Sessions:   sessions,
	}, nil
}

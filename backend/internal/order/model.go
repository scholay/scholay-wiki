// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package order

import "time"

// OrderType 订单类型
const (
	OrderTypeSubscription = "subscription" // 会员订阅
	OrderTypeRecharge     = "recharge"     // 恩特币充值
)

// Order represents an order (subscription or recharge)
type Order struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	UserID         uint       `gorm:"not null;index" json:"user_id"`
	OrderNo        string     `gorm:"uniqueIndex;size:64;not null" json:"order_no"`
	OrderType      string     `gorm:"size:20;not null;default:'subscription'" json:"order_type"` // subscription, recharge
	PlanCode       string     `gorm:"size:20" json:"plan_code"`                                  // 会员订阅时的套餐代码
	PlanName       string     `gorm:"size:50" json:"plan_name"`                                  // 会员订阅时的套餐名称
	BillingCycle   string     `gorm:"size:20" json:"billing_cycle"`                              // monthly or yearly (会员订阅用)
	DiamondAmount  int64      `gorm:"default:0" json:"diamond_amount"`                           // 恩特币数量（充值用）
	BonusAmount    int64      `gorm:"default:0" json:"bonus_amount"`                             // 赠送数量（充值用）
	Amount         float64    `gorm:"type:decimal(10,2);not null" json:"amount"`                 // Original amount before discount
	CouponID       *uint64    `gorm:"index" json:"coupon_id"`                                    // Which coupon was applied (nullable)
	DiscountAmount float64    `gorm:"type:decimal(10,2);default:0" json:"discount_amount"`       // Amount discounted
	FinalAmount    float64    `gorm:"type:decimal(10,2);not null" json:"final_amount"`           // Final amount after discount (what user pays)
	Status         string     `gorm:"size:20;not null;default:'pending'" json:"status"`          // pending, paid, cancelled, refunded
	PaymentMethod  string     `gorm:"size:50" json:"payment_method"`
	PaymentTime    *time.Time `json:"payment_time"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// PaymentTransaction represents a payment transaction record
type PaymentTransaction struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	OrderID       uint      `gorm:"not null;index" json:"order_id"`
	TransactionNo string    `gorm:"size:100;index" json:"transaction_no"`
	PaymentMethod string    `gorm:"size:50;not null" json:"payment_method"`
	Amount        float64   `gorm:"type:decimal(10,2);not null" json:"amount"`
	Status        string    `gorm:"size:20;not null;default:'pending'" json:"status"` // pending, success, failed
	PaymentData   string    `gorm:"type:json;default:'{}'" json:"payment_data"` // IMPORTANT: MySQL JSON type cannot be empty string, use {} or null
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TableName specifies the table name for Order
func (Order) TableName() string {
	return "orders"
}

// TableName specifies the table name for PaymentTransaction
func (PaymentTransaction) TableName() string {
	return "payment_transactions"
}

// OrderWithUserInfo represents an order with user information for admin display
type OrderWithUserInfo struct {
	Order
	Username      *string `gorm:"column:username" json:"username"`
	Email         *string `gorm:"column:email" json:"email"`
	Phone         *string `gorm:"column:phone" json:"phone"`
	WechatName    *string `gorm:"column:wechat_name" json:"wechat_name"`
	WechatUnionID *string `gorm:"column:wechat_union_id" json:"wechat_union_id"`
	GithubName    *string `gorm:"column:github_name" json:"github_name"`
}

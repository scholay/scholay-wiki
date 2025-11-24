package order

import "time"

// Order represents a subscription order
type Order struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	UserID         uint       `gorm:"not null;index" json:"user_id"`
	OrderNo        string     `gorm:"uniqueIndex;size:64;not null" json:"order_no"`
	PlanCode       string     `gorm:"size:20;not null" json:"plan_code"`
	PlanName       string     `gorm:"size:50;not null" json:"plan_name"`
	BillingCycle   string     `gorm:"size:20;not null" json:"billing_cycle"` // monthly or yearly
	Amount         float64    `gorm:"type:decimal(10,2);not null" json:"amount"` // Original amount before discount
	CouponID       *uint64    `gorm:"index" json:"coupon_id"` // Which coupon was applied (nullable)
	DiscountAmount float64    `gorm:"type:decimal(10,2);default:0" json:"discount_amount"` // Amount discounted
	FinalAmount    float64    `gorm:"type:decimal(10,2);not null" json:"final_amount"` // Final amount after discount (what user pays)
	Status         string     `gorm:"size:20;not null;default:'pending'" json:"status"` // pending, paid, cancelled, refunded
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

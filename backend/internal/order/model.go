package order

import "time"

// Order represents a subscription order
type Order struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"not null;index" json:"user_id"`
	OrderNo       string    `gorm:"uniqueIndex;size:64;not null" json:"order_no"`
	PlanCode      string    `gorm:"size:20;not null" json:"plan_code"`
	PlanName      string    `gorm:"size:50;not null" json:"plan_name"`
	BillingCycle  string    `gorm:"size:20;not null" json:"billing_cycle"` // monthly or yearly
	Amount        float64   `gorm:"type:decimal(10,2);not null" json:"amount"`
	Status        string    `gorm:"size:20;not null;default:'pending'" json:"status"` // pending, paid, cancelled, refunded
	PaymentMethod string    `gorm:"size:50" json:"payment_method"`
	PaymentTime   *time.Time `json:"payment_time"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// PaymentTransaction represents a payment transaction record
type PaymentTransaction struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	OrderID       uint      `gorm:"not null;index" json:"order_id"`
	TransactionNo string    `gorm:"size:100;index" json:"transaction_no"`
	PaymentMethod string    `gorm:"size:50;not null" json:"payment_method"`
	Amount        float64   `gorm:"type:decimal(10,2);not null" json:"amount"`
	Status        string    `gorm:"size:20;not null;default:'pending'" json:"status"` // pending, success, failed
	PaymentData   string    `gorm:"type:json" json:"payment_data"`
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

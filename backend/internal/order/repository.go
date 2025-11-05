package order

import (
	"gorm.io/gorm"
)

// Repository handles database operations for orders
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new order repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// CreateOrder creates a new order
func (r *Repository) CreateOrder(order *Order) error {
	return r.db.Create(order).Error
}

// GetOrderByID retrieves an order by ID
func (r *Repository) GetOrderByID(orderID uint) (*Order, error) {
	var order Order
	err := r.db.Where("id = ?", orderID).First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// GetOrderByOrderNo retrieves an order by order number
func (r *Repository) GetOrderByOrderNo(orderNo string) (*Order, error) {
	var order Order
	err := r.db.Where("order_no = ?", orderNo).First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// GetUserOrders retrieves all orders for a user
func (r *Repository) GetUserOrders(userID uint, limit, offset int) ([]Order, int64, error) {
	var orders []Order
	var total int64

	// Get total count
	if err := r.db.Model(&Order{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get orders with pagination
	err := r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&orders).Error

	if err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// UpdateOrder updates an order
func (r *Repository) UpdateOrder(order *Order) error {
	return r.db.Save(order).Error
}

// UpdateOrderStatus updates order status and payment information
func (r *Repository) UpdateOrderStatus(orderID uint, status, paymentMethod string) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if paymentMethod != "" {
		updates["payment_method"] = paymentMethod
	}
	if status == "paid" {
		updates["payment_time"] = gorm.Expr("NOW()")
	}

	return r.db.Model(&Order{}).Where("id = ?", orderID).Updates(updates).Error
}

// CreatePaymentTransaction creates a payment transaction record
func (r *Repository) CreatePaymentTransaction(tx *PaymentTransaction) error {
	return r.db.Create(tx).Error
}

// GetPaymentTransactionsByOrderID retrieves all payment transactions for an order
func (r *Repository) GetPaymentTransactionsByOrderID(orderID uint) ([]PaymentTransaction, error) {
	var transactions []PaymentTransaction
	err := r.db.Where("order_id = ?", orderID).
		Order("created_at DESC").
		Find(&transactions).Error

	if err != nil {
		return nil, err
	}
	return transactions, nil
}

// UpdatePaymentTransaction updates a payment transaction
func (r *Repository) UpdatePaymentTransaction(tx *PaymentTransaction) error {
	return r.db.Save(tx).Error
}

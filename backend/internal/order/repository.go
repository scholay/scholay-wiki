// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package order

import (
	"time"

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
	updates := map[string]any{
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

// GetUserPaidOrders retrieves only paid orders for a user
func (r *Repository) GetUserPaidOrders(userID uint, limit, offset int) ([]Order, int64, error) {
	var orders []Order
	var total int64

	// Get total count of paid orders
	if err := r.db.Model(&Order{}).Where("user_id = ? AND status = ?", userID, "paid").Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paid orders with pagination
	err := r.db.Where("user_id = ? AND status = ?", userID, "paid").
		Order("payment_time DESC").
		Limit(limit).
		Offset(offset).
		Find(&orders).Error

	if err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// GetOrderStatistics retrieves order statistics (admin only)
func (r *Repository) GetOrderStatistics() (*OrderStatistics, error) {
	stats := &OrderStatistics{}
	now := time.Now()

	// Today statistics
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	r.db.Model(&Order{}).
		Where("status = ? AND payment_time >= ?", "paid", todayStart).
		Select("COALESCE(SUM(final_amount), 0) as today_amount, COUNT(*) as today_count, COUNT(DISTINCT user_id) as today_users").
		Scan(stats)

	// Week statistics
	weekStart := todayStart.AddDate(0, 0, -int(now.Weekday()))
	r.db.Model(&Order{}).
		Where("status = ? AND payment_time >= ?", "paid", weekStart).
		Select("COALESCE(SUM(final_amount), 0) as week_amount, COUNT(*) as week_count, COUNT(DISTINCT user_id) as week_users").
		Scan(stats)

	// Month statistics
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	r.db.Model(&Order{}).
		Where("status = ? AND payment_time >= ?", "paid", monthStart).
		Select("COALESCE(SUM(final_amount), 0) as month_amount, COUNT(*) as month_count, COUNT(DISTINCT user_id) as month_users").
		Scan(stats)

	// Total statistics
	r.db.Model(&Order{}).
		Where("status = ?", "paid").
		Select("COALESCE(SUM(final_amount), 0) as total_amount, COUNT(*) as total_count, COUNT(DISTINCT user_id) as total_users").
		Scan(stats)

	return stats, nil
}

// AdminListOrders retrieves all paid orders with optional filters and user information (admin only)
func (r *Repository) AdminListOrders(planCode, userEmail string, limit, offset int) ([]OrderWithUserInfo, int64, error) {
	var orders []OrderWithUserInfo
	var total int64

	// Base query with user join
	query := r.db.Table("orders").
		Select(`orders.*, 
			users.username, 
			users.email, 
			users.phone,
			JSON_UNQUOTE(JSON_EXTRACT(wechat_providers.provider_data, '$.nickname')) as wechat_name,
			wechat_providers.provider_union_id as wechat_union_id,
			JSON_UNQUOTE(JSON_EXTRACT(github_providers.provider_data, '$.login')) as github_name`).
		Joins("LEFT JOIN users ON users.id = orders.user_id").
		Joins("LEFT JOIN user_auth_providers as wechat_providers ON wechat_providers.user_id = orders.user_id AND wechat_providers.provider = 'wechat'").
		Joins("LEFT JOIN user_auth_providers as github_providers ON github_providers.user_id = orders.user_id AND github_providers.provider = 'github'").
		Where("orders.status = ?", "paid")

	// Apply filters
	if planCode != "" {
		query = query.Where("orders.plan_code = ?", planCode)
	}

	if userEmail != "" {
		query = query.Where("users.email LIKE ?", "%"+userEmail+"%")
	}

	// Get total count
	countQuery := r.db.Table("orders").
		Joins("LEFT JOIN users ON users.id = orders.user_id").
		Where("orders.status = ?", "paid")
	
	if planCode != "" {
		countQuery = countQuery.Where("orders.plan_code = ?", planCode)
	}
	if userEmail != "" {
		countQuery = countQuery.Where("users.email LIKE ?", "%"+userEmail+"%")
	}
	
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get orders with pagination
	err := query.Order("orders.payment_time DESC").
		Limit(limit).
		Offset(offset).
		Scan(&orders).Error

	if err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// ExecuteInTransaction runs the given function inside a database transaction.
func (r *Repository) ExecuteInTransaction(fn func(tx *gorm.DB) error) error {
	return r.db.Transaction(fn)
}

// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package order

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// Service handles business logic for orders
type Service struct {
	repo *Repository
	db   *gorm.DB
}

// NewService creates a new order service
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: NewRepository(db),
		db:   db,
	}
}

// CreateOrderRequest represents the request to create an order
type CreateOrderRequest struct {
	PlanCode     string  `json:"plan_code" binding:"required"`
	PlanName     string  `json:"plan_name"`
	BillingCycle string  `json:"billing_cycle" binding:"required"` // monthly or yearly
	Amount       float64 `json:"amount" binding:"required"`
}

// CreateOrder creates a new order for a user
func (s *Service) CreateOrder(userID uint, req CreateOrderRequest) (*Order, error) {
	if req.BillingCycle != "monthly" && req.BillingCycle != "yearly" {
		return nil, errors.New("invalid billing cycle")
	}

	orderNo := fmt.Sprintf("ORD%d%d", time.Now().Unix(), userID)

	order := &Order{
		UserID:       userID,
		OrderNo:      orderNo,
		PlanCode:     req.PlanCode,
		PlanName:     req.PlanName,
		BillingCycle: req.BillingCycle,
		Amount:       req.Amount,
		FinalAmount:  req.Amount,
		Status:       "pending",
	}

	if err := s.repo.CreateOrder(order); err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	return order, nil
}

// GetUserOrders retrieves orders for a user
func (s *Service) GetUserOrders(userID uint, page, pageSize int) ([]Order, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	return s.repo.GetUserOrders(userID, pageSize, offset)
}

// GetUserPaidOrders retrieves only paid orders for a user (for billing history)
func (s *Service) GetUserPaidOrders(userID uint, page, pageSize int) ([]Order, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	return s.repo.GetUserPaidOrders(userID, pageSize, offset)
}

// GetOrderByID retrieves an order by ID
func (s *Service) GetOrderByID(orderID uint) (*Order, error) {
	return s.repo.GetOrderByID(orderID)
}

// GetOrderByOrderNo retrieves an order by order number
func (s *Service) GetOrderByOrderNo(orderNo string) (*Order, error) {
	return s.repo.GetOrderByOrderNo(orderNo)
}

// ProcessPaymentRequest represents a payment processing request
type ProcessPaymentRequest struct {
	OrderNo       string `json:"order_no" binding:"required"`
	PaymentMethod string `json:"payment_method" binding:"required"`
}

// ProcessPayment processes a payment for an order (mock implementation)
func (s *Service) ProcessPayment(userID uint, req ProcessPaymentRequest) error {
	// Get order
	order, err := s.repo.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Verify order belongs to user
	if order.UserID != userID {
		return errors.New("unauthorized: order does not belong to user")
	}

	// Check if order is already paid
	if order.Status == "paid" {
		return errors.New("order already paid")
	}

	// Check if order is cancelled
	if order.Status == "cancelled" {
		return errors.New("order is cancelled")
	}

	// Create payment transaction record
	transaction := &PaymentTransaction{
		OrderID:       order.ID,
		PaymentMethod: req.PaymentMethod,
		Amount:        order.Amount,
		Status:        "pending",
		PaymentData:   "{}", // Initialize with empty JSON object (MySQL JSON type cannot be empty string)
	}

	if err := s.repo.CreatePaymentTransaction(transaction); err != nil {
		return fmt.Errorf("failed to create payment transaction: %w", err)
	}

	// Mock payment processing - in production, integrate with real payment gateway
	// For now, we'll mark the payment as success immediately
	transaction.Status = "success"
	transaction.TransactionNo = fmt.Sprintf("TXN%d%d", time.Now().Unix(), order.ID)

	if err := s.repo.UpdatePaymentTransaction(transaction); err != nil {
		return fmt.Errorf("failed to update payment transaction: %w", err)
	}

	// Update order status
	if err := s.repo.UpdateOrderStatus(order.ID, "paid", req.PaymentMethod); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	return nil
}

// CancelOrder cancels a pending order
func (s *Service) CancelOrder(userID uint, orderNo string) error {
	// Get order
	order, err := s.repo.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Verify order belongs to user
	if order.UserID != userID {
		return errors.New("unauthorized: order does not belong to user")
	}

	// Check if order can be cancelled
	if order.Status != "pending" {
		return errors.New("only pending orders can be cancelled")
	}

	// Update order status
	if err := s.repo.UpdateOrderStatus(order.ID, "cancelled", ""); err != nil {
		return fmt.Errorf("failed to cancel order: %w", err)
	}

	return nil
}

// processPaymentCallback is the common implementation for all payment provider callbacks.
func (s *Service) processPaymentCallback(orderNo, transactionNo string, amount float64, method string, callbackData interface{}) error {
	order, err := s.repo.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}
	if order.Status == "paid" {
		log.Printf("Order %s already processed, skipping\n", orderNo)
		return nil
	}
	if order.Status == "cancelled" {
		return errors.New("order is cancelled")
	}

	callbackJSON, err := json.Marshal(callbackData)
	if err != nil {
		return fmt.Errorf("failed to marshal callback data: %w", err)
	}

	transaction := &PaymentTransaction{
		OrderID:       order.ID,
		TransactionNo: transactionNo,
		PaymentMethod: method,
		Amount:        amount,
		Status:        "success",
		PaymentData:   string(callbackJSON),
	}
	if err := s.repo.CreatePaymentTransaction(transaction); err != nil {
		return fmt.Errorf("failed to create payment transaction: %w", err)
	}
	if err := s.repo.UpdateOrderStatus(order.ID, "paid", method); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	log.Printf("Payment (%s) processed successfully for order %s\n", method, orderNo)
	return nil
}

// ProcessAlipayCallback processes an Alipay payment callback
func (s *Service) ProcessAlipayCallback(orderNo, transactionNo string, amount float64, callbackData map[string]string) error {
	return s.processPaymentCallback(orderNo, transactionNo, amount, "alipay", callbackData)
}

// ProcessWeChatPayCallback processes a WeChat Pay payment callback
func (s *Service) ProcessWeChatPayCallback(orderNo, transactionNo string, amount float64, callbackData map[string]interface{}) error {
	return s.processPaymentCallback(orderNo, transactionNo, amount, "wechat", callbackData)
}

// OrderStatistics represents order statistics
type OrderStatistics struct {
	TodayAmount    float64 `json:"today_amount"`
	TodayCount     int64   `json:"today_count"`
	TodayUsers     int64   `json:"today_users"`
	WeekAmount     float64 `json:"week_amount"`
	WeekCount      int64   `json:"week_count"`
	WeekUsers      int64   `json:"week_users"`
	MonthAmount    float64 `json:"month_amount"`
	MonthCount     int64   `json:"month_count"`
	MonthUsers     int64   `json:"month_users"`
	TotalAmount    float64 `json:"total_amount"`
	TotalCount     int64   `json:"total_count"`
	TotalUsers     int64   `json:"total_users"`
}

// GetOrderStatistics retrieves order statistics (admin only)
func (s *Service) GetOrderStatistics() (*OrderStatistics, error) {
	return s.repo.GetOrderStatistics()
}

// AdminListOrders retrieves all paid orders with filters and user information (admin only)
func (s *Service) AdminListOrders(planCode, userEmail string, page, pageSize int) ([]OrderWithUserInfo, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	return s.repo.AdminListOrders(planCode, userEmail, pageSize, offset)
}


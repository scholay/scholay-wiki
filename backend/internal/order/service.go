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
	"time"

	"scholar-backend/internal/coupon"
	"scholar-backend/internal/subscription"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MembershipGiftService 会员赠送服务接口
type MembershipGiftService interface {
	GiftOnActivation(userID uint, planCode string) (any, error)
}

// Service handles business logic for orders
type Service struct {
	repo               *Repository
	subsService        *subscription.Service
	couponRepo         *coupon.Repository
	db                 *gorm.DB
	membershipGiftSvc  MembershipGiftService
}

// NewService creates a new order service
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo:        NewRepository(db),
		subsService: subscription.NewService(db),
		couponRepo:  coupon.NewRepository(db),
		db:          db,
	}
}

// SetMembershipGiftService 设置会员赠送服务
func (s *Service) SetMembershipGiftService(svc MembershipGiftService) {
	s.membershipGiftSvc = svc
}

// giftMembershipReward 赠送会员奖励
func (s *Service) giftMembershipReward(userID uint, planCode string) {
	if s.membershipGiftSvc == nil {
		return
	}
	if planCode != "pro" && planCode != "max" {
		return
	}
	go func() {
		result, err := s.membershipGiftSvc.GiftOnActivation(userID, planCode)
		if err != nil {
			fmt.Printf("⚠ Warning: Failed to gift membership reward to user %d: %v\n", userID, err)
		} else {
			fmt.Printf("✓ Membership reward gifted to user %d for plan %s: %+v\n", userID, planCode, result)
		}
	}()
}

// CreateOrderRequest represents the request to create an order
type CreateOrderRequest struct {
	PlanCode     string  `json:"plan_code" binding:"required"`
	BillingCycle string  `json:"billing_cycle" binding:"required"` // monthly or yearly
	CouponID     *uint64 `json:"coupon_id"` // Optional coupon ID
}

// CreateOrder creates a new order for a user with optional coupon
func (s *Service) CreateOrder(userID uint, req CreateOrderRequest) (*Order, error) {
	// Validate billing cycle
	if req.BillingCycle != "monthly" && req.BillingCycle != "yearly" {
		return nil, errors.New("invalid billing cycle")
	}

	// Get plan details
	plan, err := s.subsService.GetPlanByCode(req.PlanCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get plan: %w", err)
	}

	// Calculate original amount using current prices
	var amount float64
	if req.BillingCycle == "monthly" {
		amount = plan.CurrentPriceMonthly
	} else {
		amount = plan.CurrentPriceYearly
	}

	// Initialize discount variables
	var discountAmount float64 = 0
	var finalAmount float64 = amount
	var couponID *uint64 = nil

	// If coupon is provided, validate and apply it
	if req.CouponID != nil && *req.CouponID > 0 {
		// Use a database transaction to ensure atomicity and prevent concurrent usage
		err := s.db.Transaction(func(tx *gorm.DB) error {
			// Get the coupon with pessimistic lock (SELECT FOR UPDATE)
			var userCoupon coupon.UserCoupon
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND user_id = ? AND status = ?",
					*req.CouponID, userID, coupon.CouponStatusUnused).
				First(&userCoupon).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errors.New("coupon not found or already used")
				}
				return fmt.Errorf("failed to get coupon: %w", err)
			}

			// Preload template
			if err := tx.Preload("Template").First(&userCoupon, userCoupon.ID).Error; err != nil {
				return fmt.Errorf("failed to load coupon template: %w", err)
			}

			// Validate coupon
			if userCoupon.Template == nil {
				return errors.New("coupon template not found")
			}

			// Check if template is active
			if userCoupon.Template.Status != coupon.TemplateStatusActive {
				return errors.New("coupon template is not active")
			}

			// Check if coupon is valid (time range)
			now := time.Now()
			if now.Before(userCoupon.ValidFrom) || now.After(userCoupon.ValidUntil) {
				return errors.New("coupon is expired or not yet valid")
			}

			// Check minimum purchase amount
			if amount < userCoupon.MinPurchaseAmount {
				return fmt.Errorf("order amount %.2f is less than minimum required %.2f",
					amount, userCoupon.MinPurchaseAmount)
			}

			// Calculate discount
			discountAmount = coupon.CalculateDiscount(
				userCoupon.Template.Type,
				userCoupon.DiscountValue,
				amount,
			)

			finalAmount = amount - discountAmount
			if finalAmount < 0 {
				finalAmount = 0
			}

			couponID = req.CouponID

			// Mark coupon as reserved (we'll mark it as used when payment succeeds)
			// For now, just update the status to "reserved" to prevent concurrent usage
			userCoupon.Status = coupon.CouponStatusReserved
			if err := tx.Save(&userCoupon).Error; err != nil {
				return fmt.Errorf("failed to reserve coupon: %w", err)
			}

			return nil
		})

		if err != nil {
			return nil, fmt.Errorf("coupon validation failed: %w", err)
		}
	}

	// Generate order number (timestamp + user_id)
	orderNo := fmt.Sprintf("ORD%d%d", time.Now().Unix(), userID)

	// Create order with coupon information
	order := &Order{
		UserID:         userID,
		OrderNo:        orderNo,
		PlanCode:       plan.PlanCode,
		PlanName:       plan.PlanName,
		BillingCycle:   req.BillingCycle,
		Amount:         amount,
		CouponID:       couponID,
		DiscountAmount: discountAmount,
		FinalAmount:    finalAmount,
		Status:         "pending",
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

	// Calculate subscription duration
	var duration int
	if order.BillingCycle == "monthly" {
		duration = 1
	} else {
		duration = 12
	}

	// Upgrade user subscription
	if err := s.subsService.UpgradeSubscription(userID, order.PlanCode, duration); err != nil {
		return fmt.Errorf("failed to upgrade subscription: %w", err)
	}

	// Gift membership reward (经费/钻石)
	s.giftMembershipReward(userID, order.PlanCode)

	return nil
}

// CancelOrder cancels an order and unreserves the coupon if applicable
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

	// If order has a reserved coupon, unreserve it
	if order.CouponID != nil && *order.CouponID > 0 {
		// Change coupon status back to unused
		if err := s.couponRepo.UpdateUserCoupon(*order.CouponID, map[string]interface{}{
			"status": coupon.CouponStatusUnused,
		}); err != nil {
			// Log error but continue with cancellation
			fmt.Printf("⚠ Warning: Failed to unreserve coupon %d: %v\n", *order.CouponID, err)
		} else {
			fmt.Printf("✓ Coupon %d unreserved after order cancellation\n", *order.CouponID)
		}
	}

	// Update order status
	if err := s.repo.UpdateOrderStatus(order.ID, "cancelled", ""); err != nil {
		return fmt.Errorf("failed to cancel order: %w", err)
	}

	return nil
}

// ProcessAlipayCallback processes an Alipay payment callback
// This is called by the payment handler after signature verification
func (s *Service) ProcessAlipayCallback(orderNo, transactionNo string, amount float64, callbackData map[string]string) error {
	// Get order
	order, err := s.repo.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Check if order is already paid
	if order.Status == "paid" {
		fmt.Printf("✓ Order %s already processed, skipping\n", orderNo)
		return nil
	}

	// Check if order is cancelled
	if order.Status == "cancelled" {
		return errors.New("order is cancelled")
	}

	// Convert callback data to JSON string for storage
	callbackJSON, err := json.Marshal(callbackData)
	if err != nil {
		return fmt.Errorf("failed to marshal callback data: %w", err)
	}

	// Create payment transaction record with callback data
	transaction := &PaymentTransaction{
		OrderID:       order.ID,
		TransactionNo: transactionNo,
		PaymentMethod: "alipay",
		Amount:        amount,
		Status:        "success",
		PaymentData:   string(callbackJSON), // Store complete callback data
	}

	if err := s.repo.CreatePaymentTransaction(transaction); err != nil {
		return fmt.Errorf("failed to create payment transaction: %w", err)
	}

	// Update order status
	if err := s.repo.UpdateOrderStatus(order.ID, "paid", "alipay"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Calculate subscription duration
	var duration int
	if order.BillingCycle == "monthly" {
		duration = 1
	} else {
		duration = 12
	}

	// Upgrade user subscription
	if err := s.subsService.UpgradeSubscription(order.UserID, order.PlanCode, duration); err != nil {
		return fmt.Errorf("failed to upgrade subscription: %w", err)
	}

	// Gift membership reward (经费/钻石)
	s.giftMembershipReward(order.UserID, order.PlanCode)

	// Mark coupon as used if order has a coupon
	if order.CouponID != nil && *order.CouponID > 0 {
		if err := s.couponRepo.UseCoupon(*order.CouponID, uint64(order.ID)); err != nil {
			// Log error but don't fail the payment process
			fmt.Printf("⚠ Warning: Failed to mark coupon %d as used: %v\n", *order.CouponID, err)
		} else {
			fmt.Printf("✓ Coupon %d marked as used for order %s\n", *order.CouponID, orderNo)
		}
	}

	fmt.Printf("✓ Alipay payment processed successfully for order %s\n", orderNo)
	return nil
}

// ProcessWeChatPayCallback processes a WeChat Pay payment callback
// This is called by the payment handler after signature verification
func (s *Service) ProcessWeChatPayCallback(orderNo, transactionNo string, amount float64, callbackData map[string]interface{}) error {
	// Get order
	order, err := s.repo.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Check if order is already paid
	if order.Status == "paid" {
		fmt.Printf("✓ Order %s already processed, skipping\n", orderNo)
		return nil
	}

	// Check if order is cancelled
	if order.Status == "cancelled" {
		return errors.New("order is cancelled")
	}

	// Convert callback data to JSON string for storage
	callbackJSON, err := json.Marshal(callbackData)
	if err != nil {
		return fmt.Errorf("failed to marshal callback data: %w", err)
	}

	// Create payment transaction record with callback data
	transaction := &PaymentTransaction{
		OrderID:       order.ID,
		TransactionNo: transactionNo,
		PaymentMethod: "wechat",
		Amount:        amount,
		Status:        "success",
		PaymentData:   string(callbackJSON), // Store complete callback data
	}

	if err := s.repo.CreatePaymentTransaction(transaction); err != nil {
		return fmt.Errorf("failed to create payment transaction: %w", err)
	}

	// Update order status
	if err := s.repo.UpdateOrderStatus(order.ID, "paid", "wechat"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Calculate subscription duration
	var duration int
	if order.BillingCycle == "monthly" {
		duration = 1
	} else {
		duration = 12
	}

	// Upgrade user subscription
	if err := s.subsService.UpgradeSubscription(order.UserID, order.PlanCode, duration); err != nil {
		return fmt.Errorf("failed to upgrade subscription: %w", err)
	}

	// Gift membership reward (经费/钻石)
	s.giftMembershipReward(order.UserID, order.PlanCode)

	// Mark coupon as used if order has a coupon
	if order.CouponID != nil && *order.CouponID > 0 {
		if err := s.couponRepo.UseCoupon(*order.CouponID, uint64(order.ID)); err != nil {
			// Log error but don't fail the payment process
			fmt.Printf("⚠ Warning: Failed to mark coupon %d as used: %v\n", *order.CouponID, err)
		} else {
			fmt.Printf("✓ Coupon %d marked as used for order %s\n", *order.CouponID, orderNo)
		}
	}

	fmt.Printf("✓ WeChat Pay payment processed successfully for order %s\n", orderNo)
	return nil
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

// AdminGrantSubscriptionRequest represents the request for admin to grant subscription to a user
type AdminGrantSubscriptionRequest struct {
	UserID       uint   `json:"user_id"`                          // Set from URL parameter, not from JSON body
	PlanCode     string `json:"plan_code" binding:"required"`
	BillingCycle string `json:"billing_cycle" binding:"required"` // monthly or yearly
	Reason       string `json:"reason"`                           // Optional reason for granting
}

// AdminGrantSubscription grants a subscription to a user by admin
// This creates an order and payment record as if the user paid, but with system as payment method
func (s *Service) AdminGrantSubscription(adminID uint, req AdminGrantSubscriptionRequest) (*Order, error) {
	// Validate billing cycle
	if req.BillingCycle != "monthly" && req.BillingCycle != "yearly" {
		return nil, errors.New("invalid billing cycle")
	}

	// Get plan details
	plan, err := s.subsService.GetPlanByCode(req.PlanCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get plan: %w", err)
	}

	// Calculate original amount (for record keeping)
	var originalAmount float64
	if req.BillingCycle == "monthly" {
		originalAmount = plan.CurrentPriceMonthly
	} else {
		originalAmount = plan.CurrentPriceYearly
	}

	// Generate order number with ADMIN prefix
	orderNo := fmt.Sprintf("ADMIN%d%d", time.Now().Unix(), req.UserID)

	// Create order with full discount (amount = original, discount = original, final = 0)
	order := &Order{
		UserID:         req.UserID,
		OrderNo:        orderNo,
		PlanCode:       plan.PlanCode,
		PlanName:       plan.PlanName,
		BillingCycle:   req.BillingCycle,
		Amount:         originalAmount,    // Original price
		CouponID:       nil,               // No coupon used
		DiscountAmount: originalAmount,    // Full discount
		FinalAmount:    0,                 // User pays nothing
		Status:         "pending",         // Will be updated to paid
		PaymentMethod:  "",                // Will be set to "system"
	}

	// Create order
	if err := s.repo.CreateOrder(order); err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	// Prepare payment data with admin info and reason
	paymentData := map[string]interface{}{
		"admin_id":     adminID,
		"grant_reason": req.Reason,
		"grant_type":   "admin_grant",
		"grant_time":   time.Now().Format(time.RFC3339),
	}
	paymentDataJSON, _ := json.Marshal(paymentData)

	// Create payment transaction record
	transaction := &PaymentTransaction{
		OrderID:       order.ID,
		TransactionNo: fmt.Sprintf("SYS%d%d", time.Now().Unix(), order.ID),
		PaymentMethod: "system",
		Amount:        0, // No actual payment
		Status:        "success",
		PaymentData:   string(paymentDataJSON),
	}

	if err := s.repo.CreatePaymentTransaction(transaction); err != nil {
		return nil, fmt.Errorf("failed to create payment transaction: %w", err)
	}

	// Update order status to paid
	if err := s.repo.UpdateOrderStatus(order.ID, "paid", "system"); err != nil {
		return nil, fmt.Errorf("failed to update order status: %w", err)
	}

	// Calculate subscription duration
	var duration int
	if req.BillingCycle == "monthly" {
		duration = 1
	} else {
		duration = 12
	}

	// Upgrade user subscription
	if err := s.subsService.UpgradeSubscription(req.UserID, req.PlanCode, duration); err != nil {
		return nil, fmt.Errorf("failed to upgrade subscription: %w", err)
	}

	// Gift membership reward (经费/钻石)
	s.giftMembershipReward(req.UserID, req.PlanCode)

	// Refresh order to get updated data
	updatedOrder, err := s.repo.GetOrderByID(order.ID)
	if err != nil {
		return order, nil // Return original order if refresh fails
	}

	fmt.Printf("✓ Admin %d granted %s subscription (%s) to user %d, order: %s\n",
		adminID, req.PlanCode, req.BillingCycle, req.UserID, orderNo)

	return updatedOrder, nil
}

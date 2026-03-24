// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"fmt"
	"log"
	"math"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/order"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AlipayHandler handles HTTP requests for Alipay operations
type AlipayHandler struct {
	alipayService *AlipayService
	orderService  *order.Service
}

// NewAlipayHandler creates a new Alipay handler
func NewAlipayHandler(db *gorm.DB, orderService *order.Service) *AlipayHandler {
	return &AlipayHandler{
		alipayService: NewAlipayService(db),
		orderService:  orderService,
	}
}

// CreatePayment handles creating a payment request
// POST /api/v1/user/payment/alipay/create
func (h *AlipayHandler) CreatePayment(c *gin.Context) {
	var req PaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	// Verify order exists and belongs to user
	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 4001, "Order not found")
		return
	}

	if orderRecord.UserID != userID.(uint) {
		utils.Error(c, 4003, "Order does not belong to user")
		return
	}

	// Check order status
	if orderRecord.Status != "pending" {
		utils.Error(c, 4004, "Order is not in pending status")
		return
	}

	// Verify amount matches
	// Temporary: Comment out for testing with 0.01
	// if req.Amount != orderRecord.Amount {
	// 	utils.Error(c, 4005, "Amount does not match order")
	// 	return
	// }

	// Create payment
	response, err := h.alipayService.CreatePayment(req)
	if err != nil {
		utils.Error(c, 4002, "Failed to create payment: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// HandleCallback handles Alipay payment callback
// POST /api/v1/payment/alipay/notify
func (h *AlipayHandler) HandleCallback(c *gin.Context) {
	// ========== [ALIPAY_CALLBACK_START] ==========
	log.Printf("\n========== [ALIPAY_CALLBACK_START] Time: %s ==========\n", time.Now().Format("2006-01-02 15:04:05"))
	log.Printf("[ALIPAY_CALLBACK] Remote IP: %s\n", c.ClientIP())
	log.Printf("[ALIPAY_CALLBACK] User-Agent: %s\n", c.Request.UserAgent())

	// Parse callback parameters
	params := make(map[string]string)
	if err := c.Request.ParseForm(); err != nil {
		log.Printf("[ALIPAY_CALLBACK_ERROR] Failed to parse form: %v\n", err)
		log.Printf("========== [ALIPAY_CALLBACK_END] Result: PARSE_FAILED ==========\n\n")
		c.String(400, "fail")
		return
	}

	for k, v := range c.Request.Form {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	// Log all received parameters
	log.Printf("[ALIPAY_CALLBACK] Received %d parameters:\n", len(params))
	for k, v := range params {
		if k == "sign" {
			log.Printf("  - %s: %s...(truncated)\n", k, v[:50])
		} else {
			log.Printf("  - %s: %s\n", k, v)
		}
	}

	// Verify signature
	log.Printf("[ALIPAY_CALLBACK] Verifying signature...\n")
	valid, err := h.alipayService.VerifyCallback(params)
	if err != nil || !valid {
		log.Printf("[ALIPAY_CALLBACK_ERROR] Signature verification failed: %v\n", err)
		log.Printf("========== [ALIPAY_CALLBACK_END] Result: VERIFY_FAILED ==========\n\n")
		c.String(400, "fail")
		return
	}
	log.Printf("[ALIPAY_CALLBACK] Signature verified successfully ✓\n")

	// Extract payment information
	orderNo := params["out_trade_no"]
	tradeNo := params["trade_no"]
	tradeStatus := params["trade_status"]
	totalAmount := params["total_amount"]

	log.Printf("[ALIPAY_CALLBACK] Payment Info:\n")
	log.Printf("  - Order No: %s\n", orderNo)
	log.Printf("  - Trade No: %s\n", tradeNo)
	log.Printf("  - Trade Status: %s\n", tradeStatus)
	log.Printf("  - Total Amount: %s\n", totalAmount)

	// Check trade status
	if tradeStatus == "TRADE_SUCCESS" || tradeStatus == "TRADE_FINISHED" {
		log.Printf("[ALIPAY_CALLBACK] Processing successful payment...\n")
		// Process successful payment with complete callback data
		if err := h.processSuccessfulPayment(orderNo, tradeNo, totalAmount, params); err != nil {
			log.Printf("[ALIPAY_CALLBACK_ERROR] Failed to process payment: %v\n", err)
			log.Printf("========== [ALIPAY_CALLBACK_END] Result: PROCESS_FAILED ==========\n\n")
			c.String(500, "fail")
			return
		}
		log.Printf("[ALIPAY_CALLBACK] Payment processed successfully ✓\n")
		log.Printf("========== [ALIPAY_CALLBACK_END] Result: SUCCESS ==========\n\n")
	} else {
		log.Printf("[ALIPAY_CALLBACK] Trade status is %s, not processing\n", tradeStatus)
		log.Printf("========== [ALIPAY_CALLBACK_END] Result: STATUS_IGNORED ==========\n\n")
	}

	// Return success response to Alipay
	c.String(200, "success")
}

// processSuccessfulPayment processes a successful payment from Alipay callback
func (h *AlipayHandler) processSuccessfulPayment(orderNo, transactionNo, amountStr string, callbackData map[string]string) error {
	// Get order
	orderRecord, err := h.orderService.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Check if already processed
	if orderRecord.Status == "paid" {
		log.Printf("✓ Order %s already processed\n", orderNo)
		return nil
	}

	// Verify amount - CRITICAL SECURITY CHECK
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}

	// Compare amounts with final amount (after coupon discount) with 0.01 tolerance for floating point precision
	if math.Abs(amount-orderRecord.FinalAmount) > 0.01 {
		return fmt.Errorf("amount mismatch: expected %.2f, got %.2f", orderRecord.FinalAmount, amount)
	}

	// Process Alipay callback using the dedicated method
	// This will create a payment transaction record with complete callback data
	if err := h.orderService.ProcessAlipayCallback(orderNo, transactionNo, amount, callbackData); err != nil {
		return fmt.Errorf("failed to process payment: %w", err)
	}

	log.Printf("✓ Payment processed successfully for order %s\n", orderNo)
	return nil
}

// GetActiveConfig retrieves the active Alipay configuration (Admin only)
// GET /api/v1/admin/payment/alipay/config
func (h *AlipayHandler) GetActiveConfig(c *gin.Context) {
	config, err := h.alipayService.GetActiveConfig()
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			utils.Error(c, 4404, "No active Alipay configuration found")
			return
		}
		utils.Error(c, 5000, "Failed to get configuration: "+err.Error())
		return
	}

	// Mask sensitive information
	config.PrivateKey = "********"
	config.AlipayPublicKey = "********"

	utils.Success(c, config)
}

// ListConfigs retrieves all Alipay configurations (Admin only)
// GET /api/v1/admin/payment/alipay/configs
func (h *AlipayHandler) ListConfigs(c *gin.Context) {
	configs, err := h.alipayService.ListConfigs()
	if err != nil {
		utils.Error(c, 5000, "Failed to list configurations: "+err.Error())
		return
	}

	// Check if client requests unmasked keys (via query parameter)
	showKeys := c.Query("show_keys") == "true"

	if !showKeys {
		// Mask sensitive information
		for i := range configs {
			configs[i].PrivateKey = "********"
			configs[i].AlipayPublicKey = "********"
		}
	}
	// If show_keys=true, return the real keys (client should verify admin first)

	utils.Success(c, configs)
}

// CreateConfigRequest represents the request to create an Alipay configuration
type CreateConfigRequest struct {
	AppID           string `json:"app_id" binding:"required"`
	PrivateKey      string `json:"private_key" binding:"required"`
	AlipayPublicKey string `json:"alipay_public_key" binding:"required"`
	NotifyURL       string `json:"notify_url" binding:"required"`
	ReturnURL       string `json:"return_url"`
	IsSandbox       bool   `json:"is_sandbox"`
	IsActive        bool   `json:"is_active"`
}

// CreateConfig creates a new Alipay configuration (Admin only)
// POST /api/v1/admin/payment/alipay/config
func (h *AlipayHandler) CreateConfig(c *gin.Context) {
	var req CreateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Determine gateway URL based on sandbox flag
	gatewayURL := "https://openapi.alipay.com/gateway.do"
	if req.IsSandbox {
		gatewayURL = "https://openapi.alipaydev.com/gateway.do"
	}

	config := &model.AlipayConfig{
		AppID:           req.AppID,
		PrivateKey:      req.PrivateKey,
		AlipayPublicKey: req.AlipayPublicKey,
		GatewayURL:      gatewayURL,
		NotifyURL:       req.NotifyURL,
		ReturnURL:       req.ReturnURL,
		IsSandbox:       req.IsSandbox,
		IsActive:        req.IsActive,
	}

	if err := h.alipayService.CreateConfig(config); err != nil {
		utils.Error(c, 5001, "Failed to create configuration: "+err.Error())
		return
	}

	// Mask sensitive information before returning
	config.PrivateKey = "********"
	config.AlipayPublicKey = "********"

	utils.Success(c, config)
}

// UpdateConfigRequest represents the request to update an Alipay configuration
type UpdateConfigRequest struct {
	AppID           string `json:"app_id"`
	PrivateKey      string `json:"private_key"`
	AlipayPublicKey string `json:"alipay_public_key"`
	NotifyURL       string `json:"notify_url"`
	ReturnURL       string `json:"return_url"`
	IsSandbox       *bool  `json:"is_sandbox"`
	IsActive        *bool  `json:"is_active"`
}

// UpdateConfig updates an Alipay configuration (Admin only)
// PUT /api/v1/admin/payment/alipay/config/:id
func (h *AlipayHandler) UpdateConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	var req UpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get existing config
	config, err := h.alipayService.GetActiveConfig()
	if err != nil {
		utils.Error(c, 4404, "Configuration not found")
		return
	}

	// Update fields
	if req.AppID != "" {
		config.AppID = req.AppID
	}
	if req.PrivateKey != "" {
		config.PrivateKey = req.PrivateKey
	}
	if req.AlipayPublicKey != "" {
		config.AlipayPublicKey = req.AlipayPublicKey
	}
	if req.NotifyURL != "" {
		config.NotifyURL = req.NotifyURL
	}
	if req.ReturnURL != "" {
		config.ReturnURL = req.ReturnURL
	}
	if req.IsSandbox != nil {
		config.IsSandbox = *req.IsSandbox
		// Update gateway URL based on sandbox flag
		if config.IsSandbox {
			config.GatewayURL = "https://openapi.alipaydev.com/gateway.do"
		} else {
			config.GatewayURL = "https://openapi.alipay.com/gateway.do"
		}
	}
	if req.IsActive != nil {
		config.IsActive = *req.IsActive
	}

	config.ID = uint(id)

	if err := h.alipayService.UpdateConfig(config); err != nil {
		utils.Error(c, 5002, "Failed to update configuration: "+err.Error())
		return
	}

	// Mask sensitive information before returning
	config.PrivateKey = "********"
	config.AlipayPublicKey = "********"

	utils.Success(c, config)
}

// DeleteConfig deletes an Alipay configuration (Admin only)
// DELETE /api/v1/admin/payment/alipay/config/:id
func (h *AlipayHandler) DeleteConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	if err := h.alipayService.DeleteConfig(uint(id)); err != nil {
		utils.Error(c, 5003, "Failed to delete configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration deleted successfully"})
}

// SetActiveConfig sets a specific configuration as active (Admin only)
// POST /api/v1/admin/payment/alipay/config/:id/activate
func (h *AlipayHandler) SetActiveConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	if err := h.alipayService.SetActiveConfig(uint(id)); err != nil {
		utils.Error(c, 5004, "Failed to set active configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration activated successfully"})
}

// SimulatePayment simulates a successful payment for development/testing
// POST /api/v1/user/payment/simulate
func (h *AlipayHandler) SimulatePayment(c *gin.Context) {
	var req struct {
		OrderNo string  `json:"order_no" binding:"required"`
		Amount  float64 `json:"amount" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userIDInterface.(uint)

	// Verify order exists and belongs to user
	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 4001, "Order not found")
		return
	}

	if orderRecord.UserID != userID {
		utils.Error(c, 4003, "Order does not belong to user")
		return
	}

	// Check order status
	if orderRecord.Status != "pending" {
		utils.Error(c, 4004, "Order is not in pending status")
		return
	}

	// Verify amount matches final amount (with coupon discount) (with 0.01 tolerance)
	if math.Abs(req.Amount-orderRecord.FinalAmount) > 0.01 {
		utils.Error(c, 4005, fmt.Sprintf("Amount mismatch: expected %.2f, got %.2f", orderRecord.FinalAmount, req.Amount))
		return
	}

	// Generate a mock transaction number
	mockTransactionNo := fmt.Sprintf("MOCK_%s_%d", req.OrderNo, time.Now().Unix())

	// Create mock callback data
	mockCallbackData := map[string]string{
		"out_trade_no": req.OrderNo,
		"trade_no":     mockTransactionNo,
		"trade_status": "TRADE_SUCCESS",
		"total_amount": fmt.Sprintf("%.2f", req.Amount),
		"notify_time":  time.Now().Format("2006-01-02 15:04:05"),
		"notify_type":  "trade_status_sync",
		"app_id":       "MOCK_DEV_APP",
		"seller_id":    "MOCK_SELLER",
		"buyer_id":     "MOCK_BUYER",
		"receipt_amount": fmt.Sprintf("%.2f", req.Amount),
	}

	// Process the simulated payment
	log.Printf("\n========== [SIMULATE_PAYMENT_START] Time: %s ==========\n", time.Now().Format("2006-01-02 15:04:05"))
	log.Printf("[SIMULATE_PAYMENT] Order No: %s\n", req.OrderNo)
	log.Printf("[SIMULATE_PAYMENT] Amount: %.2f\n", req.Amount)
	log.Printf("[SIMULATE_PAYMENT] Mock Transaction No: %s\n", mockTransactionNo)

	if err := h.orderService.ProcessAlipayCallback(req.OrderNo, mockTransactionNo, req.Amount, mockCallbackData); err != nil {
		log.Printf("[SIMULATE_PAYMENT_ERROR] Failed to process: %v\n", err)
		log.Printf("========== [SIMULATE_PAYMENT_END] Result: FAILED ==========\n\n")
		utils.Error(c, 5000, "Failed to simulate payment: "+err.Error())
		return
	}

	log.Printf("[SIMULATE_PAYMENT] Payment processed successfully ✓\n")
	log.Printf("========== [SIMULATE_PAYMENT_END] Result: SUCCESS ==========\n\n")

	utils.Success(c, gin.H{
		"message":        "Payment simulated successfully",
		"order_no":       req.OrderNo,
		"transaction_no": mockTransactionNo,
		"status":         "paid",
	})
}

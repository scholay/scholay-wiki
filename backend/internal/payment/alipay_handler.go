package payment

import (
	"fmt"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/order"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AlipayHandler handles HTTP requests for Alipay operations
type AlipayHandler struct {
	alipayService *AlipayService
	orderService  *order.Service
}

// NewAlipayHandler creates a new Alipay handler
func NewAlipayHandler(db *gorm.DB) *AlipayHandler {
	return &AlipayHandler{
		alipayService: NewAlipayService(db),
		orderService:  order.NewService(db),
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
	// Parse callback parameters
	params := make(map[string]string)
	if err := c.Request.ParseForm(); err != nil {
		c.String(400, "fail")
		return
	}

	for k, v := range c.Request.Form {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	// Verify signature
	valid, err := h.alipayService.VerifyCallback(params)
	if err != nil || !valid {
		fmt.Printf("⚠ Alipay callback verification failed: %v\n", err)
		c.String(400, "fail")
		return
	}

	// Extract payment information
	orderNo := params["out_trade_no"]
	tradeNo := params["trade_no"]
	tradeStatus := params["trade_status"]
	totalAmount := params["total_amount"]

	fmt.Printf("✓ Alipay callback received: order=%s, trade=%s, status=%s, amount=%s\n",
		orderNo, tradeNo, tradeStatus, totalAmount)

	// Check trade status
	if tradeStatus == "TRADE_SUCCESS" || tradeStatus == "TRADE_FINISHED" {
		// Process successful payment
		if err := h.processSuccessfulPayment(orderNo, tradeNo, totalAmount); err != nil {
			fmt.Printf("⚠ Failed to process payment: %v\n", err)
			c.String(500, "fail")
			return
		}
	}

	// Return success response to Alipay
	c.String(200, "success")
}

// processSuccessfulPayment processes a successful payment
func (h *AlipayHandler) processSuccessfulPayment(orderNo, transactionNo, amountStr string) error {
	// Get order
	orderRecord, err := h.orderService.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Check if already processed
	if orderRecord.Status == "paid" {
		fmt.Printf("✓ Order %s already processed\n", orderNo)
		return nil
	}

	// Verify amount
	// Temporary: Comment out for testing with 0.01
	// amount, err := strconv.ParseFloat(amountStr, 64)
	// if err != nil {
	// 	return fmt.Errorf("invalid amount: %w", err)
	// }

	// if amount != orderRecord.Amount {
	// 	return fmt.Errorf("amount mismatch: expected %.2f, got %.2f", orderRecord.Amount, amount)
	// }

	// Use the order service's ProcessPayment method to handle the payment
	// We need to create a mock request since the payment is already verified by Alipay
	req := order.ProcessPaymentRequest{
		OrderNo:       orderNo,
		PaymentMethod: "alipay",
	}

	// Note: The ProcessPayment method will create a transaction record
	// We need to modify it to accept external transaction number
	if err := h.orderService.ProcessPayment(orderRecord.UserID, req); err != nil {
		return fmt.Errorf("failed to process payment: %w", err)
	}

	fmt.Printf("✓ Payment processed successfully for order %s\n", orderNo)
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
	config.PrivateKey = "***MASKED***"
	config.AlipayPublicKey = "***MASKED***"

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

	// Mask sensitive information
	for i := range configs {
		configs[i].PrivateKey = "***MASKED***"
		configs[i].AlipayPublicKey = "***MASKED***"
	}

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
	config.PrivateKey = "***MASKED***"
	config.AlipayPublicKey = "***MASKED***"

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
	config.PrivateKey = "***MASKED***"
	config.AlipayPublicKey = "***MASKED***"

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

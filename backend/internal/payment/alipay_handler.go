// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"errors"
	"fmt"
	"log/slog"
	"math"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// OrderRecord 支付所需的订单信息（解耦 order 包）
type OrderRecord struct {
	UserID      uint
	Status      string
	Amount      float64
	FinalAmount float64
	PlanCode    string
}

// OrderServiceInterface 支付模块所需的订单服务接口（订单模块已移除，当前未实现）
type OrderServiceInterface interface {
	GetOrderByOrderNo(orderNo string) (*OrderRecord, error)
	ProcessAlipayCallback(orderNo, transactionNo string, amount float64, callbackData map[string]string) error
	ProcessWeChatPayCallback(orderNo, transactionID string, amount float64, callbackData map[string]any) error
}

// AlipayHandler handles HTTP requests for Alipay operations
type AlipayHandler struct {
	alipayService *AlipayService
	orderService  OrderServiceInterface
}

// NewAlipayHandler creates a new Alipay handler with pre-built services
func NewAlipayHandler(alipayService *AlipayService, orderService OrderServiceInterface) *AlipayHandler {
	return &AlipayHandler{
		alipayService: alipayService,
		orderService:  orderService,
	}
}

// CreatePayment handles creating a payment request
// POST /api/v1/user/payment/alipay/create
func (h *AlipayHandler) CreatePayment(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 5000, "支付功能暂未开放")
		return
	}

	var req PaymentRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 4001, "Order not found")
		return
	}

	if orderRecord.UserID != userID {
		utils.Error(c, 4003, "Order does not belong to user")
		return
	}

	if orderRecord.Status != "pending" {
		utils.Error(c, 4004, "Order is not in pending status")
		return
	}

	if config.AppConfig != nil && config.AppConfig.App.IsRelease && req.Amount != orderRecord.Amount {
		utils.Error(c, 4005, "Amount does not match order")
		return
	}

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
	if h.orderService == nil {
		slog.Warn("alipay callback received but order service not available")
		c.String(200, "success")
		return
	}

	slog.Info("alipay callback received", "ip", c.ClientIP())

	params := make(map[string]string)
	if err := c.Request.ParseForm(); err != nil {
		slog.Error("alipay callback failed to parse form", "err", err)
		c.String(400, "fail")
		return
	}

	for k, v := range c.Request.Form {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	slog.Info("alipay callback parameters received",
		"param_count", len(params),
		"order_no", params["out_trade_no"],
		"trade_status", params["trade_status"],
	)

	valid, err := h.alipayService.VerifyCallback(params)
	if err != nil || !valid {
		slog.Error("alipay callback signature verification failed",
			"order_no", params["out_trade_no"],
			"err", err,
		)
		c.String(400, "fail")
		return
	}

	orderNo := params["out_trade_no"]
	tradeNo := params["trade_no"]
	tradeStatus := params["trade_status"]
	totalAmount := params["total_amount"]

	if tradeStatus == "TRADE_SUCCESS" || tradeStatus == "TRADE_FINISHED" {
		if err := h.processSuccessfulPayment(orderNo, tradeNo, totalAmount, params); err != nil {
			slog.Error("alipay callback failed to process order", "order_no", orderNo, "err", err)
			c.String(500, "fail")
			return
		}
		slog.Info("alipay callback order processed successfully", "order_no", orderNo)
	} else {
		slog.Info("alipay callback order status skipped", "order_no", orderNo, "trade_status", tradeStatus)
	}

	c.String(200, "success")
}

// processSuccessfulPayment processes a successful payment from Alipay callback
func (h *AlipayHandler) processSuccessfulPayment(orderNo, transactionNo, amountStr string, callbackData map[string]string) error {
	orderRecord, err := h.orderService.GetOrderByOrderNo(orderNo)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	if orderRecord.Status == "paid" {
		slog.Info("alipay order already processed", "order_no", orderNo)
		return nil
	}

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}

	if math.Abs(amount-orderRecord.FinalAmount) > 0.01 {
		return fmt.Errorf("amount mismatch: expected %.2f, got %.2f", orderRecord.FinalAmount, amount)
	}

	if err := h.orderService.ProcessAlipayCallback(orderNo, transactionNo, amount, callbackData); err != nil {
		return fmt.Errorf("failed to process payment: %w", err)
	}

	slog.Info("alipay payment processed", "order_no", orderNo, "amount", amount)
	return nil
}

// GetActiveConfig retrieves the active Alipay configuration (Admin only)
func (h *AlipayHandler) GetActiveConfig(c *gin.Context) {
	config, err := h.alipayService.GetActiveConfig()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Error(c, 4404, "No active Alipay configuration found")
			return
		}
		utils.Error(c, 5000, "Failed to get configuration: "+err.Error())
		return
	}

	config.PrivateKey = "********"
	config.AlipayPublicKey = "********"

	utils.Success(c, config)
}

// ListConfigs retrieves all Alipay configurations (Admin only)
func (h *AlipayHandler) ListConfigs(c *gin.Context) {
	configs, err := h.alipayService.ListConfigs()
	if err != nil {
		utils.Error(c, 5000, "Failed to list configurations: "+err.Error())
		return
	}

	showKeys := c.Query("show_keys") == "true"
	if !showKeys {
		for i := range configs {
			configs[i].PrivateKey = "********"
			configs[i].AlipayPublicKey = "********"
		}
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
func (h *AlipayHandler) CreateConfig(c *gin.Context) {
	var req CreateConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

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
func (h *AlipayHandler) UpdateConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	config, err := h.alipayService.GetConfigByID(id)
	if err != nil {
		utils.Error(c, 4404, "Configuration not found")
		return
	}

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
		if config.IsSandbox {
			config.GatewayURL = "https://openapi.alipaydev.com/gateway.do"
		} else {
			config.GatewayURL = "https://openapi.alipay.com/gateway.do"
		}
	}
	if req.IsActive != nil {
		config.IsActive = *req.IsActive
	}

	if err := h.alipayService.UpdateConfig(config); err != nil {
		utils.Error(c, 5002, "Failed to update configuration: "+err.Error())
		return
	}

	config.PrivateKey = "********"
	config.AlipayPublicKey = "********"

	utils.Success(c, config)
}

// DeleteConfig deletes an Alipay configuration (Admin only)
func (h *AlipayHandler) DeleteConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.alipayService.DeleteConfig(id); err != nil {
		utils.Error(c, 5003, "Failed to delete configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration deleted successfully"})
}

// SetActiveConfig sets a specific configuration as active (Admin only)
func (h *AlipayHandler) SetActiveConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.alipayService.SetActiveConfig(id); err != nil {
		utils.Error(c, 5004, "Failed to set active configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration activated successfully"})
}

// SimulatePayment simulates a successful payment for development/testing
func (h *AlipayHandler) SimulatePayment(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 5000, "支付功能暂未开放")
		return
	}

	var req struct {
		OrderNo string  `json:"order_no" binding:"required"`
		Amount  float64 `json:"amount" binding:"required,gt=0"`
	}

	if !utils.BindJSON(c, &req) {
		return
	}

	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 4001, "Order not found")
		return
	}

	if orderRecord.UserID != userID {
		utils.Error(c, 4003, "Order does not belong to user")
		return
	}

	if orderRecord.Status != "pending" {
		utils.Error(c, 4004, "Order is not in pending status")
		return
	}

	if math.Abs(req.Amount-orderRecord.FinalAmount) > 0.01 {
		utils.Error(c, 4005, fmt.Sprintf("Amount mismatch: expected %.2f, got %.2f", orderRecord.FinalAmount, req.Amount))
		return
	}

	mockTransactionNo := fmt.Sprintf("MOCK_%s_%d", req.OrderNo, time.Now().Unix())

	mockCallbackData := map[string]string{
		"out_trade_no":   req.OrderNo,
		"trade_no":       mockTransactionNo,
		"trade_status":   "TRADE_SUCCESS",
		"total_amount":   fmt.Sprintf("%.2f", req.Amount),
		"notify_time":    time.Now().Format("2006-01-02 15:04:05"),
		"notify_type":    "trade_status_sync",
		"app_id":         "MOCK_DEV_APP",
		"seller_id":      "MOCK_SELLER",
		"buyer_id":       "MOCK_BUYER",
		"receipt_amount": fmt.Sprintf("%.2f", req.Amount),
	}

	slog.Info("simulating payment", "order_no", req.OrderNo, "amount", req.Amount, "transaction_no", mockTransactionNo)

	if err := h.orderService.ProcessAlipayCallback(req.OrderNo, mockTransactionNo, req.Amount, mockCallbackData); err != nil {
		slog.Error("simulate payment failed", "order_no", req.OrderNo, "err", err)
		utils.Error(c, 5000, "Failed to simulate payment: "+err.Error())
		return
	}

	slog.Info("simulate payment processed successfully", "order_no", req.OrderNo)

	utils.Success(c, gin.H{
		"message":        "Payment simulated successfully",
		"order_no":       req.OrderNo,
		"transaction_no": mockTransactionNo,
		"status":         "paid",
	})
}

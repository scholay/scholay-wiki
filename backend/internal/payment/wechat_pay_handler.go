// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// WeChatPayHandler 微信支付处理器
type WeChatPayHandler struct {
	service      *WeChatPayService
	orderService OrderServiceInterface
}

// NewWeChatPayHandler 创建微信支付处理器
func NewWeChatPayHandler(service *WeChatPayService, orderService OrderServiceInterface) *WeChatPayHandler {
	return &WeChatPayHandler{
		service:      service,
		orderService: orderService,
	}
}

// GetAllConfigs 获取所有微信支付配置
func (h *WeChatPayHandler) GetAllConfigs(c *gin.Context) {
	showKeys := c.Query("show_keys") == "true"

	configs, err := h.service.GetAllConfigs(showKeys)
	if err != nil {
		utils.Error(c, 3001, "Failed to get WeChat Pay configs: "+err.Error())
		return
	}

	utils.Success(c, configs)
}

// GetActiveConfig 获取激活的微信支付配置
func (h *WeChatPayHandler) GetActiveConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		utils.Error(c, 3002, "Failed to get active WeChat Pay config: "+err.Error())
		return
	}

	showKeys := c.Query("show_keys") == "true"
	utils.Success(c, config.ToDTO(showKeys))
}

// CreateConfig 创建微信支付配置
func (h *WeChatPayHandler) CreateConfig(c *gin.Context) {
	var dto WeChatPayConfigDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.CreateConfig(&dto); err != nil {
		utils.Error(c, 3003, "Failed to create WeChat Pay config: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config created successfully"})
}

// UpdateConfig 更新微信支付配置
func (h *WeChatPayHandler) UpdateConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "Invalid config ID")
		return
	}

	var dto WeChatPayConfigDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.UpdateConfig(id, &dto); err != nil {
		utils.Error(c, 3004, "Failed to update WeChat Pay config: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config updated successfully"})
}

// DeleteConfig 删除微信支付配置
func (h *WeChatPayHandler) DeleteConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "Invalid config ID")
		return
	}

	if err := h.service.DeleteConfig(id); err != nil {
		utils.Error(c, 3005, "Failed to delete WeChat Pay config: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config deleted successfully"})
}

// ActivateConfig 激活微信支付配置
func (h *WeChatPayHandler) ActivateConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "Invalid config ID")
		return
	}

	if err := h.service.ActivateConfig(id); err != nil {
		utils.Error(c, 3006, "Failed to activate WeChat Pay config: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config activated successfully"})
}

// WeChatPaymentRequest 微信支付请求结构体
type WeChatPaymentRequest struct {
	OrderNo string  `json:"order_no" binding:"required"`
	Amount  float64 `json:"amount" binding:"required,gt=0"`
}

// CreatePayment 创建微信支付订单
func (h *WeChatPayHandler) CreatePayment(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 5000, "支付功能暂未开放")
		return
	}

	var req WeChatPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		slog.Error("wechat pay request binding error", "err", err)
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	slog.Info("creating wechat payment", "order_no", req.OrderNo, "amount", req.Amount)

	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 5001, "Order not found")
		return
	}

	if orderRecord.UserID != userID.(uint) {
		utils.Error(c, 5003, "Order does not belong to user")
		return
	}

	if orderRecord.Status != "pending" {
		utils.Error(c, 5004, "Order is not in pending status")
		return
	}

	description := fmt.Sprintf("订阅套餐-%s", orderRecord.PlanCode)
	codeURL, err := h.service.CreateNativeOrder(req.OrderNo, req.Amount, description)
	if err != nil {
		utils.Error(c, 5002, "Failed to create WeChat payment: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"code_url":  codeURL,
		"order_no":  req.OrderNo,
		"amount":    req.Amount,
		"timestamp": time.Now().Unix(),
	})
}

// HandleNotify 处理微信支付回调
func (h *WeChatPayHandler) HandleNotify(c *gin.Context) {
	if h.orderService == nil {
		slog.Warn("wechat pay callback received but order service not available")
		c.JSON(200, gin.H{"code": "SUCCESS", "message": ""})
		return
	}

	var req WeChatPayNotifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid notify request: "+err.Error())
		return
	}

	decrypted, err := h.service.VerifyNotify(&req)
	if err != nil {
		utils.Error(c, 3007, "Failed to verify notify: "+err.Error())
		return
	}

	if decrypted.TradeState != "SUCCESS" {
		utils.Error(c, 3008, "Payment not successful: "+decrypted.TradeStateDesc)
		return
	}

	slog.Info("wechat pay callback received",
		"order_no", decrypted.OutTradeNo,
		"transaction_id", decrypted.TransactionID,
		"amount_fen", decrypted.Amount.Total,
		"trade_state", decrypted.TradeState,
	)

	amountInYuan := float64(decrypted.Amount.Total) / 100.0

	callbackData := map[string]any{
		"mchid":            decrypted.MchID,
		"appid":            decrypted.AppID,
		"out_trade_no":     decrypted.OutTradeNo,
		"transaction_id":   decrypted.TransactionID,
		"trade_type":       decrypted.TradeType,
		"trade_state":      decrypted.TradeState,
		"trade_state_desc": decrypted.TradeStateDesc,
		"bank_type":        decrypted.BankType,
		"success_time":     decrypted.SuccessTime,
		"payer_openid":     decrypted.Payer.OpenID,
		"amount_total":     decrypted.Amount.Total,
		"amount_currency":  decrypted.Amount.Currency,
	}

	err = h.orderService.ProcessWeChatPayCallback(
		decrypted.OutTradeNo,
		decrypted.TransactionID,
		amountInYuan,
		callbackData,
	)
	if err != nil {
		slog.Error("wechat pay failed to process payment", "err", err)
		utils.Error(c, 3009, "Failed to process payment: "+err.Error())
		return
	}

	slog.Info("wechat pay payment processed successfully")

	c.JSON(200, gin.H{
		"code":    "SUCCESS",
		"message": "",
	})
}

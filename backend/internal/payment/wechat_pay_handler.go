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
	showKeys := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"

	configs, err := h.service.GetAllConfigs(showKeys)
	if err != nil {
		utils.InternalError(c, 3001, "加载微信支付配置失败", err)
		return
	}

	utils.Success(c, configs)
}

// GetActiveConfig 获取激活的微信支付配置
func (h *WeChatPayHandler) GetActiveConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		utils.InternalError(c, 3002, "加载激活微信支付配置失败", err)
		return
	}

	showKeys := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"
	utils.Success(c, config.ToDTO(showKeys))
}

// CreateConfig 创建微信支付配置
func (h *WeChatPayHandler) CreateConfig(c *gin.Context) {
	var dto WeChatPayConfigDTO
	if !utils.BindJSON(c, &dto) {
		return
	}

	if err := h.service.CreateConfig(&dto); err != nil {
		utils.InternalError(c, 3003, "创建微信支付配置失败", err)
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config created successfully"})
}

// UpdateConfig 更新微信支付配置
func (h *WeChatPayHandler) UpdateConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var dto WeChatPayConfigDTO
	if !utils.BindJSON(c, &dto) {
		return
	}

	if err := h.service.UpdateConfig(uint64(id), &dto); err != nil {
		utils.InternalError(c, 3004, "更新微信支付配置失败", err)
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config updated successfully"})
}

// DeleteConfig 删除微信支付配置
func (h *WeChatPayHandler) DeleteConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteConfig(uint64(id)); err != nil {
		utils.InternalError(c, 3005, "删除微信支付配置失败", err)
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config deleted successfully"})
}

// ActivateConfig 激活微信支付配置
func (h *WeChatPayHandler) ActivateConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.ActivateConfig(uint64(id)); err != nil {
		utils.InternalError(c, 3006, "Failed to activate WeChat Pay config", err)
		return
	}

	utils.Success(c, gin.H{"message": "WeChat Pay config activated successfully"})
}

// WeChatPaymentRequest 微信支付请求结构体。
//
// 🔴 2026-08-02 计费审计 P1-4:**刻意没有 Amount 字段**。此前它是客户端必填,CreatePayment
// 原样把 req.Amount 送去微信下单,orderRecord.FinalAmount 全程一次都没读 —— 任意登录用户
// 都能对自己的 ¥269 订单发起一笔 ¥0.01 的微信支付。获利方向被 fulfill 的金额复核堵着
// (少付换不到服务),但钱会真的进商户号、订单永远 pending、系统内又没有退款链路,
// 微信还会按 15m/15m/30m… 重推 24 小时全部失败。「本单应付多少钱」只能有服务端一个真源。
type WeChatPaymentRequest struct {
	OrderNo string `json:"order_no" binding:"required"`
}

// CreatePayment 创建微信支付订单
func (h *WeChatPayHandler) CreatePayment(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 5000, "支付功能暂未开放")
		return
	}

	var req WeChatPaymentRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		utils.Error(c, 5001, "订单不存在,请刷新后重试")
		return
	}

	if orderRecord.UserID != userID {
		utils.Error(c, 5003, "无权访问该订单")
		return
	}

	if orderRecord.Status != "pending" {
		utils.Error(c, 5004, "订单状态异常,无法支付(可能已支付或已取消)")
		return
	}

	// 金额只认订单行的 final_amount(P1-4)。
	amount := orderRecord.FinalAmount
	slog.Info("creating wechat payment", "order_no", req.OrderNo, "amount", amount)

	description := fmt.Sprintf("订阅套餐-%s", orderRecord.PlanCode)
	codeURL, err := h.service.CreateNativeOrder(c.Request.Context(), req.OrderNo, amount, description)
	if err != nil {
		slog.Error("failed to create wechat payment", "order_no", req.OrderNo, "err", err)
		utils.Error(c, 5002, "创建支付失败，请稍后重试")
		return
	}

	utils.Success(c, gin.H{
		"code_url":  codeURL,
		"order_no":  req.OrderNo,
		"amount":    amount,
		"timestamp": time.Now().Unix(),
	})
}

// HandleNotify 处理微信支付回调
func (h *WeChatPayHandler) HandleNotify(c *gin.Context) {
	if h.orderService == nil {
		// 不能回 SUCCESS，否则微信不会重试，订单永远不会入账
		slog.Error("wechat pay callback received but order service not available — asking wechat to retry")
		c.JSON(500, gin.H{"code": "FAIL", "message": "order service not available"})
		return
	}

	var req WeChatPayNotifyRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	decrypted, err := h.service.VerifyNotify(&req)
	if err != nil {
		utils.InternalError(c, 3007, "Failed to verify notify", err)
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
		utils.InternalError(c, 3009, "Failed to process payment", err)
		return
	}

	slog.Info("wechat pay payment processed successfully")

	c.JSON(200, gin.H{
		"code":    "SUCCESS",
		"message": "",
	})
}

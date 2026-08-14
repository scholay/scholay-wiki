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
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strconv"

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
		utils.Error(c, 4001, "订单不存在,请刷新后重试")
		return
	}

	if orderRecord.UserID != userID {
		utils.Error(c, 4003, "无权访问该订单")
		return
	}

	if orderRecord.Status != "pending" {
		utils.Error(c, 4004, "订单状态异常,无法支付(可能已支付或已取消)")
		return
	}

	// 🔴 2026-08-02 计费审计 P1-4:金额不再「校验客户端报的值」,而是**直接覆盖成订单行的真源**。
	// 旧写法有两处问题:① 被 IsRelease 包着 —— 只要生产误用 debug 模式(仓库自带的 dev .env
	// 就是 GIN_MODE=debug,整份拷到生产即可复现)这道闸就消失;② 比对的是 Amount 而非履约侧
	// 真正校验的 FinalAmount,今天两者恒等所以没暴雷,但只要将来引入优惠券/差价就会分叉。
	// 覆盖比校验更强:客户端根本没有能力影响下单金额,少一条需要维护的一致性规则。
	if req.Amount != orderRecord.FinalAmount {
		slog.Warn("alipay create: 客户端上报金额与订单不符,已按订单真源覆盖",
			"order_no", req.OrderNo, "client_amount", req.Amount, "order_final_amount", orderRecord.FinalAmount)
	}
	req.Amount = orderRecord.FinalAmount

	response, err := h.alipayService.CreatePayment(req)
	if err != nil {
		slog.Error("failed to create alipay payment", "order_no", req.OrderNo, "err", err)
		utils.Error(c, 4002, "创建支付失败，请稍后重试")
		return
	}

	utils.Success(c, response)
}

// HandleCallback handles Alipay payment callback
// POST /api/v1/payment/alipay/notify
func (h *AlipayHandler) HandleCallback(c *gin.Context) {
	if h.orderService == nil {
		// 不能回 success，否则支付宝不会重试，订单永远不会入账
		slog.Error("alipay callback received but order service not available — asking alipay to retry")
		c.String(500, "fail")
		return
	}

	slog.Info("alipay callback received", "ip", c.ClientIP())

	params := make(map[string]string)
	if err := c.Request.ParseForm(); err != nil {
		slog.Error("alipay callback failed to parse form", "err", err)
		c.String(400, "fail")
		return
	}

	// 用 PostForm(请求体)而非 Form(体 + URL query):支付宝异步通知只对请求体参数签名,
	// 若 notify_url 带 query string,Form 会把它混进待验签内容导致验签必然失败。
	for k, v := range c.Request.PostForm {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	valid, err := h.alipayService.VerifyCallback(params)
	if err != nil || !valid {
		slog.Error("alipay callback signature verification failed",
			"param_count", len(params),
			"err", err,
		)
		c.String(400, "fail")
		return
	}

	// 防御性校验:app_id 必须属于本商户(签名已是主要防线, 这里再加一道, 防错配/跨 app 误回调)。
	if cfg, _ := h.alipayService.GetActiveConfig(); cfg != nil && cfg.AppID != "" && params["app_id"] != cfg.AppID {
		slog.Error("alipay callback app_id mismatch", "got", params["app_id"], "want", cfg.AppID, "order_no", params["out_trade_no"])
		c.String(400, "fail")
		return
	}

	slog.Info("alipay callback verified",
		"param_count", len(params),
		"order_no", params["out_trade_no"],
		"trade_status", params["trade_status"],
	)

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
			utils.Error(c, 4404, "支付宝支付暂未开通")
			return
		}
		utils.InternalError(c, 5000, "加载配置失败", err)
		return
	}

	// 默认遮罩,?show_sensitive=true 解蔽(?show_keys=true 老查询参数保持兼容)。
	show := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"
	utils.MaskSecret(&config.PrivateKey, show)
	utils.MaskSecret(&config.AlipayPublicKey, show)

	utils.Success(c, config)
}

// ListConfigs retrieves all Alipay configurations (Admin only)
func (h *AlipayHandler) ListConfigs(c *gin.Context) {
	configs, err := h.alipayService.ListConfigs()
	if err != nil {
		utils.InternalError(c, 5000, "加载配置列表失败", err)
		return
	}

	show := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"
	if !show {
		for i := range configs {
			utils.MaskSecret(&configs[i].PrivateKey, false)
			utils.MaskSecret(&configs[i].AlipayPublicKey, false)
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
		utils.InternalError(c, 5001, "创建配置失败", err)
		return
	}

	utils.MaskSecret(&config.PrivateKey, false)
	utils.MaskSecret(&config.AlipayPublicKey, false)

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
		utils.Error(c, 4404, "配置不存在")
		return
	}

	if req.AppID != "" {
		config.AppID = req.AppID
	}
	// 密钥按"留空 / 仍是遮罩(********)→ 保留旧值"处理 —— 老逻辑只判 "" 会让
	// 前端把 GET 拿到的遮罩字符串 PUT 回来时把真密钥覆盖成 "********"。
	if req.PrivateKey != "" && req.PrivateKey != utils.MaskedSecretValue {
		config.PrivateKey = req.PrivateKey
	}
	if req.AlipayPublicKey != "" && req.AlipayPublicKey != utils.MaskedSecretValue {
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
		utils.InternalError(c, 5002, "更新配置失败", err)
		return
	}

	utils.MaskSecret(&config.PrivateKey, false)
	utils.MaskSecret(&config.AlipayPublicKey, false)

	utils.Success(c, config)
}

// DeleteConfig deletes an Alipay configuration (Admin only)
func (h *AlipayHandler) DeleteConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.alipayService.DeleteConfig(id); err != nil {
		utils.InternalError(c, 5003, "删除配置失败", err)
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
		utils.InternalError(c, 5004, "设置激活配置失败", err)
		return
	}

	utils.Success(c, gin.H{"message": "Configuration activated successfully"})
}


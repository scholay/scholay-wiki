package currency

import (
	"context"
	"strconv"

	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/utils"
)

// AdminHandler 管理员处理器
type AdminHandler struct {
	service *Service
}

// NewAdminHandler 创建管理员处理器
func NewAdminHandler(service *Service) *AdminHandler {
	return &AdminHandler{service: service}
}

// AdminRecharge 管理员充值（给用户充值）
// POST /api/v1/admin/currency/recharge
func (h *AdminHandler) AdminRecharge(c *gin.Context) {
	var req struct {
		UserID       uint         `json:"user_id" binding:"required"`
		CurrencyType CurrencyType `json:"currency_type" binding:"required,oneof=gold diamond"`
		Amount       int64        `json:"amount" binding:"required,gt=0"`
		Description  string       `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	ctx := context.Background()
	transaction, err := h.service.Recharge(ctx, req.UserID, &RechargeRequest{
		CurrencyType: req.CurrencyType,
		Amount:       req.Amount,
		BizType:      "admin_recharge",
		Description:  req.Description,
	})

	if err != nil {
		utils.Error(c, 5001, "充值失败: "+err.Error())
		return
	}

	utils.Success(c, transaction)
}

// AdminDeduct 管理员扣费
// POST /api/v1/admin/currency/deduct
func (h *AdminHandler) AdminDeduct(c *gin.Context) {
	var req struct {
		UserID       uint         `json:"user_id" binding:"required"`
		CurrencyType CurrencyType `json:"currency_type" binding:"required,oneof=gold diamond"`
		Amount       int64        `json:"amount" binding:"required,gt=0"`
		Description  string       `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	ctx := context.Background()
	transaction, err := h.service.Deduct(ctx, req.UserID, &DeductRequest{
		CurrencyType: req.CurrencyType,
		Amount:       req.Amount,
		BizType:      "admin_deduct",
		Description:  req.Description,
	})

	if err != nil {
		if err == ErrInsufficientBalance {
			utils.Error(c, 4020, "用户余额不足")
		} else {
			utils.Error(c, 5001, "扣费失败: "+err.Error())
		}
		return
	}

	utils.Success(c, transaction)
}

// GetUserWallet 获取用户钱包（管理员）
// GET /api/v1/admin/currency/wallet/:user_id
func (h *AdminHandler) GetUserWallet(c *gin.Context) {
	userIDStr := c.Param("user_id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		utils.Error(c, 4000, "无效的用户ID")
		return
	}

	wallet, err := h.service.GetWallet(uint(userID))
	if err != nil {
		utils.Error(c, 5001, "获取钱包失败: "+err.Error())
		return
	}

	utils.Success(c, wallet)
}

// ListDeductConfigs 获取扣费配置列表
// GET /api/v1/admin/currency/deduct-configs
func (h *AdminHandler) ListDeductConfigs(c *gin.Context) {
	configs, err := h.service.ListDeductConfigs()
	if err != nil {
		utils.Error(c, 5001, "获取配置失败: "+err.Error())
		return
	}

	utils.Success(c, configs)
}

// SaveDeductConfig 保存扣费配置
// POST /api/v1/admin/currency/deduct-configs
func (h *AdminHandler) SaveDeductConfig(c *gin.Context) {
	var config DeductConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	if err := h.service.SaveDeductConfig(&config); err != nil {
		utils.Error(c, 5001, "保存配置失败: "+err.Error())
		return
	}

	utils.Success(c, config)
}

// ========== 货币配置管理 ==========

// ListCurrencyConfigs 获取所有货币配置
// GET /api/v1/admin/currency/configs
func (h *AdminHandler) ListCurrencyConfigs(c *gin.Context) {
	category := c.Query("category") // 可选筛选：reward, cost

	var configs []CurrencyConfig
	var err error

	if category != "" {
		configs, err = h.service.ListCurrencyConfigsByCategory(category)
	} else {
		configs, err = h.service.ListCurrencyConfigs()
	}

	if err != nil {
		utils.Error(c, 5001, "获取配置失败: "+err.Error())
		return
	}

	utils.Success(c, configs)
}

// GetCurrencyConfig 获取单个货币配置
// GET /api/v1/admin/currency/configs/:key
func (h *AdminHandler) GetCurrencyConfig(c *gin.Context) {
	configKey := c.Param("key")
	if configKey == "" {
		utils.Error(c, 4000, "请指定配置键")
		return
	}

	config, err := h.service.GetCurrencyConfig(configKey)
	if err != nil {
		utils.Error(c, 5001, "获取配置失败: "+err.Error())
		return
	}

	if config == nil {
		utils.Error(c, 4004, "配置不存在")
		return
	}

	utils.Success(c, config)
}

// UpdateCurrencyConfig 更新货币配置
// PUT /api/v1/admin/currency/configs/:key
func (h *AdminHandler) UpdateCurrencyConfig(c *gin.Context) {
	configKey := c.Param("key")
	if configKey == "" {
		utils.Error(c, 4000, "请指定配置键")
		return
	}

	var req struct {
		Amount      *int64  `json:"amount"`
		Description *string `json:"description"`
		Enabled     *bool   `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	// 获取现有配置
	config, err := h.service.GetCurrencyConfig(configKey)
	if err != nil {
		utils.Error(c, 5001, "获取配置失败: "+err.Error())
		return
	}
	if config == nil {
		utils.Error(c, 4004, "配置不存在")
		return
	}

	// 更新字段
	if req.Amount != nil {
		config.Amount = *req.Amount
	}
	if req.Description != nil {
		config.Description = *req.Description
	}
	if req.Enabled != nil {
		config.Enabled = *req.Enabled
	}

	if err := h.service.SaveCurrencyConfig(config); err != nil {
		utils.Error(c, 5001, "保存配置失败: "+err.Error())
		return
	}

	utils.Success(c, config)
}

// InitDefaultConfigs 初始化默认配置
// POST /api/v1/admin/currency/configs/init
func (h *AdminHandler) InitDefaultConfigs(c *gin.Context) {
	if err := h.service.InitDefaultConfigs(); err != nil {
		utils.Error(c, 5001, "初始化配置失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "初始化成功"})
}


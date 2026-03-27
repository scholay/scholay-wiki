package currency

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/utils"
)

// AdminHandler 管理员处理器
type AdminHandler struct {
	service               *Service
	membershipGiftService *MembershipGiftService
	batchService          *BatchService
}

// NewAdminHandler 创建管理员处理器
func NewAdminHandler(service *Service) *AdminHandler {
	return &AdminHandler{service: service}
}

// SetMembershipGiftService 设置会员经费服务（用于触发定时任务）
func (h *AdminHandler) SetMembershipGiftService(svc *MembershipGiftService) {
	h.membershipGiftService = svc
}

// SetBatchService 设置批量发放服务
func (h *AdminHandler) SetBatchService(svc *BatchService) {
	h.batchService = svc
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

	transaction, err := h.service.Recharge(c.Request.Context(), req.UserID, &RechargeRequest{
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

	transaction, err := h.service.Deduct(c.Request.Context(), req.UserID, &DeductRequest{
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
		Amount        *int64  `json:"amount"`
		DisplayName   *string `json:"display_name"`
		DisplayRemark *string `json:"display_remark"`
		Description   *string `json:"description"`
		Enabled       *bool   `json:"enabled"`
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
	if req.DisplayName != nil {
		config.DisplayName = *req.DisplayName
	}
	if req.DisplayRemark != nil {
		config.DisplayRemark = *req.DisplayRemark
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

// ========== 定时任务管理 ==========

// TriggerDailyReminders 手动触发每日提醒任务（用于测试）
// POST /api/v1/admin/currency/trigger-daily-reminders
func (h *AdminHandler) TriggerDailyReminders(c *gin.Context) {
	if h.membershipGiftService == nil {
		utils.Error(c, 5001, "会员经费服务未初始化")
		return
	}

	// 异步执行，避免超时
	go h.membershipGiftService.ExecuteDailyReminders()

	utils.Success(c, gin.H{
		"message": "每日提醒任务已触发，请查看后台日志了解执行情况",
	})
}

// TriggerMonthlyTasks 手动触发月度任务（用于测试或补发）
// POST /api/v1/admin/currency/trigger-monthly-tasks
func (h *AdminHandler) TriggerMonthlyTasks(c *gin.Context) {
	if h.membershipGiftService == nil {
		utils.Error(c, 5001, "会员经费服务未初始化")
		return
	}

	// 异步执行，避免超时
	go h.membershipGiftService.ExecuteMonthlyTasks()

	utils.Success(c, gin.H{
		"message": "月度任务已触发，请查看后台日志了解执行情况",
	})
}

// ========== 批量发放管理 ==========

// BatchDistribute 批量发放经费/恩特币
// POST /api/v1/admin/currency/batch-distribute
func (h *AdminHandler) BatchDistribute(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	var req BatchDistributeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	// 获取当前管理员信息
	adminID, _ := c.Get("admin_id")
	adminName, _ := c.Get("admin_username")

	adminIDUint, ok := adminID.(uint)
	if !ok {
		utils.Error(c, 4001, "获取管理员信息失败")
		return
	}
	adminNameStr, _ := adminName.(string)

	batch, err := h.batchService.CreateBatchDistribute(c.Request.Context(), &req, adminIDUint, adminNameStr)
	if err != nil {
		utils.Error(c, 5001, "创建批量发放失败: "+err.Error())
		return
	}

	utils.Success(c, batch)
}

// GetBatch 获取批次详情
// GET /api/v1/admin/currency/batches/:id
func (h *AdminHandler) GetBatch(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 4000, "无效的批次ID")
		return
	}

	batch, err := h.batchService.GetBatch(uint(id))
	if err != nil {
		utils.Error(c, 5001, "获取批次失败: "+err.Error())
		return
	}

	utils.Success(c, batch)
}

// ListBatches 获取批次列表
// GET /api/v1/admin/currency/batches
func (h *AdminHandler) ListBatches(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	var req BatchListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	// 设置默认值
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 20
	}

	result, err := h.batchService.ListBatches(&req)
	if err != nil {
		utils.Error(c, 5001, "获取批次列表失败: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// CancelBatch 取消批次
// POST /api/v1/admin/currency/batches/:id/cancel
func (h *AdminHandler) CancelBatch(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 4000, "无效的批次ID")
		return
	}

	if err := h.batchService.CancelBatch(uint(id)); err != nil {
		utils.Error(c, 5001, "取消批次失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "批次已取消"})
}

// GetBatchDistributions 获取批次发放明细
// GET /api/v1/admin/currency/batches/:id/distributions
func (h *AdminHandler) GetBatchDistributions(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 4000, "无效的批次ID")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	distributions, total, err := h.batchService.GetBatchDistributions(uint(id), page, pageSize)
	if err != nil {
		utils.Error(c, 5001, "获取发放明细失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"list":      distributions,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetTargetUserCount 获取目标用户数量预览
// POST /api/v1/admin/currency/batch-distribute/preview
func (h *AdminHandler) GetTargetUserCount(c *gin.Context) {
	if h.batchService == nil {
		utils.Error(c, 5001, "批量发放服务未初始化")
		return
	}

	var req struct {
		TargetType    BatchTargetType `json:"target_type" binding:"required,oneof=all members non_members specific"`
		TargetUserIDs []uint          `json:"target_user_ids"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	var count int
	var err error

	switch req.TargetType {
	case BatchTargetAll:
		var userIDs []uint
		userIDs, err = h.batchService.GetAllActiveUserIDs()
		count = len(userIDs)
	case BatchTargetMembers:
		var userIDs []uint
		userIDs, err = h.batchService.GetMemberUserIDs()
		count = len(userIDs)
	case BatchTargetNonMembers:
		var userIDs []uint
		userIDs, err = h.batchService.GetNonMemberUserIDs()
		count = len(userIDs)
	case BatchTargetSpecific:
		count = len(req.TargetUserIDs)
	}

	if err != nil {
		utils.Error(c, 5001, "获取用户数量失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"target_type": req.TargetType,
		"target_name": getTargetName(req.TargetType),
		"user_count":  count,
	})
}


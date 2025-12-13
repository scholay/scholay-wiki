package fund

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/utils"
)

// Handler 基金处理器（用户端）
type Handler struct {
	service *Service
}

// NewHandler 创建处理器
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetCurrentFund 获取当前月份基金
// GET /api/v1/funds/current
func (h *Handler) GetCurrentFund(c *gin.Context) {
	fund, err := h.service.GetCurrentFund()
	if err != nil {
		utils.Error(c, 5001, "获取基金失败: "+err.Error())
		return
	}

	if fund == nil {
		utils.Success(c, nil)
		return
	}

	// 如果用户已登录，获取领取信息
	userID, exists := c.Get("user_id")
	if exists {
		detail, err := h.service.GetFundDetail(fund.ID, userID.(uint))
		if err != nil {
			utils.Error(c, 5001, "获取基金详情失败: "+err.Error())
			return
		}
		utils.Success(c, detail)
		return
	}

	utils.Success(c, fund)
}

// GetFundDetail 获取基金详情
// GET /api/v1/funds/:id
func (h *Handler) GetFundDetail(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.Error(c, 4000, "无效的基金ID")
		return
	}

	// 获取用户ID（可选）
	var userID uint
	if uid, exists := c.Get("user_id"); exists {
		userID = uid.(uint)
	}

	detail, err := h.service.GetFundDetail(uint(id), userID)
	if err != nil {
		utils.Error(c, 5001, "获取基金详情失败: "+err.Error())
		return
	}

	if detail == nil {
		utils.Error(c, 4004, "基金不存在")
		return
	}

	utils.Success(c, detail)
}

// ListFunds 获取基金列表（已生效的）
// GET /api/v1/funds
func (h *Handler) ListFunds(c *gin.Context) {
	funds, err := h.service.ListActiveFunds()
	if err != nil {
		utils.Error(c, 5001, "获取基金列表失败: "+err.Error())
		return
	}

	// 获取总统计
	totalGold, totalDiamond, totalBeneficiaries, _ := h.service.GetTotalStats()

	utils.Success(c, gin.H{
		"funds": funds,
		"stats": gin.H{
			"total_distributed_gold":    totalGold,
			"total_distributed_diamond": totalDiamond,
			"total_beneficiaries":       totalBeneficiaries,
		},
	})
}

// GetMyDistributions 获取我的基金领取记录
// GET /api/v1/user/funds/distributions
func (h *Handler) GetMyDistributions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	dists, err := h.service.ListUserDistributions(userID.(uint))
	if err != nil {
		utils.Error(c, 5001, "获取领取记录失败: "+err.Error())
		return
	}

	utils.Success(c, dists)
}

// ========== 管理后台处理器 ==========

// AdminHandler 管理后台处理器
type AdminHandler struct {
	service *Service
}

// NewAdminHandler 创建管理后台处理器
func NewAdminHandler(service *Service) *AdminHandler {
	return &AdminHandler{service: service}
}

// ListFunds 获取所有基金（分页）
// GET /api/v1/admin/funds
func (h *AdminHandler) ListFunds(c *gin.Context) {
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	funds, total, err := h.service.ListFunds(status, page, pageSize)
	if err != nil {
		utils.Error(c, 5001, "获取基金列表失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"funds":      funds,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

// GetFund 获取基金详情
// GET /api/v1/admin/funds/:id
func (h *AdminHandler) GetFund(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.Error(c, 4000, "无效的基金ID")
		return
	}

	fund, err := h.service.GetFundByID(uint(id))
	if err != nil {
		utils.Error(c, 5001, "获取基金失败: "+err.Error())
		return
	}

	if fund == nil {
		utils.Error(c, 4004, "基金不存在")
		return
	}

	utils.Success(c, fund)
}

// CreateFund 创建基金
// POST /api/v1/admin/funds
func (h *AdminHandler) CreateFund(c *gin.Context) {
	var fund MembershipFund
	if err := c.ShouldBindJSON(&fund); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	if err := h.service.CreateFund(&fund); err != nil {
		utils.Error(c, 5001, "创建基金失败: "+err.Error())
		return
	}

	utils.Success(c, fund)
}

// UpdateFund 更新基金
// PUT /api/v1/admin/funds/:id
func (h *AdminHandler) UpdateFund(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.Error(c, 4000, "无效的基金ID")
		return
	}

	// 获取现有基金
	fund, err := h.service.GetFundByID(uint(id))
	if err != nil {
		utils.Error(c, 5001, "获取基金失败: "+err.Error())
		return
	}
	if fund == nil {
		utils.Error(c, 4004, "基金不存在")
		return
	}

	// 绑定更新数据
	var req struct {
		FundName         *string `json:"fund_name"`
		FundSlogan       *string `json:"fund_slogan"`
		FundDescription  *string `json:"fund_description"`
		CoverImage       *string `json:"cover_image"`
		ThemeColor       *string `json:"theme_color"`
		ProGoldAmount    *int64  `json:"pro_gold_amount"`
		MaxGoldAmount    *int64  `json:"max_gold_amount"`
		MaxDiamondAmount *int64  `json:"max_diamond_amount"`
		Status           *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	// 更新字段
	if req.FundName != nil {
		fund.FundName = *req.FundName
	}
	if req.FundSlogan != nil {
		fund.FundSlogan = *req.FundSlogan
	}
	if req.FundDescription != nil {
		fund.FundDescription = *req.FundDescription
	}
	if req.CoverImage != nil {
		fund.CoverImage = *req.CoverImage
	}
	if req.ThemeColor != nil {
		fund.ThemeColor = *req.ThemeColor
	}
	if req.ProGoldAmount != nil {
		fund.ProGoldAmount = *req.ProGoldAmount
	}
	if req.MaxGoldAmount != nil {
		fund.MaxGoldAmount = *req.MaxGoldAmount
	}
	if req.MaxDiamondAmount != nil {
		fund.MaxDiamondAmount = *req.MaxDiamondAmount
	}
	if req.Status != nil {
		fund.Status = *req.Status
	}

	if err := h.service.UpdateFund(fund); err != nil {
		utils.Error(c, 5001, "更新基金失败: "+err.Error())
		return
	}

	utils.Success(c, fund)
}

// DeleteFund 删除基金
// DELETE /api/v1/admin/funds/:id
func (h *AdminHandler) DeleteFund(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.Error(c, 4000, "无效的基金ID")
		return
	}

	if err := h.service.DeleteFund(uint(id)); err != nil {
		utils.Error(c, 5001, "删除基金失败: "+err.Error())
		return
	}

	utils.Success(c, nil)
}

// GetStats 获取基金统计
// GET /api/v1/admin/funds/stats
func (h *AdminHandler) GetStats(c *gin.Context) {
	totalGold, totalDiamond, totalBeneficiaries, err := h.service.GetTotalStats()
	if err != nil {
		utils.Error(c, 5001, "获取统计失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"total_distributed_gold":    totalGold,
		"total_distributed_diamond": totalDiamond,
		"total_beneficiaries":       totalBeneficiaries,
	})
}


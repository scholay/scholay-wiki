package coupon

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ============================================
// Admin APIs - 折扣券模板管理
// ============================================

// CreateTemplate 创建折扣券模板
func (h *Handler) CreateTemplate(c *gin.Context) {
	var req CreateCouponTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 获取管理员ID
	adminIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	adminID := adminIDInterface.(uint)

	template, err := h.service.CreateTemplate(&req, uint64(adminID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, template)
}

// UpdateTemplate 更新折扣券模板
func (h *Handler) UpdateTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid template ID")
		return
	}

	var req UpdateCouponTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.UpdateTemplate(id, &req); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template updated successfully"})
}

// GetTemplate 获取模板详情
func (h *Handler) GetTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid template ID")
		return
	}

	template, err := h.service.GetTemplate(id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Template not found")
		return
	}

	utils.Success(c, template)
}

// ListTemplates 获取模板列表
func (h *Handler) ListTemplates(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// 可选过滤参数
	var status *TemplateStatus
	if s := c.Query("status"); s != "" {
		templateStatus := TemplateStatus(s)
		status = &templateStatus
	}

	var distributionType *DistributionType
	if dt := c.Query("distribution_type"); dt != "" {
		distType := DistributionType(dt)
		distributionType = &distType
	}

	templates, total, err := h.service.ListTemplates(status, distributionType, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"templates": templates,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// ActivateTemplate 激活模板
func (h *Handler) ActivateTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid template ID")
		return
	}

	if err := h.service.ActivateTemplate(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template activated successfully"})
}

// PauseTemplate 暂停模板
func (h *Handler) PauseTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid template ID")
		return
	}

	if err := h.service.PauseTemplate(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template paused successfully"})
}

// DeleteTemplate 删除模板
func (h *Handler) DeleteTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid template ID")
		return
	}

	if err := h.service.DeleteTemplate(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template deleted successfully"})
}

// AdminListAllDistributedCoupons 管理员获取所有已发放折扣券列表
func (h *Handler) AdminListAllDistributedCoupons(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// 可选过滤参数
	var templateID *uint64
	if tidStr := c.Query("template_id"); tidStr != "" {
		tid, err := strconv.ParseUint(tidStr, 10, 64)
		if err == nil {
			templateID = &tid
		}
	}

	var status *CouponStatus
	if s := c.Query("status"); s != "" {
		couponStatus := CouponStatus(s)
		status = &couponStatus
	}

	userEmail := c.Query("user_email")

	coupons, total, err := h.service.AdminListAllDistributedCoupons(templateID, status, userEmail, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"coupons":   coupons,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// ============================================
// Admin APIs - 折扣券发放管理
// ============================================

// DistributeCoupons 发放折扣券
func (h *Handler) DistributeCoupons(c *gin.Context) {
	var req DistributeCouponRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 设置默认来源类型
	if req.SourceType == "" {
		req.SourceType = SourceTypeManual
	}

	if err := h.service.DistributeCoupons(&req); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Coupons distributed successfully"})
}

// GetStatistics 获取统计信息
func (h *Handler) GetStatistics(c *gin.Context) {
	stats, err := h.service.GetStatistics()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, stats)
}

// ============================================
// User APIs - 用户折扣券管理
// ============================================

// GetMyCoupons 获取我的折扣券
func (h *Handler) GetMyCoupons(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// 可选状态过滤
	var status *CouponStatus
	if s := c.Query("status"); s != "" {
		couponStatus := CouponStatus(s)
		status = &couponStatus
	}

	coupons, total, err := h.service.GetUserCoupons(uint64(userID), status, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"coupons":   coupons,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetAvailableCoupons 获取可用折扣券
func (h *Handler) GetAvailableCoupons(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	amount, err := strconv.ParseFloat(c.Query("amount"), 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid amount")
		return
	}

	coupons, err := h.service.GetAvailableCoupons(uint64(userID), amount)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, coupons)
}

// ClaimCoupon 领取折扣券
func (h *Handler) ClaimCoupon(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	var req ClaimCouponRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	coupon, err := h.service.ClaimCoupon(uint64(userID), req.Code)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, coupon)
}

// ApplyCoupon 应用折扣券到订单
func (h *Handler) ApplyCoupon(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	var req ApplyCouponRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	usageLog, err := h.service.ApplyCoupon(uint64(userID), req.CouponID, req.OrderID, req.Amount)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, usageLog)
}

// CalculateDiscount 计算折扣（预览）
func (h *Handler) CalculateDiscount(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	couponID, err := strconv.ParseUint(c.Query("coupon_id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid coupon ID")
		return
	}

	amount, err := strconv.ParseFloat(c.Query("amount"), 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid amount")
		return
	}

	// 获取折扣券信息
	coupons, _, err := h.service.GetUserCoupons(uint64(userID), nil, 1, 1000)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	var targetCoupon *UserCoupon
	for _, coupon := range coupons {
		if coupon.ID == couponID {
			targetCoupon = coupon
			break
		}
	}

	if targetCoupon == nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Coupon not found")
		return
	}

	// 验证并计算折扣
	if targetCoupon.Status != CouponStatusUnused {
		utils.ErrorResponse(c, http.StatusBadRequest, "Coupon is not available")
		return
	}

	if !IsValidTime(targetCoupon.ValidFrom, targetCoupon.ValidUntil) {
		utils.ErrorResponse(c, http.StatusBadRequest, "Coupon has expired")
		return
	}

	if !IsValidAmount(targetCoupon.MinPurchaseAmount, amount) {
		utils.ErrorResponse(c, http.StatusBadRequest, "Amount does not meet minimum requirement")
		return
	}

	discountAmount := CalculateDiscount(
		DiscountType(targetCoupon.DiscountType),
		targetCoupon.DiscountValue,
		amount,
	)

	utils.Success(c, gin.H{
		"original_amount": amount,
		"discount_amount": discountAmount,
		"final_amount":    amount - discountAmount,
		"coupon":          targetCoupon,
	})
}

// ============================================
// User APIs - 邀请系统
// ============================================

// GenerateInvitation 生成邀请码
func (h *Handler) GenerateInvitation(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	invitation, err := h.service.GenerateInvitation(uint64(userID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, invitation)
}

// GetMyInvitation 获取我的邀请信息
func (h *Handler) GetMyInvitation(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	invitation, err := h.service.GetUserInvitation(uint64(userID))
	if err != nil {
		// 用户还没有邀请码，返回 200 但 data 为 null
		utils.Success(c, gin.H{
			"invitation": nil,
			"has_invitation": false,
			"message": "No invitation code generated yet",
		})
		return
	}

	utils.Success(c, gin.H{
		"invitation": invitation,
		"has_invitation": true,
	})
}

// GetInvitationStatistics 获取邀请统计
func (h *Handler) GetInvitationStatistics(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	userID := userIDInterface.(uint)

	invitation, relationships, err := h.service.GetInvitationStatistics(uint64(userID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"invitation":    invitation,
		"relationships": relationships,
	})
}

// ============================================
// Admin APIs - 批量发放管理
// ============================================

// CreateBatch 创建批量发放批次
func (h *Handler) CreateBatch(c *gin.Context) {
	var req CreateBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 获取管理员ID
	adminIDInterface, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	adminID := adminIDInterface.(uint)

	batch, err := h.service.CreateBatchFromRequest(&req, uint64(adminID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, batch)
}

// GetBatch 获取批次详情
func (h *Handler) GetBatch(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid batch ID")
		return
	}

	batch, err := h.service.GetBatch(id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Batch not found")
		return
	}

	utils.Success(c, batch)
}

// ListBatches 获取批次列表
func (h *Handler) ListBatches(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// 可选状态过滤
	var status *string
	if s := c.Query("status"); s != "" {
		status = &s
	}

	batches, total, err := h.service.ListBatches(status, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"batches":   batches,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// ExecuteBatch 执行批次发放
func (h *Handler) ExecuteBatch(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid batch ID")
		return
	}

	if err := h.service.ExecuteBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Batch executed successfully"})
}

// CancelBatch 取消批次
func (h *Handler) CancelBatch(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid batch ID")
		return
	}

	if err := h.service.CancelBatch(id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Batch cancelled successfully"})
}
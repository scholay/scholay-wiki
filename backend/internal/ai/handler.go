// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// ListPromptTemplates lists all prompt templates
func (h *Handler) ListPromptTemplates(c *gin.Context) {
	templates, err := h.service.ListPromptTemplates()
	if err != nil {
		utils.Error(c, 500, "Failed to list templates: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"templates": templates,
		"total":     len(templates),
	})
}

// GetPromptTemplate gets a prompt template by ID
func (h *Handler) GetPromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	template, err := h.service.GetPromptTemplateByID(uint(id))
	if err != nil {
		utils.Error(c, 404, "Template not found")
		return
	}

	utils.Success(c, template)
}

// CreatePromptTemplate creates a new prompt template
func (h *Handler) CreatePromptTemplate(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Key         string `json:"key" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"` // Frontend sends bool, we'll convert
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	template := &PromptTemplate{
		Name:        req.Name,
		Key:         req.Key,
		Template:    req.Template,
		Description: req.Description,
		IsActive:    isActive,
	}

	if err := h.service.CreatePromptTemplate(template); err != nil {
		utils.Error(c, 500, "Failed to create template: "+err.Error())
		return
	}

	utils.Success(c, template)
}

// UpdatePromptTemplate updates a prompt template
func (h *Handler) UpdatePromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"` // Frontend sends bool, we'll convert
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	template, err := h.service.GetPromptTemplateByID(uint(id))
	if err != nil {
		utils.Error(c, 404, "Template not found")
		return
	}

	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	template.Name = req.Name
	template.Template = req.Template
	template.Description = req.Description
	template.IsActive = isActive

	if err := h.service.UpdatePromptTemplate(template); err != nil {
		utils.Error(c, 500, "Failed to update template: "+err.Error())
		return
	}

	utils.Success(c, template)
}

// DeletePromptTemplate deletes a prompt template
func (h *Handler) DeletePromptTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid template ID")
		return
	}

	if err := h.service.DeletePromptTemplate(uint(id)); err != nil {
		utils.Error(c, 500, "Failed to delete template: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Template deleted successfully"})
}

// AnalyzePaperRequest 论文分析请求结构
type AnalyzePaperRequest struct {
	PaperID  string `json:"paperId"`                       // 论文ID，用于数据库缓存
	Title    string `json:"title"`
	Abstract string `json:"abstract" binding:"required"`
}

// AnalyzePaperResponse 分析论文响应结构（包含扣费信息）
type AnalyzePaperResponse struct {
	Data           map[string]string `json:"data"`
	Dimensions     []DimensionInfo   `json:"dimensions"`
	DeductedAmount int64             `json:"deducted_amount"` // 实际扣费金额，0表示未扣费（缓存命中或无需扣费）
}

// AnalyzePaper 分析论文摘要，提取结构化信息
// POST /api/v1/public/papers/analyze (公共接口，使用系统默认维度)
// POST /api/v1/analysis/paper (需登录，使用用户自定义维度)
// 优先从数据库缓存获取，如果没有则调用AI分析并保存结果
// 扣费逻辑：同一篇论文 + 同一维度配置 只扣一次费
// 响应中包含 deducted_amount 字段，表示本次请求实际扣费金额
func (h *Handler) AnalyzePaper(c *gin.Context) {
	var req AnalyzePaperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	if req.Abstract == "" {
		utils.Error(c, 400, "Abstract is required for analysis")
		return
	}

	// 限制摘要长度，避免过长的请求
	if len(req.Abstract) > 5000 {
		utils.Error(c, 400, "Abstract exceeds 5000 characters limit")
		return
	}

	// 尝试从上下文获取用户ID（公共接口为nil，使用系统默认维度）
	var userID *uint
	if uid, exists := c.Get("user_id"); exists {
		if id, ok := uid.(uint); ok && id > 0 {
			userID = &id
		}
	}

	result, analysisCtx, err := h.service.AnalyzePaperAbstract(req.PaperID, req.Title, req.Abstract, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to analyze paper: "+err.Error())
		return
	}

	// 获取配置的扣费金额（由中间件设置）
	var deductedAmount int64 = 0
	if amt, exists := c.Get("deduct_amount_config"); exists {
		deductedAmount = amt.(int64)
	}

	// 设置扣费相关的上下文信息
	// bizID = paperId_dimensionHash，用于去重扣费
	if req.PaperID != "" && analysisCtx != nil {
		bizID := req.PaperID + "_" + analysisCtx.DimensionHash
		c.Set("deduct_biz_id", bizID)
		
		// 如果结果来自缓存，说明之前已经分析过（已扣费），跳过本次扣费
		if analysisCtx.FromCache {
			c.Set("skip_deduct", true)
			deductedAmount = 0 // 缓存命中，不扣费
		}
	}

	// 返回结果，包含扣费金额
	utils.Success(c, AnalyzePaperResponse{
		Data:           result.Data,
		Dimensions:     result.Dimensions,
		DeductedAmount: deductedAmount,
	})
}

// GetAnalysisDimensions 获取分析维度列表
// GET /api/v1/public/analysis/dimensions - 公共接口，返回系统默认维度
// GET /api/v1/analysis/dimensions - 需登录，返回用户自定义维度或系统默认维度
func (h *Handler) GetAnalysisDimensions(c *gin.Context) {
	// 尝试从上下文获取用户ID
	var userID *uint
	if uid, exists := c.Get("user_id"); exists {
		if id, ok := uid.(uint); ok && id > 0 {
			userID = &id
		}
	}

	result, err := h.service.GetAnalysisDimensions(userID)
	if err != nil {
		utils.Error(c, 500, "Failed to get dimensions: "+err.Error())
		return
	}

	// 计算用户新增的自定义维度数量（不包括对系统维度的修改）
	customCount := 0
	if userID != nil {
		systemDimensions, _ := h.service.GetSystemDimensions()
		systemKeySet := make(map[string]bool)
		for _, sd := range systemDimensions {
			systemKeySet[sd.DimensionKey] = true
		}
		for _, d := range result.Dimensions {
			if d.UserID > 0 && !systemKeySet[d.DimensionKey] {
				customCount++
			}
		}
	}

	utils.Success(c, gin.H{
		"dimensions":    result.Dimensions,
		"total":         len(result.Dimensions),
		"isCustom":      result.IsCustom,
		"maxDimensions": MaxUserDimensions, // 最大维度数量
		"customCount":   customCount,       // 用户新增的自定义维度数量
	})
}

// GetSystemDimensions 获取系统默认分析维度
// GET /api/v1/public/analysis/dimensions/system
func (h *Handler) GetSystemDimensions(c *gin.Context) {
	dimensions, err := h.service.GetSystemDimensions()
	if err != nil {
		utils.Error(c, 500, "Failed to get system dimensions: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"dimensions": dimensions,
		"total":      len(dimensions),
	})
}

// CreateUserDimensionRequest 创建用户自定义维度请求
type CreateUserDimensionRequest struct {
	DimensionKey string `json:"dimensionKey" binding:"required"`
	Name         string `json:"name" binding:"required"`
	Description  string `json:"description" binding:"required"`
	SortOrder    int    `json:"sortOrder"`
}

// CreateUserDimension 创建用户自定义维度
// POST /api/v1/analysis/dimensions
func (h *Handler) CreateUserDimension(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	var req CreateUserDimensionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	dimension, err := h.service.CreateUserDimension(userID.(uint), req.DimensionKey, req.Name, req.Description, req.SortOrder)
	if err != nil {
		utils.Error(c, 500, "Failed to create dimension: "+err.Error())
		return
	}

	utils.Success(c, dimension)
}

// UpdateUserDimensionRequest 更新用户自定义维度请求
type UpdateUserDimensionRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description" binding:"required"`
	SortOrder   int    `json:"sortOrder"`
}

// UpdateUserDimension 更新用户自定义维度
// PUT /api/v1/analysis/dimensions/:id
func (h *Handler) UpdateUserDimension(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	dimensionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid dimension ID")
		return
	}

	var req UpdateUserDimensionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	dimension, err := h.service.UpdateUserDimension(userID.(uint), uint(dimensionID), req.Name, req.Description, req.SortOrder)
	if err != nil {
		utils.Error(c, 500, "Failed to update dimension: "+err.Error())
		return
	}

	utils.Success(c, dimension)
}

// DeleteUserDimension 删除用户自定义维度
// DELETE /api/v1/analysis/dimensions/:id
func (h *Handler) DeleteUserDimension(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	dimensionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid dimension ID")
		return
	}

	if err := h.service.DeleteUserDimension(userID.(uint), uint(dimensionID)); err != nil {
		utils.Error(c, 500, "Failed to delete dimension: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Dimension deleted successfully"})
}

// ResetUserDimension 重置用户的某个维度为系统默认
// DELETE /api/v1/analysis/dimensions/reset/:dimensionKey
func (h *Handler) ResetUserDimension(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	dimensionKey := c.Param("dimensionKey")
	if dimensionKey == "" {
		utils.Error(c, 400, "Dimension key is required")
		return
	}

	if err := h.service.ResetUserDimensionToDefault(userID.(uint), dimensionKey); err != nil {
		utils.Error(c, 500, "Failed to reset dimension: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Dimension reset to default successfully"})
}

// ResetAllUserDimensions 重置用户的所有维度为系统默认
// DELETE /api/v1/analysis/dimensions/reset-all
func (h *Handler) ResetAllUserDimensions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	if err := h.service.ResetAllUserDimensions(userID.(uint)); err != nil {
		utils.Error(c, 500, "Failed to reset all dimensions: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "All dimensions reset to default successfully"})
}

// CopySystemDimensionsToUser 将系统默认维度复制给用户
// POST /api/v1/analysis/dimensions/copy-from-system
func (h *Handler) CopySystemDimensionsToUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	// 先检查用户是否已有自定义维度
	existingDimensions, err := h.service.GetUserDimensions(userID.(uint))
	if err != nil {
		utils.Error(c, 500, "Failed to check existing dimensions: "+err.Error())
		return
	}

	if len(existingDimensions) > 0 {
		utils.Error(c, 400, "User already has custom dimensions")
		return
	}

	dimensions, err := h.service.CopySystemDimensionsToUser(userID.(uint))
	if err != nil {
		utils.Error(c, 500, "Failed to copy dimensions: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"dimensions": dimensions,
		"total":      len(dimensions),
	})
}

// ========== 管理员接口 ==========

// AdminGetSystemDimensions 管理员获取系统默认分析维度
// GET /api/v1/admin/analysis/dimensions
func (h *Handler) AdminGetSystemDimensions(c *gin.Context) {
	dimensions, err := h.service.GetSystemDimensions()
	if err != nil {
		utils.Error(c, 500, "Failed to get system dimensions: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"dimensions": dimensions,
		"total":      len(dimensions),
	})
}

// AdminUpdateSystemDimensionRequest 管理员更新系统默认维度请求
type AdminUpdateSystemDimensionRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description" binding:"required"`
	SortOrder   int    `json:"sortOrder"`
	IsActive    bool   `json:"isActive"`
}

// AdminUpdateSystemDimension 管理员更新系统默认分析维度
// PUT /api/v1/admin/analysis/dimensions/:id
func (h *Handler) AdminUpdateSystemDimension(c *gin.Context) {
	dimensionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid dimension ID")
		return
	}

	var req AdminUpdateSystemDimensionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	dimension, err := h.service.UpdateSystemDimension(uint(dimensionID), req.Name, req.Description, req.SortOrder, req.IsActive)
	if err != nil {
		utils.Error(c, 500, "Failed to update dimension: "+err.Error())
		return
	}

	utils.Success(c, dimension)
}

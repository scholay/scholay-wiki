// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"log/slog"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/currency"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service         *Service
	currencyService *currency.Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// SetCurrencyService 注入货币服务（用于批量分析扣费）
func (h *Handler) SetCurrencyService(currencyService *currency.Service) {
	h.currencyService = currencyService
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

// ============ 批量分析相关结构 ============

// BatchAnalyzePapersRequest 批量分析论文请求
type BatchAnalyzePapersRequest struct {
	Papers []PaperInput `json:"papers" binding:"required,min=1,max=10"`
}

// PaperInput 单篇论文输入
type PaperInput struct {
	PaperID  string `json:"paperId" binding:"required"`
	Title    string `json:"title"`
	Abstract string `json:"abstract" binding:"required,max=5000"`
}

// BatchAnalyzePapersResponse 批量分析论文响应
type BatchAnalyzePapersResponse struct {
	Results       []PaperAnalysisItem `json:"results"`
	TotalDeducted int64               `json:"total_deducted"` // 总扣费金额
}

// PaperAnalysisItem 单篇论文分析结果
type PaperAnalysisItem struct {
	PaperID        string            `json:"paperId"`
	Success        bool              `json:"success"`
	Data           map[string]string `json:"data,omitempty"`
	Dimensions     []DimensionInfo   `json:"dimensions,omitempty"`
	DeductedAmount int64             `json:"deducted_amount"` // 该篇论文的扣费金额
	FromCache      bool              `json:"from_cache"`      // 是否来自缓存
	Error          string            `json:"error,omitempty"`
}

// BatchAnalyzePapers 批量分析论文摘要
// POST /api/v1/analysis/papers/batch
// 批量分析多篇论文，支持1-10篇
// 扣费逻辑：每篇论文独立扣费去重（bizID = paperId + dimensionHash）
// 缓存命中的论文不扣费
// 响应中包含每篇论文的扣费金额和总扣费金额
func (h *Handler) BatchAnalyzePapers(c *gin.Context) {
	var req BatchAnalyzePapersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	// 获取用户ID
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "User not authenticated")
		return
	}
	uid := userID.(uint)

	// 检查currencyService是否注入
	if h.currencyService == nil {
		utils.Error(c, 500, "Currency service not initialized")
		return
	}

	// 1. 获取扣费配置
	bizType := "paper_analysis"
	config, err := h.currencyService.GetDeductConfig(bizType)
	if err != nil {
		utils.Error(c, 500, "Failed to get deduct config: "+err.Error())
		return
	}

	// 如果没有配置或金额为0，跳过扣费
	deductAmount := int64(0)
	needDeduct := config != nil && config.Amount > 0
	if needDeduct {
		deductAmount = config.Amount
	}

	// 2. 获取用户的分析维度（所有论文使用相同的维度配置）
	var userIDPtr *uint = &uid
	dimensionResult, err := h.service.GetAnalysisDimensions(userIDPtr)
	if err != nil {
		utils.Error(c, 500, "Failed to get dimensions: "+err.Error())
		return
	}
	dimensions := dimensionResult.Dimensions
	if len(dimensions) == 0 {
		utils.Error(c, 500, "No active analysis dimensions found")
		return
	}
	dimensionHash := h.service.generateDimensionHash(dimensions)

	// 3. 预检查：计算需要扣费的论文数量（排除已扣费和缓存命中的）
	needDeductCount := 0
	paperNeedDeduct := make(map[string]bool) // paperId -> 是否需要扣费

	for _, paper := range req.Papers {
		bizID := paper.PaperID + "_" + dimensionHash

		// 检查是否已经扣过费
		alreadyDeducted, _ := h.currencyService.HasDeducted(uid, bizType, bizID)
		if alreadyDeducted {
			paperNeedDeduct[paper.PaperID] = false
			continue
		}

		// 检查缓存
		fromCache := h.service.checkPaperAnalysisCache(paper.PaperID, dimensionHash)
		if fromCache {
			paperNeedDeduct[paper.PaperID] = false
			continue
		}

		// 需要扣费
		paperNeedDeduct[paper.PaperID] = true
		needDeductCount++
	}

	// 4. 检查余额是否足够
	if needDeduct && needDeductCount > 0 {
		totalRequired := deductAmount * int64(needDeductCount)
		checkResult, err := h.currencyService.CheckBalance(uid, config.CurrencyType, totalRequired)
		if err != nil {
			utils.Error(c, 500, "Failed to check balance: "+err.Error())
			return
		}
		if !checkResult.Sufficient {
			utils.PaymentRequired(c, "余额不足", gin.H{
				"currency_type":     config.CurrencyType,
				"balance":           checkResult.Balance,
				"required":          checkResult.Required,
				"shortage":          checkResult.Shortage,
				"papers_count":      len(req.Papers),
				"need_deduct_count": needDeductCount,
			})
			return
		}
	}

	// 5. 批量分析论文
	results := make([]PaperAnalysisItem, 0, len(req.Papers))
	var totalDeducted int64 = 0
	ctx := c.Request.Context()

	for _, paper := range req.Papers {
		item := PaperAnalysisItem{
			PaperID:        paper.PaperID,
			DeductedAmount: 0,
			FromCache:      false,
		}

		// 分析论文
		result, analysisCtx, err := h.service.AnalyzePaperAbstract(c.Request.Context(), paper.PaperID, paper.Title, paper.Abstract, userIDPtr)
		if err != nil {
			item.Success = false
			item.Error = err.Error()
			results = append(results, item)
			continue
		}

		item.Success = true
		item.Data = result.Data
		item.Dimensions = result.Dimensions
		item.FromCache = analysisCtx.FromCache

		// 扣费逻辑
		if needDeduct && paperNeedDeduct[paper.PaperID] && !analysisCtx.FromCache {
			bizID := paper.PaperID + "_" + analysisCtx.DimensionHash

			// 再次检查是否已扣费（防止并发）
			alreadyDeducted, _ := h.currencyService.HasDeducted(uid, bizType, bizID)
			if !alreadyDeducted {
				// 执行扣费
				_, err := h.currencyService.Deduct(ctx, uid, &currency.DeductRequest{
					CurrencyType: config.CurrencyType,
					Amount:       config.Amount,
					BizType:      bizType,
					BizID:        bizID,
					Description:  config.Description,
				})
				if err != nil {
					slog.Error("BatchAnalyze deduct failed", "paperId", paper.PaperID, "err", err)
				} else {
					item.DeductedAmount = config.Amount
					totalDeducted += config.Amount
					slog.Info("BatchAnalyze deducted", "amount", config.Amount, "paperId", paper.PaperID, "bizId", bizID)
				}
			}
		}

		results = append(results, item)
	}

	utils.Success(c, BatchAnalyzePapersResponse{
		Results:       results,
		TotalDeducted: totalDeducted,
	})
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

	result, analysisCtx, err := h.service.AnalyzePaperAbstract(c.Request.Context(), req.PaperID, req.Title, req.Abstract, userID)
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

// StreamTranslateRequest 流式翻译请求结构
type StreamTranslateRequest struct {
	Text string `json:"text" binding:"required"`
}

// StreamTranslate 流式翻译接口
// POST /api/v1/public/translate/stream
// 将非中文文本翻译为中文，使用SSE流式输出
func (h *Handler) StreamTranslate(c *gin.Context) {
	var req StreamTranslateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "无效的请求参数: "+err.Error())
		return
	}

	if req.Text == "" {
		utils.BadRequest(c, "翻译文本不能为空")
		return
	}

	if len(req.Text) > 10000 {
		utils.BadRequest(c, "文本长度超过10000字符限制")
		return
	}

	sse.SetHeaders(c)

	err := h.service.StreamTranslateToChinese(c.Request.Context(), req.Text, c.Writer)
	if err != nil {
		sse.WriteError(c.Writer, err.Error())
		return
	}

	sse.WriteDone(c.Writer)
}

// StreamTranslatePaperRequest 论文翻译请求结构
type StreamTranslatePaperRequest struct {
	Title    string `json:"title"`
	Abstract string `json:"abstract"`
	TLDR     string `json:"tldr"`
}

// StreamTranslatePaper 论文整体翻译接口
// POST /api/v1/public/translate/paper/stream
// 一次性翻译论文的标题、摘要、TLDR，使用SSE流式输出
func (h *Handler) StreamTranslatePaper(c *gin.Context) {
	var req StreamTranslatePaperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "无效的请求参数: "+err.Error())
		return
	}

	if req.Title == "" && req.Abstract == "" && req.TLDR == "" {
		utils.BadRequest(c, "至少需要提供标题、摘要或TLDR中的一项")
		return
	}

	totalLen := len(req.Title) + len(req.Abstract) + len(req.TLDR)
	if totalLen > 20000 {
		utils.BadRequest(c, "总文本长度超过20000字符限制")
		return
	}

	sse.SetHeaders(c)

	err := h.service.StreamTranslatePaperToChinese(c.Request.Context(), req.Title, req.Abstract, req.TLDR, c.Writer)
	if err != nil {
		sse.WriteError(c.Writer, err.Error())
		return
	}

	sse.WriteDone(c.Writer)
}

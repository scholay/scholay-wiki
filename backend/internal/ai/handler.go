// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

// batchAnalyzeConcurrency 限制单次批量分析的并发度。
// 设为 5：留出账户轮换空间（AI 后端可能有 3~5 个账户），同时避免共享连接池被打满。
const batchAnalyzeConcurrency = 5

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
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	template, err := h.service.GetPromptTemplateByID(id)
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

	if !utils.BindJSON(c, &req) {
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
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"` // Frontend sends bool, we'll convert
	}

	if !utils.BindJSON(c, &req) {
		return
	}

	template, err := h.service.GetPromptTemplateByID(id)
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
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeletePromptTemplate(id); err != nil {
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

// AnalyzePaperResponse 分析论文响应结构
type AnalyzePaperResponse struct {
	Data       map[string]string `json:"data"`
	Dimensions []DimensionInfo   `json:"dimensions"`
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
	Results []PaperAnalysisItem `json:"results"`
}

// PaperAnalysisItem 单篇论文分析结果
type PaperAnalysisItem struct {
	PaperID    string            `json:"paperId"`
	Success    bool              `json:"success"`
	Data       map[string]string `json:"data,omitempty"`
	Dimensions []DimensionInfo   `json:"dimensions,omitempty"`
	FromCache  bool              `json:"from_cache"` // 是否来自缓存
	Error      string            `json:"error,omitempty"`
}

// BatchAnalyzePapers 批量分析论文摘要
// POST /api/v1/analysis/papers/batch
// 批量分析多篇论文，支持1-10篇
func (h *Handler) BatchAnalyzePapers(c *gin.Context) {
	var req BatchAnalyzePapersRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 获取用户ID
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	// 获取用户的分析维度（所有论文使用相同的维度配置）
	userIDPtr := &uid
	dimensionResult, err := h.service.GetAnalysisDimensions(userIDPtr)
	if err != nil {
		utils.Error(c, 500, "Failed to get dimensions: "+err.Error())
		return
	}
	if len(dimensionResult.Dimensions) == 0 {
		utils.Error(c, 500, "No active analysis dimensions found")
		return
	}

	// 批量分析论文 —— 并发处理（固定位索引保证输出顺序与输入一致）。
	// 单篇失败不影响其他论文；所有篇目完成后一次性返回。
	// errgroup 保证 goroutine 在 Wait 前全部退出；每个 goroutine 写入独立下标，无需额外互斥。
	results := make([]PaperAnalysisItem, len(req.Papers))
	eg, egCtx := errgroup.WithContext(c.Request.Context())
	eg.SetLimit(batchAnalyzeConcurrency)

	for i, paper := range req.Papers {
		i, paper := i, paper
		eg.Go(func() error {
			item := PaperAnalysisItem{PaperID: paper.PaperID}
			result, analysisCtx, err := h.service.AnalyzePaperAbstract(egCtx, paper.PaperID, paper.Title, paper.Abstract, userIDPtr)
			if err != nil {
				item.Success = false
				item.Error = err.Error()
			} else {
				item.Success = true
				item.Data = result.Data
				item.Dimensions = result.Dimensions
				item.FromCache = analysisCtx.FromCache
			}
			results[i] = item
			return nil // 单篇失败不向上抛，保证其他继续
		})
	}
	_ = eg.Wait() // 上面从不返回 error

	utils.Success(c, BatchAnalyzePapersResponse{
		Results: results,
	})
}

// AnalyzePaper 分析论文摘要，提取结构化信息
// POST /api/v1/public/papers/analyze (公共接口，使用系统默认维度)
// POST /api/v1/analysis/paper (需登录，使用用户自定义维度)
// 优先从数据库缓存获取，如果没有则调用AI分析并保存结果
func (h *Handler) AnalyzePaper(c *gin.Context) {
	var req AnalyzePaperRequest
	if !utils.BindJSON(c, &req) {
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
	if uid, ok := utils.GetOptionalUserID(c); ok && uid > 0 {
		userID = &uid
	}

	result, _, err := h.service.AnalyzePaperAbstract(c.Request.Context(), req.PaperID, req.Title, req.Abstract, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to analyze paper: "+err.Error())
		return
	}

	utils.Success(c, AnalyzePaperResponse{
		Data:       result.Data,
		Dimensions: result.Dimensions,
	})
}

// GetAnalysisDimensions 获取分析维度列表
// GET /api/v1/public/analysis/dimensions - 公共接口，返回系统默认维度
// GET /api/v1/analysis/dimensions - 需登录，返回用户自定义维度或系统默认维度
func (h *Handler) GetAnalysisDimensions(c *gin.Context) {
	// 尝试从上下文获取用户ID
	var userID *uint
	if uid, ok := utils.GetOptionalUserID(c); ok && uid > 0 {
		userID = &uid
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req CreateUserDimensionRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	dimension, err := h.service.CreateUserDimension(userID, req.DimensionKey, req.Name, req.Description, req.SortOrder)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	dimensionID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateUserDimensionRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	dimension, err := h.service.UpdateUserDimension(userID, dimensionID, req.Name, req.Description, req.SortOrder)
	if err != nil {
		utils.Error(c, 500, "Failed to update dimension: "+err.Error())
		return
	}

	utils.Success(c, dimension)
}

// DeleteUserDimension 删除用户自定义维度
// DELETE /api/v1/analysis/dimensions/:id
func (h *Handler) DeleteUserDimension(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	dimensionID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteUserDimension(userID, dimensionID); err != nil {
		utils.Error(c, 500, "Failed to delete dimension: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Dimension deleted successfully"})
}

// ResetUserDimension 重置用户的某个维度为系统默认
// DELETE /api/v1/analysis/dimensions/reset/:dimensionKey
func (h *Handler) ResetUserDimension(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	dimensionKey := c.Param("dimensionKey")
	if dimensionKey == "" {
		utils.Error(c, 400, "Dimension key is required")
		return
	}

	if err := h.service.ResetUserDimensionToDefault(userID, dimensionKey); err != nil {
		utils.Error(c, 500, "Failed to reset dimension: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Dimension reset to default successfully"})
}

// ResetAllUserDimensions 重置用户的所有维度为系统默认
// DELETE /api/v1/analysis/dimensions/reset-all
func (h *Handler) ResetAllUserDimensions(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	if err := h.service.ResetAllUserDimensions(userID); err != nil {
		utils.Error(c, 500, "Failed to reset all dimensions: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "All dimensions reset to default successfully"})
}

// CopySystemDimensionsToUser 将系统默认维度复制给用户
// POST /api/v1/analysis/dimensions/copy-from-system
func (h *Handler) CopySystemDimensionsToUser(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	// 先检查用户是否已有自定义维度
	existingDimensions, err := h.service.GetUserDimensions(userID)
	if err != nil {
		utils.Error(c, 500, "Failed to check existing dimensions: "+err.Error())
		return
	}

	if len(existingDimensions) > 0 {
		utils.Error(c, 400, "User already has custom dimensions")
		return
	}

	dimensions, err := h.service.CopySystemDimensionsToUser(userID)
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
	dimensionID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req AdminUpdateSystemDimensionRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	dimension, err := h.service.UpdateSystemDimension(dimensionID, req.Name, req.Description, req.SortOrder, req.IsActive)
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
	if !utils.BindJSON(c, &req) {
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

	w, stop := sse.BeginStream(c)
	defer stop()

	err := h.service.StreamTranslateToChinese(c.Request.Context(), req.Text, w)
	if err != nil {
		sse.WriteError(w, err.Error())
		return
	}

	sse.WriteDone(w)
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
	if !utils.BindJSON(c, &req) {
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

	w, stop := sse.BeginStream(c)
	defer stop()

	err := h.service.StreamTranslatePaperToChinese(c.Request.Context(), req.Title, req.Abstract, req.TLDR, w)
	if err != nil {
		sse.WriteError(w, err.Error())
		return
	}

	sse.WriteDone(w)
}

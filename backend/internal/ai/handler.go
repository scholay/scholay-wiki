// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"errors"
	"log/slog"

	"scholar-backend/internal/common/aierr"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

// batchAnalyzeConcurrency 限制单次批量分析的并发度。
// 设为 5：留出账户轮换空间（AI 后端可能有 3~5 个账户），同时避免共享连接池被打满。
const batchAnalyzeConcurrency = 5

type Handler struct {
	service      *Service
	statRecorder usagestat.Recorder
	vip          *vip.Service // 会员限额(翻译);nil = 不限
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// SetUsageStatRecorder 注入使用统计录入器(矩阵维度修改 / 论文翻译)。允许 nil 禁用。
func (h *Handler) SetUsageStatRecorder(r usagestat.Recorder) {
	h.statRecorder = r
}

// SetVIPChecker 注入会员限额服务(翻译每日次数按等级限)。允许 nil 禁用。
func (h *Handler) SetVIPChecker(v *vip.Service) {
	h.vip = v
}

// VIPCheckerWired 报告配额校验器是否已注入(bootstrap 启动断言付费功能已接线)。
func (h *Handler) VIPCheckerWired() bool { return h.vip != nil }

// 注:单篇 AnalyzePaperRequest/Response + AnalyzePaper handler 已下线 ——
// 新前端只用 /analysis/papers/batch(矩阵多维分析),不调单篇 /analysis/paper。
// 底层 service.AnalyzePaperAbstract 仍在(batch 共用)。

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

	// 会员每日 token 额度闸门(与翻译同款)。论文矩阵分析是并发批量、单请求多次 LLM 调用、
	// 最烧 token 的功能之一,必须在启动并发分析前拦超额用户(真实扣减仍由 AddUsage 后置完成)。
	if h.vip != nil {
		if err := h.vip.CheckDailyQuota(c.Request.Context(), uid); err != nil {
			if errors.Is(err, vip.ErrQuotaExceeded) {
				vip.RespondQuotaExceeded(c, err) // 6010/429 + 结构化 quota 载荷(冻结契约)
				return
			}
		}
	}

	// 获取用户的分析维度（所有论文使用相同的维度配置）
	userIDPtr := &uid
	dimensionResult, err := h.service.GetAnalysisDimensions(userIDPtr)
	if err != nil {
		utils.InternalError(c, 500, "Failed to get dimensions", err)
		return
	}
	if len(dimensionResult.Dimensions) == 0 {
		utils.Error(c, 500, "未配置分析维度,请联系管理员")
		return
	}

	// 批量分析论文 —— 并发处理（固定位索引保证输出顺序与输入一致）。
	// 单篇失败不影响其他论文；所有篇目完成后一次性返回。
	// errgroup 保证 goroutine 在 Wait 前全部退出；每个 goroutine 写入独立下标，无需额外互斥。
	// ctx 带上 LLM 账本归属 (feature=matrix + user): 每篇/每维度的 LLM 调用都过
	// executeWithRetry, 据此各落一行账本。
	results := make([]PaperAnalysisItem, len(req.Papers))
	callCtx := llmusage.WithCall(c.Request.Context(), llmusage.Call{
		Feature: llmusage.FeatureMatrix,
		UserID:  userIDPtr,
	})
	eg, egCtx := errgroup.WithContext(callCtx)
	eg.SetLimit(batchAnalyzeConcurrency)

	for i, paper := range req.Papers {
		i, paper := i, paper
		eg.Go(func() error {
			item := PaperAnalysisItem{PaperID: paper.PaperID}
			result, analysisCtx, err := h.service.AnalyzePaperAbstract(egCtx, paper.PaperID, paper.Title, paper.Abstract, userIDPtr)
			if err != nil {
				// 原始错误(账号池耗尽/熔断/超时等)记日志, 给用户只回友好文案, 不漏内部细节。
				slog.Warn("batch analyze paper failed", "paper_id", paper.PaperID, "err", err)
				item.Success = false
				item.Error = aierr.FriendlyMessage(err)
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
		utils.InternalError(c, 500, "Failed to get dimensions", err)
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

// GetDimensionSettings 获取设置面板用的全量维度列表（含已隐藏）
// GET /api/v1/analysis/dimensions/settings
//
// 与 /dimensions 区别:本接口**包含被隐藏 / 被停用的维度**,供"设置列"
// 面板让用户重新开启;每条多带 isSystem / isCustomized 派生字段。
func (h *Handler) GetDimensionSettings(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	items, err := h.service.GetAllDimensionsForSettings(uid)
	if err != nil {
		utils.InternalError(c, 500, "Failed to load dimension settings", err)
		return
	}

	utils.Success(c, gin.H{
		"dimensions":    items,
		"total":         len(items),
		"maxDimensions": MaxUserDimensions,
	})
}

// SetDimensionVisibilityRequest 设置可见性请求
type SetDimensionVisibilityRequest struct {
	DimensionKey string `json:"dimensionKey" binding:"required"`
	Visible      bool   `json:"visible"`
}

// SetDimensionVisibility 切换某维度对当前用户的可见性
// PATCH /api/v1/analysis/dimensions/visibility
//
// 隐藏系统维度时走 override 模式 —— 后端克隆系统行创建 user_id>0 的副本
// 并把 IsHidden 置 true,**永不修改系统 (user_id=-1) 行**。
func (h *Handler) SetDimensionVisibility(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req SetDimensionVisibilityRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	dim, err := h.service.SetDimensionVisibility(uid, req.DimensionKey, req.Visible)
	if err != nil {
		utils.InternalError(c, 500, "Failed to update visibility", err)
		return
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "visibility", "dimension_key": req.DimensionKey})
	}
	utils.Success(c, dim)
}

// ReorderDimensionsRequest 重排维度顺序请求 —— orderedKeys 是按新顺序排列的
// dimension_key 数组,后端按下标 +1 写 sort_order。
type ReorderDimensionsRequest struct {
	OrderedKeys []string `json:"orderedKeys" binding:"required,min=1,dive,required"`
}

// ReorderDimensions 批量重排当前用户视角下的维度顺序
// PATCH /api/v1/analysis/dimensions/reorder
//
// 三类维度统一走 override 语义:系统维度若用户无 override,本接口会为该用户
// 克隆系统数据生成一条 override 行,以记录新 sort_order。永不修改 user_id=-1 行。
func (h *Handler) ReorderDimensions(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req ReorderDimensionsRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.service.ReorderDimensions(uid, req.OrderedKeys); err != nil {
		utils.InternalError(c, 500, "Failed to reorder dimensions", err)
		return
	}
	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "reorder"})
	}
	utils.Success(c, gin.H{"ok": true})
}

// GetSystemDimensions 获取系统默认分析维度
// GET /api/v1/public/analysis/dimensions/system
func (h *Handler) GetSystemDimensions(c *gin.Context) {
	dimensions, err := h.service.GetSystemDimensions()
	if err != nil {
		utils.InternalError(c, 500, "Failed to get system dimensions", err)
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
		utils.InternalError(c, 500, "Failed to create dimension", err)
		return
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "create", "dimension_key": req.DimensionKey})
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
		utils.InternalError(c, 500, "Failed to update dimension", err)
		return
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "update", "dimension_id": dimensionID})
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
		utils.InternalError(c, 500, "Failed to delete dimension", err)
		return
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "delete", "dimension_id": dimensionID})
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
		utils.Error(c, 400, "请提供分析维度")
		return
	}

	if err := h.service.ResetUserDimensionToDefault(userID, dimensionKey); err != nil {
		utils.InternalError(c, 500, "Failed to reset dimension", err)
		return
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureMatrix, "dimension_edit",
			map[string]any{"op": "reset", "dimension_key": dimensionKey})
	}
	utils.Success(c, gin.H{"message": "Dimension reset to default successfully"})
}


// ========== 管理员接口 ==========

// AdminGetSystemDimensions 管理员获取系统默认分析维度
// GET /api/v1/admin/analysis/dimensions
func (h *Handler) AdminGetSystemDimensions(c *gin.Context) {
	dimensions, err := h.service.GetSystemDimensions()
	if err != nil {
		utils.InternalError(c, 500, "Failed to get system dimensions", err)
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
		utils.InternalError(c, 500, "Failed to update dimension", err)
		return
	}

	utils.Success(c, dimension)
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

	// 翻译已改为强制登录 (见 routes_scholar.go): user 必有, 用于 LLM 账本归属。
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	userIDPtr := &uid

	// 会员每日额度(按 free/pro 等级)。超限在开 SSE 流前回一个 429+6010 的普通 JSON,
	// 前端 streamSsePost 走 !res.ok 分支拿到友好文案(并据 code 6010 引导去会员页)。
	if h.vip != nil {
		if err := h.vip.CheckDailyQuota(c.Request.Context(), uid); err != nil {
			if errors.Is(err, vip.ErrQuotaExceeded) {
				vip.RespondQuotaExceeded(c, err) // 6010/429 + 结构化 quota 载荷(冻结契约)
				return
			}
		}
	}

	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureTranslate, "translate", nil)
	}

	w, stop := sse.BeginStream(c)
	defer stop()

	// ctx 带 LLM 账本归属 (feature=translate + user): 流式 usage 经 include_usage 末尾
	// chunk 解析后由 executeWithRetry 落账本。
	callCtx := llmusage.WithCall(c.Request.Context(), llmusage.Call{
		Feature: llmusage.FeatureTranslate,
		UserID:  userIDPtr,
	})
	err := h.service.StreamTranslatePaperToChinese(callCtx, req.Title, req.Abstract, req.TLDR, w)
	if err != nil {
		// 原始错误记日志, SSE 只回友好文案(之前直接回显 "all N AI retry attempts failed..." 给用户)。
		slog.Warn("translate paper failed", "err", err)
		sse.WriteError(w, aierr.FriendlyMessage(err))
		return
	}

	sse.WriteDone(w)
}

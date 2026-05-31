// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler 热门内容处理器
type Handler struct {
	service *Service
}

// NewHandler 创建处理器
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetHotKeywords 获取热门搜索关键词
func (h *Handler) GetHotKeywords(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	// search_type 过滤: paper / journal,空 = 全部
	searchType := c.Query("search_type")

	result, err := h.service.GetHotKeywords(days, page, pageSize, searchType)
	if err != nil {
		utils.ServerError(c, "获取热门关键词失败")
		return
	}

	utils.Success(c, result)
}

// GetHotPapers 获取热门论文
func (h *Handler) GetHotPapers(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	result, err := h.service.GetHotPapers(days, page, pageSize)
	if err != nil {
		utils.ServerError(c, "获取热门论文失败")
		return
	}

	utils.Success(c, result)
}

// GetStats 获取统计信息
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		utils.ServerError(c, "获取统计信息失败")
		return
	}

	utils.Success(c, stats)
}

// ManualCleanup 手动触发清理
func (h *Handler) ManualCleanup(c *gin.Context) {
	stats, err := h.service.Cleanup()
	if err != nil {
		utils.ServerError(c, "清理失败")
		return
	}

	utils.SuccessWithMessage(c, "清理完成", stats)
}

// GetConfig 取当前清理策略 (admin 后台展示用)
// GET /api/v1/admin/hot-content/config
func (h *Handler) GetConfig(c *gin.Context) {
	cfg, err := h.service.GetConfig()
	if err != nil {
		utils.InternalError(c, 500, "读取热门内容配置失败", err)
		return
	}
	utils.Success(c, cfg)
}

// UpdateConfig 更新清理策略 (admin)
// PUT /api/v1/admin/hot-content/config  body: { retention_days, max_records }
func (h *Handler) UpdateConfig(c *gin.Context) {
	var req HotContentConfigUpdateRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	cfg, err := h.service.UpdateConfig(&req)
	if err != nil {
		utils.InternalError(c, 500, "更新热门内容配置失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已更新", cfg)
}


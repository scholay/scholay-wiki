// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler HTTP处理器
type Handler struct {
	service *Service
}

// NewHandler 创建Handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// Log 记录使用日志
// POST /api/v1/public/usage-log
func (h *Handler) Log(c *gin.Context) {
	var req LogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// 获取用户ID（可能为空）
	var userID *uint
	if id, exists := c.Get("user_id"); exists {
		uid := id.(uint)
		userID = &uid
	}

	// 获取IP地址
	ipAddress := c.ClientIP()

	// 获取User-Agent
	userAgent := c.GetHeader("User-Agent")

	// 记录日志
	if err := h.service.Log(&req, userID, ipAddress, userAgent); err != nil {
		// 日志记录失败不影响用户体验，只记录错误
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "logged"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "logged"})
}

// AdminHandler 管理后台处理器
type AdminHandler struct {
	service *Service
}

// NewAdminHandler 创建管理后台Handler
func NewAdminHandler(service *Service) *AdminHandler {
	return &AdminHandler{service: service}
}

// List 分页查询日志
// GET /api/v1/admin/usage-logs
func (h *AdminHandler) List(c *gin.Context) {
	var query ListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		utils.BadRequest(c, "Invalid query parameters")
		return
	}

	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 {
		query.PageSize = 20
	}

	logs, total, err := h.service.List(&query)
	if err != nil {
		utils.Error(c, 5000, "Failed to query logs: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"logs":      logs,
		"total":     total,
		"page":      query.Page,
		"page_size": query.PageSize,
	})
}

// GetStatsSummary 获取统计摘要
// GET /api/v1/admin/usage-logs/summary
func (h *AdminHandler) GetStatsSummary(c *gin.Context) {
	daysStr := c.DefaultQuery("days", "7")
	days, _ := strconv.Atoi(daysStr)

	summary, err := h.service.GetStatsSummary(days)
	if err != nil {
		utils.Error(c, 5000, "Failed to get summary: "+err.Error())
		return
	}

	utils.Success(c, summary)
}

// GetFilterOptions 获取筛选选项
// GET /api/v1/admin/usage-logs/filter-options
func (h *AdminHandler) GetFilterOptions(c *gin.Context) {
	options, err := h.service.GetFilterOptions()
	if err != nil {
		utils.Error(c, 5000, "Failed to get filter options: "+err.Error())
		return
	}

	utils.Success(c, options)
}

// GetFeatureConfigs 获取功能配置列表
// GET /api/v1/admin/usage-logs/features
func (h *AdminHandler) GetFeatureConfigs(c *gin.Context) {
	configs, err := h.service.GetFeatureConfigs()
	if err != nil {
		utils.Error(c, 5000, "Failed to get feature configs: "+err.Error())
		return
	}

	utils.Success(c, configs)
}


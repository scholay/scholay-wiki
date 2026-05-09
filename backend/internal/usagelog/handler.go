// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"strconv"

	"scholar-backend/internal/admin"
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
	if uid, ok := utils.GetOptionalUserID(c); ok {
		userID = &uid
	}

	// 获取IP地址
	ipAddress := c.ClientIP()

	// 获取User-Agent
	userAgent := c.GetHeader("User-Agent")

	// 记录日志
	if err := h.service.Log(&req, userID, ipAddress, userAgent); err != nil {
		utils.SuccessWithMessage(c, "logged", nil)
		return
	}

	utils.SuccessWithMessage(c, "logged", nil)
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

// ExportCSV 流式导出 CSV
// GET /api/v1/admin/usage-logs/export
//
// 复用 ListQuery 的过滤条件,但忽略 page/page_size,最多导出 EXPORT_LIMIT 条
// 流式 chunked 写入,避免大数据 OOM
func (h *AdminHandler) ExportCSV(c *gin.Context) {
	var query ListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		utils.BadRequest(c, "Invalid query parameters")
		return
	}
	// 强制为最大上限的导出 - 走单次大查询(后续可改成 cursor 分批写)
	query.Page = 1
	query.PageSize = exportLimit

	logs, _, err := h.service.List(&query)
	if err != nil {
		utils.Error(c, 5005, "Failed to query for export: "+err.Error())
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="usage-logs.csv"`)
	// UTF-8 BOM,Excel 才能识别中文
	_, _ = c.Writer.Write([]byte("\xEF\xBB\xBF"))

	writeCSVRow(c, []string{
		"id", "created_at", "feature_code", "feature_name",
		"entry_point", "user_id", "ip_address", "device_type", "browser",
	})
	for _, l := range logs {
		writeCSVRow(c, []string{
			itoa(int64(l.ID)),
			l.CreatedAt.Format("2006-01-02 15:04:05"),
			l.FeatureCode,
			l.FeatureName,
			l.EntryPoint,
			uintptrToStr(l.UserID),
			l.IPAddress,
			l.DeviceType,
			l.Browser,
		})
	}
}

const exportLimit = 50000

func writeCSVRow(c *gin.Context, fields []string) {
	for i, f := range fields {
		if i > 0 {
			_, _ = c.Writer.Write([]byte{','})
		}
		// 标准 CSV 转义
		needsQuote := false
		for _, ch := range f {
			if ch == '"' || ch == ',' || ch == '\n' || ch == '\r' {
				needsQuote = true
				break
			}
		}
		if needsQuote {
			_, _ = c.Writer.Write([]byte{'"'})
			for _, ch := range f {
				if ch == '"' {
					_, _ = c.Writer.Write([]byte{'"', '"'})
				} else {
					_, _ = c.Writer.Write([]byte(string(ch)))
				}
			}
			_, _ = c.Writer.Write([]byte{'"'})
		} else {
			_, _ = c.Writer.Write([]byte(f))
		}
	}
	_, _ = c.Writer.Write([]byte{'\n'})
	c.Writer.Flush()
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func uintptrToStr(p *uint) string {
	if p == nil {
		return ""
	}
	return strconv.FormatUint(uint64(*p), 10)
}

// GetStatsSummary 获取统计摘要
// GET /api/v1/admin/usage-logs/summary
// 支持两种查询方式：
// 1. days 参数：查询最近N天的数据
// 2. start_date 和 end_date 参数：自定义日期范围（格式：YYYY-MM-DD）
// 可选参数：feature_code - 按功能筛选趋势数据
func (h *AdminHandler) GetStatsSummary(c *gin.Context) {
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	featureCode := c.Query("feature_code")

	var summary *StatsSummary
	var err error

	// 如果提供了自定义日期范围
	if startDate != "" && endDate != "" {
		summary, err = h.service.GetStatsSummaryByDateRange(startDate, endDate, featureCode)
	} else {
		// 使用 days 参数
		daysStr := c.DefaultQuery("days", "7")
		days, _ := strconv.Atoi(daysStr)
		summary, err = h.service.GetStatsSummary(days, featureCode)
	}

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

// GetConfig 获取使用统计配置
// GET /api/v1/admin/usage-logs/config
func (h *AdminHandler) GetConfig(c *gin.Context) {
	config, err := h.service.GetConfig()
	if err != nil {
		utils.Error(c, 5000, "Failed to get config: "+err.Error())
		return
	}

	// 获取过期日志数量
	oldLogsCount, _, err := h.service.CountOldLogs()
	if err != nil {
		oldLogsCount = 0
	}

	utils.Success(c, gin.H{
		"config":          config,
		"old_logs_count":  oldLogsCount,
	})
}

// UpdateConfig 更新使用统计配置
// PUT /api/v1/admin/usage-logs/config
func (h *AdminHandler) UpdateConfig(c *gin.Context) {
	var req ConfigUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	config, err := h.service.UpdateConfig(&req)
	if err != nil {
		utils.Error(c, 5000, "Failed to update config: "+err.Error())
		return
	}

	utils.Success(c, config)
}

// TriggerCleanup 手动触发数据清理
// POST /api/v1/admin/usage-logs/cleanup
func (h *AdminHandler) TriggerCleanup(c *gin.Context) {
	deleted, err := h.service.CleanupOldLogs()
	if err != nil {
		utils.Error(c, 5000, "Failed to cleanup: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"deleted_count": deleted,
		"message":       "清理完成",
	})
}

// ClearAllLogs 清空所有日志数据
// DELETE /api/v1/admin/usage-logs/all
func (h *AdminHandler) ClearAllLogs(c *gin.Context) {
	count, err := h.service.ClearAllLogs()
	if err != nil {
		utils.Error(c, 5000, "Failed to clear all logs: "+err.Error())
		return
	}

	admin.LogAdminAction(c, admin.ActionClear, admin.ResUsageLog, "", gin.H{
		"deleted_count": count,
	})

	utils.Success(c, gin.H{
		"deleted_count": count,
		"message":       "所有数据已清空",
	})
}


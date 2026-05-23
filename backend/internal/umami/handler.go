// ============================================================================
// internal/umami HTTP Handler —— 暴露 admin /analytics/* 数据查询接口
//
// 4 个端点对应 admin 页 4 个区域:
//   GET /admin/analytics/overview     总览 (PV/UV/会话/跳出率 同比) + 当前在线
//   GET /admin/analytics/pageviews    时间序列(PV + 会话,按 hour/day/month 桶)
//   GET /admin/analytics/top?type=url|referrer|country|browser|os|device  TOP 列表
//   GET /admin/analytics/active       实时在线访客数(轮询用)
//
// 查询窗口 (start/end) 接收 ISO8601 字符串;省略默认最近 30 天。
// ============================================================================

package umami

import (
	"net/http"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler 包装 Client + 注册 admin 路由
type Handler struct {
	client *Client
}

// NewHandler 构造
func NewHandler(client *Client) *Handler {
	return &Handler{client: client}
}

// parseRange 解析 query 里的 start/end,缺省最近 days 天。
// 容错:格式错就回落到默认窗口,不让前端 400(运维误打也能看到点数据)。
func parseRange(c *gin.Context, defaultDays int) (time.Time, time.Time) {
	loc := time.Local
	endStr := c.Query("end")
	startStr := c.Query("start")

	var end time.Time
	if endStr != "" {
		if t, err := time.ParseInLocation(time.RFC3339, endStr, loc); err == nil {
			end = t
		}
	}
	if end.IsZero() {
		end = time.Now()
	}

	var start time.Time
	if startStr != "" {
		if t, err := time.ParseInLocation(time.RFC3339, startStr, loc); err == nil {
			start = t
		}
	}
	if start.IsZero() {
		start = end.AddDate(0, 0, -defaultDays)
	}
	if !start.Before(end) {
		start = end.AddDate(0, 0, -defaultDays)
	}
	return start, end
}

// notConfigured 给前端一个明确的"还没接好"信号 —— 503 比 500 友好,前端可以
// 直接显示"请管理员在 .env 配 UMAMI_WEBSITE_ID 后重启 backend"
func (h *Handler) notConfigured(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"code":    503,
		"message": "umami WEBSITE_ID not configured; analytics disabled",
	})
}

// GetOverview —— 概览卡片用
func (h *Handler) GetOverview(c *gin.Context) {
	if !h.client.Configured() {
		h.notConfigured(c)
		return
	}
	start, end := parseRange(c, 30)
	stats, err := h.client.Stats(c.Request.Context(), start, end)
	if err != nil {
		utils.InternalError(c, 6001, "umami stats failed", err)
		return
	}
	active, err := h.client.Active(c.Request.Context())
	if err != nil {
		// active 失败不影响主体数据,降级返 0
		active = &ActiveVisitors{Visitors: 0}
	}
	utils.Success(c, gin.H{
		"stats":  stats,
		"active": active,
		"start":  start.Format(time.RFC3339),
		"end":    end.Format(time.RFC3339),
	})
}

// GetPageviews —— 折线图用
func (h *Handler) GetPageviews(c *gin.Context) {
	if !h.client.Configured() {
		h.notConfigured(c)
		return
	}
	start, end := parseRange(c, 30)
	unit := c.DefaultQuery("unit", "day")
	series, err := h.client.Pageviews(c.Request.Context(), start, end, unit)
	if err != nil {
		utils.InternalError(c, 6002, "umami pageviews failed", err)
		return
	}
	utils.Success(c, gin.H{
		"series": series,
		"unit":   unit,
		"start":  start.Format(time.RFC3339),
		"end":    end.Format(time.RFC3339),
	})
}

// GetTop —— TOP 列表(url/referrer/country/browser/os/device)
func (h *Handler) GetTop(c *gin.Context) {
	if !h.client.Configured() {
		h.notConfigured(c)
		return
	}
	mtype := c.DefaultQuery("type", "url")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	start, end := parseRange(c, 30)
	rows, err := h.client.Metrics(c.Request.Context(), start, end, mtype, limit)
	if err != nil {
		utils.InternalError(c, 6003, "umami metrics failed", err)
		return
	}
	utils.Success(c, gin.H{
		"type":  mtype,
		"items": rows,
		"start": start.Format(time.RFC3339),
		"end":   end.Format(time.RFC3339),
	})
}

// GetActive —— 实时在线(前端可以 30s 轮询一次)
func (h *Handler) GetActive(c *gin.Context) {
	if !h.client.Configured() {
		h.notConfigured(c)
		return
	}
	active, err := h.client.Active(c.Request.Context())
	if err != nil {
		utils.InternalError(c, 6004, "umami active failed", err)
		return
	}
	utils.Success(c, active)
}

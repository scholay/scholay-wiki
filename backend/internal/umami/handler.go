// ============================================================================
// internal/umami HTTP Handler
//
// admin /analytics 的 4 个接口:
//   GET /admin/analytics/overview     总览 (PV/UV/会话/跳出率 同比) + 当前在线
//   GET /admin/analytics/pageviews    时间序列(PV + 会话,按 hour/day/month 桶)
//   GET /admin/analytics/top?type=url|referrer|country|browser|os|device  TOP 列表
//   GET /admin/analytics/active       实时在线访客数(轮询用)
//
// 一个公开接口给前端 tracker 用:
//   GET /api/v1/public/umami-config   返 {websiteId, scriptUrl}
//   前端 index.html 加载时 fetch 这个端点拿到 website id,再动态插入 tracker 脚本。
//   这样换 umami 数据库 / 换 site domain 后只要 backend 重启就行,前端不用 rebuild。
//
// 查询窗口 (start/end) 接收 ISO8601 字符串;省略默认最近 30 天。
// ============================================================================

package umami

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler 包装 Client + 注册路由
type Handler struct {
	client *Client

	// ── 爬虫监控(internal/crawlerwatch 写入的独立 website)──
	// crawler nil = UMAMI_CRAWLER_WEBSITE_ID 未配置,GetCrawlerStats 返 {configured:false}。
	// crawlerDB 用于 top_pages 直查 umami 库(HTTP API 对自定义事件做不了 URL 聚合,
	// 见 crawler.go 头注);nil = top_pages 降级为空列表。
	crawler   *Client
	crawlerDB *gorm.DB
}

// NewHandler 构造
func NewHandler(client *Client) *Handler {
	return &Handler{client: client}
}

// WithCrawler 挂上爬虫监控查询依赖(链式,bootstrap 用)。两个参数都允许 nil。
func (h *Handler) WithCrawler(crawler *Client, db *gorm.DB) *Handler {
	h.crawler = crawler
	h.crawlerDB = db
	return h
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

// GetTrackerConfig (公开) —— 给前端 tracker runtime 加载用
//
// 返回:
//   - website_id: 当前 umami website 的 UUID (env 配过的优先,否则 auto-bootstrap 拿到)
//   - script_url: tracker JS 的路径 (永远是同源的 /umami-embed/script.js)
//
// 拿不到 ID 时 (umami 暂时不可达 / 创建失败) 返 503,前端会跳过 tracker 加载,
// 不影响主站功能。
func (h *Handler) GetTrackerConfig(c *gin.Context) {
	id, err := h.client.EnsureWebsiteID(c.Request.Context())
	if err != nil {
		// 不回显原始 err —— 它含内部容器主机名(http://umami:3000/...)与上游响应体,
		// 而本端点匿名可达、每页加载都打。原始错误进日志即可,前端只需知道暂不可用。
		slog.Warn("umami tracker config unavailable", "err", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": "umami 统计暂不可用",
		})
		return
	}
	// 强 Cache-Control:浏览器最多 5 分钟内复用,umami 重建 / id 变了几分钟内自愈
	c.Header("Cache-Control", "public, max-age=300")
	utils.Success(c, gin.H{
		"website_id": id,
		"script_url": "/umami-embed/script.js",
	})
}

// GetOverview —— 概览卡片用
func (h *Handler) GetOverview(c *gin.Context) {
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
	active, err := h.client.Active(c.Request.Context())
	if err != nil {
		utils.InternalError(c, 6004, "umami active failed", err)
		return
	}
	utils.Success(c, active)
}

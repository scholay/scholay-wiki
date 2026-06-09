// ============================================================================
// usagestat HTTP handler —— admin 读 (统计展示) + public 上报 (前端事件)。
// ============================================================================

package usagestat

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler 使用统计处理器
type Handler struct {
	service *Service
}

// NewHandler 创建处理器
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ============================ public 上报端点 ============================
//
// 暂存 / 收藏 是纯前端事件 (暂存可匿名本地操作, 后端看不到), 由前端 fetch(keepalive)
// 上报。带 token 时经 OptionalUserAuth 中间件拿到 user_id, 否则按匿名 (anon_id) 记。

type trackEvent struct {
	Feature string         `json:"feature"`
	Action  string         `json:"action"`
	Source  string         `json:"source"`
	Extra   map[string]any `json:"extra"`
}

// TrackRequest 前端上报体 (一次可批量)
type TrackRequest struct {
	AnonID string       `json:"anon_id"`
	Events []trackEvent `json:"events"`
}

// publicAllowed 公开端点白名单 —— 只允许前端事件类功能, 杜绝客户端伪造任意 feature。
var publicAllowed = map[string]bool{
	FeatureStaging + "|stage":     true,
	FeatureFavorite + "|favorite":  true,
}

const trackEventCap = 50

// Track 接收前端事件上报。fire-and-forget: 无论好坏都 204, 落库异步。
func (h *Handler) Track(c *gin.Context) {
	var req TrackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	if len(req.Events) > trackEventCap {
		req.Events = req.Events[:trackEventCap]
	}
	base := FromGin(c) // user_id(若 OptionalUserAuth 注入)/ip/ua
	base.AnonID = req.AnonID
	for _, ev := range req.Events {
		if !publicAllowed[ev.Feature+"|"+ev.Action] {
			continue // 非白名单事件直接丢弃
		}
		e := base
		e.Feature = ev.Feature
		e.Action = ev.Action
		e.Source = ev.Source
		e.Extra = ev.Extra
		h.service.Record(e)
	}
	c.Status(http.StatusNoContent)
}

// ============================ admin 读取端点 ============================

// GetSummary GET /admin/usage-stats/summary?days= 或 ?start_date=&end_date=
func (h *Handler) GetSummary(c *gin.Context) {
	from, to := utils.ParseDateWindow(c, 30)
	res, err := h.service.GetSummary(from, to)
	if err != nil {
		utils.ServerError(c, "获取使用统计失败")
		return
	}
	utils.Success(c, res)
}

// GetFunnel GET /admin/usage-stats/peer-review-funnel?days= 或 ?start_date=&end_date=
func (h *Handler) GetFunnel(c *gin.Context) {
	from, to := utils.ParseDateWindow(c, 30)
	res, err := h.service.GetPeerReviewFunnel(from, to)
	if err != nil {
		utils.ServerError(c, "获取审稿漏斗失败")
		return
	}
	utils.Success(c, gin.H{"stages": res})
}

// ListEvents GET /admin/usage-stats/events?days=|start_date=&end_date=&feature=&action=&correlation_id=&page=&page_size=
func (h *Handler) ListEvents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	from, to := utils.ParseDateWindow(c, 30)
	f := ListFilter{
		From:          from,
		To:            to,
		Feature:       c.Query("feature"),
		Action:        c.Query("action"),
		CorrelationID: c.Query("correlation_id"),
	}
	if uidStr := c.Query("user_id"); uidStr != "" {
		if uid, err := strconv.ParseUint(uidStr, 10, 64); err == nil {
			u := uint(uid)
			f.UserID = &u
		}
	}
	items, total, err := h.service.GetEvents(f, page, pageSize)
	if err != nil {
		utils.ServerError(c, "获取事件列表失败")
		return
	}
	utils.Success(c, gin.H{"events": items, "total": total})
}

// TriggerCleanup POST /admin/usage-stats/cleanup
func (h *Handler) TriggerCleanup(c *gin.Context) {
	n, err := h.service.Cleanup()
	if err != nil {
		utils.ServerError(c, "清理失败")
		return
	}
	utils.SuccessWithMessage(c, "清理完成", gin.H{"deleted": n})
}

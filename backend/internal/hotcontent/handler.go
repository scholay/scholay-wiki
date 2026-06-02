// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/safego"
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

// ============================ 公开上报端点 ============================
//
// 部分热度维度后端服务端看不到, 必须前端主动上报 (fire-and-forget, sendBeacon):
//   - 曝光 impressions: 智能搜索结果集 (走 agent 容器, 后端搜索接口看不到; 传统搜索仍服务端记)
//   - 点击 clicks:      站内从结果点开详情 (详情数据来自前端缓存, 不打 GET /papers/:id)
//   - SEO 直访 seo_views: 论文页作为站外落地入口被打开
// 三类共用一个端点, 一次可批量提交。

// TrackRequest 前端热度上报体。三类事件可同批, 也可单类单独发。
type TrackRequest struct {
	Impressions []PaperViewData `json:"impressions,omitempty"`
	Clicks      []PaperViewData `json:"clicks,omitempty"`
	SeoViews    []PaperViewData `json:"seo_views,omitempty"`
}

// trackPaperCap 单类单次上报条数上限 —— 防滥用 / 防 sendBeacon 体积失控。
const trackPaperCap = 100

func capTrackPapers(p []PaperViewData) []PaperViewData {
	if len(p) > trackPaperCap {
		return p[:trackPaperCap]
	}
	return p
}

// Track 接收前端热度上报 (曝光 / 点击 / SEO 直访)。
// fire-and-forget: 无论入参好坏都立即 204 (统计噪音不暴露给前端), 落库在 safego goroutine 里做。
func (h *Handler) Track(c *gin.Context) {
	var req TrackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	impressions := capTrackPapers(req.Impressions)
	clicks := capTrackPapers(req.Clicks)
	seoViews := capTrackPapers(req.SeoViews)
	if len(impressions) == 0 && len(clicks) == 0 && len(seoViews) == 0 {
		c.Status(http.StatusNoContent)
		return
	}
	svc := h.service
	safego.Go("hotcontent-track", func() {
		if len(impressions) > 0 {
			_ = svc.RecordImpressions(impressions)
		}
		for i := range clicks {
			_ = svc.RecordClick(&clicks[i])
		}
		for i := range seoViews {
			_ = svc.RecordSeoView(&seoViews[i])
		}
	})
	c.Status(http.StatusNoContent)
}

// ============================ 后台读取端点 (admin) ============================

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


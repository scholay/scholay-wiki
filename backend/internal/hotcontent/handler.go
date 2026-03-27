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

	result, err := h.service.GetHotKeywords(days, page, pageSize)
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

// ========== 公开接口（无需认证） ==========

// GetRecentKeywords 获取最近搜索关键词（公开接口）
func (h *Handler) GetRecentKeywords(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	if limit > 50 {
		limit = 50
	}
	if limit < 1 {
		limit = 10
	}

	result, err := h.service.GetHotKeywords(30, 1, limit)
	if err != nil {
		utils.ServerError(c, "获取搜索关键词失败")
		return
	}

	keywords := make([]map[string]any, 0, len(result.Items))
	for _, item := range result.Items {
		keywords = append(keywords, map[string]any{
			"keyword":      item.Keyword,
			"search_count": item.SearchCount,
		})
	}

	utils.Success(c, gin.H{
		"items": keywords,
		"total": result.Total,
	})
}

// GetRecentPapers 获取最近搜索的论文（公开接口）
func (h *Handler) GetRecentPapers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	if limit > 50 {
		limit = 50
	}
	if limit < 1 {
		limit = 10
	}

	result, err := h.service.GetHotPapers(30, 1, limit)
	if err != nil {
		utils.ServerError(c, "获取热门论文失败")
		return
	}

	papers := make([]map[string]any, 0, len(result.Items))
	for _, item := range result.Items {
		paper := map[string]any{
			"paper_id":   item.PaperID,
			"view_count": item.ViewCount,
		}
		if item.Title != nil && *item.Title != "" {
			paper["title"] = *item.Title
		}
		if item.Abstract != nil && *item.Abstract != "" {
			paper["abstract"] = *item.Abstract
		}
		if item.DOI != nil && *item.DOI != "" {
			paper["doi"] = *item.DOI
		}
		if item.Year != nil && *item.Year > 0 {
			paper["year"] = *item.Year
		}
		if item.Authors != nil && *item.Authors != "" {
			paper["authors"] = *item.Authors
		}
		if item.Venue != nil && *item.Venue != "" {
			paper["venue"] = *item.Venue
		}
		papers = append(papers, paper)
	}

	utils.Success(c, gin.H{
		"items": papers,
		"total": result.Total,
	})
}

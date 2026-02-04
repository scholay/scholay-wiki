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
// @Summary 获取热门搜索关键词
// @Description 获取按搜索次数排序的热门关键词列表
// @Tags Admin-HotContent
// @Accept json
// @Produce json
// @Param days query int false "查询最近N天的数据" default(30)
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Success 200 {object} HotKeywordsResponse
// @Router /api/v1/admin/hot-content/keywords [get]
func (h *Handler) GetHotKeywords(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	
	result, err := h.service.GetHotKeywords(days, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取热门关键词失败",
			"error":   err.Error(),
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data":    result,
	})
}

// GetHotPapers 获取热门论文
// @Summary 获取热门论文
// @Description 获取按查看次数排序的热门论文列表
// @Tags Admin-HotContent
// @Accept json
// @Produce json
// @Param days query int false "查询最近N天的数据" default(30)
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Success 200 {object} HotPapersResponse
// @Router /api/v1/admin/hot-content/papers [get]
func (h *Handler) GetHotPapers(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	
	result, err := h.service.GetHotPapers(days, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取热门论文失败",
			"error":   err.Error(),
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data":    result,
	})
}

// GetStats 获取统计信息
// @Summary 获取热门内容统计
// @Description 获取热门内容的统计信息
// @Tags Admin-HotContent
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/admin/hot-content/stats [get]
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取统计信息失败",
			"error":   err.Error(),
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data":    stats,
	})
}

// ManualCleanup 手动触发清理
// @Summary 手动触发清理
// @Description 手动触发过期数据清理
// @Tags Admin-HotContent
// @Accept json
// @Produce json
// @Success 200 {object} CleanupStats
// @Router /api/v1/admin/hot-content/cleanup [post]
func (h *Handler) ManualCleanup(c *gin.Context) {
	stats, err := h.service.Cleanup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "清理失败",
			"error":   err.Error(),
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "清理完成",
		"data":    stats,
	})
}

// ========== Public APIs (No Authentication Required) ==========

// GetRecentKeywords 获取最近搜索关键词（公开接口）
// @Summary 获取最近搜索关键词
// @Description 获取最近的热门搜索关键词列表，无需认证
// @Tags Public-HotContent
// @Accept json
// @Produce json
// @Param limit query int false "返回数量" default(10)
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/public/hot-content/keywords [get]
func (h *Handler) GetRecentKeywords(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	
	// 限制最大返回数量
	if limit > 50 {
		limit = 50
	}
	if limit < 1 {
		limit = 10
	}
	
	result, err := h.service.GetHotKeywords(30, 1, limit) // 最近30天
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取搜索关键词失败",
		})
		return
	}
	
	// 简化返回数据，只返回关键词列表
	keywords := make([]map[string]interface{}, 0, len(result.Items))
	for _, item := range result.Items {
		keywords = append(keywords, map[string]interface{}{
			"keyword":      item.Keyword,
			"search_count": item.SearchCount,
		})
	}
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"items": keywords,
			"total": result.Total,
		},
	})
}

// GetRecentPapers 获取最近搜索的论文（公开接口）
// @Summary 获取最近搜索的论文
// @Description 获取最近被搜索/查看的热门论文列表，无需认证
// @Tags Public-HotContent
// @Accept json
// @Produce json
// @Param limit query int false "返回数量" default(10)
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/public/hot-content/papers [get]
func (h *Handler) GetRecentPapers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	
	// 限制最大返回数量
	if limit > 50 {
		limit = 50
	}
	if limit < 1 {
		limit = 10
	}
	
	result, err := h.service.GetHotPapers(30, 1, limit) // 最近30天
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取热门论文失败",
		})
		return
	}
	
	// 简化返回数据
	papers := make([]map[string]interface{}, 0, len(result.Items))
	for _, item := range result.Items {
		paper := map[string]interface{}{
			"paper_id":   item.PaperID,
			"view_count": item.ViewCount,
		}
		// 处理指针字段
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
	
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"items": papers,
			"total": result.Total,
		},
	})
}

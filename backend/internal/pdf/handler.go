// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package pdf

import (
	"log/slog"
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler PDF HTTP 处理器
type Handler struct {
	service *Service
}

// NewHandler 创建 PDF Handler
func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// GetPDF 处理 PDF 获取请求
// POST /api/v1/pdf
// Request Body:
//
//	{
//	  "doi": "10.1038/nature12373",  // 必填
//	  "pdf_url": "https://..."       // 可选：已知的 PDF URL
//	}
//
// Response:
//   - 成功：返回 PDF 二进制流（Content-Type: application/pdf）
//   - 响应头：
//     X-PDF-Source: 数据来源（pmc/scihub/unpaywall 等）
//     X-Cache: HIT/MISS（是否命中缓存）
func (h *Handler) GetPDF(c *gin.Context) {
	var req PDFRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		slog.Warn("invalid PDF request", "err", err)
		utils.BadRequest(c, "无效的请求参数")
		return
	}

	slog.Info("PDF request received", "doi", req.DOI, "pdf_url", req.PDFURL)

	// 获取 PDF
	result, err := h.service.GetPDF(c.Request.Context(), &req)
	if err != nil {
		slog.Error("failed to get PDF", "err", err)
		utils.NotFound(c, "PDF not found")
		return
	}

	// 设置响应头
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline")
	c.Header("X-PDF-Source", string(result.Source))
	c.Header("X-Cache", string(result.CacheStatus))
	c.Header("Content-Length", strconv.FormatInt(result.Size, 10))
	
	// 允许跨域访问这些自定义响应头
	c.Header("Access-Control-Expose-Headers", "X-PDF-Source, X-Cache")

	slog.Info("PDF served successfully", "doi", req.DOI, "source", result.Source, "cache", result.CacheStatus, "size", result.Size)

	// 写入 PDF 数据
	c.Data(http.StatusOK, "application/pdf", result.Data)
}

// GetCacheStats 获取缓存统计（管理接口）
// GET /api/v1/admin/pdf/cache/stats
func (h *Handler) GetCacheStats(c *gin.Context) {
	stats := h.service.cache.Stats()
	utils.Success(c, stats)
}

// RegisterRoutes 注册路由
func (h *Handler) RegisterRoutes(api *gin.RouterGroup, userAuthMiddleware gin.HandlerFunc) {
	// 公开接口 - PDF 获取（需要用户认证以防止滥用）
	// 考虑到前端 PDFViewer 可能在未登录状态也需要预览，这里暂时不要求认证
	// 但建议生产环境增加认证或频率限制
	api.POST("/pdf", h.GetPDF)
}

// RegisterAdminRoutes 注册管理路由
func (h *Handler) RegisterAdminRoutes(adminGroup *gin.RouterGroup) {
	// 管理接口
	adminGroup.GET("/pdf/cache/stats", h.GetCacheStats)
}

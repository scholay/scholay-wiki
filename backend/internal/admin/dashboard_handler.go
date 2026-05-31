// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"net/http"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard statistics requests.
//
// 在线 / 访客 / DAU 类指标已经从这里移除 —— 迁移到 umami (前端 admin 通过 iframe 嵌入)。
// 这里只保留与「业务库表」直接相关的汇总:用户/订单/收入/对话/优惠券/系统配置。
//
// 查询逻辑都在 dashboardService —— handler 只做 HTTP 翻译, 不直连 DB。
type DashboardHandler struct {
	svc *dashboardService
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{svc: newDashboardService(db)}
}

// GetDashboardStatistics handles GET /api/v1/admin/dashboard/statistics
func (h *DashboardHandler) GetDashboardStatistics(c *gin.Context) {
	stats := h.svc.GetStatistics()
	utils.SuccessResponse(c, http.StatusOK, "Dashboard statistics retrieved successfully", stats)
}

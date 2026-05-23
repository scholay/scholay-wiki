// ============================================================================
// Scholay学术 V1.0
// Handler - 管理员专用（用户列表、统计、删除）
// ============================================================================

package user

import (
	"strconv"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// GetUserStatistics handles getting user statistics (admin only)
func (h *Handler) GetUserStatistics(c *gin.Context) {
	stats, err := h.service.GetUserStatistics()
	if err != nil {
		utils.Error(c, 2007, "Failed to get user statistics")
		return
	}

	utils.Success(c, stats)
}

// GetUserMetrics handles GET /api/v1/admin/users/metrics
// 一次返回注册量折线 + 渠道分布 + 24h 活跃 + MAU 趋势四张图的数据
func (h *Handler) GetUserMetrics(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	granularity := c.DefaultQuery("granularity", "day")
	metrics, err := h.service.GetUserMetrics(days, granularity)
	if err != nil {
		utils.InternalError(c, 2012, "Failed to get user metrics", err)
		return
	}
	utils.Success(c, metrics)
}

// GetUserList handles getting paginated user list (admin only)
// 服务端搜索 / 筛选 / 排序版本（v2 admin 后台使用）：
//   q          关键词，LIKE 匹配 username/email/phone（最长 100）
//   status     用户状态精确匹配（0/1/-1），缺省不过滤
//   role       角色精确匹配（user/admin/super_admin），缺省排除管理员
//   sort_by    last_login_at | created_at
//   sort_order asc | desc
func (h *Handler) GetUserList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	sortBy := c.DefaultQuery("sort_by", "last_login_at")
	sortOrder := c.DefaultQuery("sort_order", "desc")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	validSortFields := map[string]bool{"last_login_at": true, "created_at": true}
	if !validSortFields[sortBy] {
		sortBy = "last_login_at"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	filter := UserListFilter{
		Q:         c.Query("q"),
		Role:      c.Query("role"),
		SortBy:    sortBy,
		SortOrder: sortOrder,
	}
	if statusStr := c.Query("status"); statusStr != "" {
		if v, err := strconv.Atoi(statusStr); err == nil {
			s := int8(v)
			filter.Status = &s
		}
	}

	users, total, err := h.service.GetUserListWithFilter(page, pageSize, filter)
	if err != nil {
		utils.Error(c, 2008, "Failed to get user list")
		return
	}

	utils.Success(c, gin.H{
		"users":     users,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetUserDetail handles getting detailed user information (admin only)
func (h *Handler) GetUserDetail(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	detail, err := h.service.GetUserDetail(uid)
	if err != nil {
		utils.InternalError(c, 2030, "Failed to get user detail", err)
		return
	}

	utils.Success(c, detail)
}

// GetUserAggregate handles GET /api/v1/admin/users/:id/aggregate
// 一次返回:基础详情 + 最近 10 个订单 + 最近 10 条反馈。
// 替代前端为打开 Detail Drawer 多次拼接的 N 个独立请求。
func (h *Handler) GetUserAggregate(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	agg, err := h.service.GetUserAggregate(uid)
	if err != nil {
		utils.InternalError(c, 2031, "Failed to get user aggregate", err)
		return
	}
	utils.Success(c, agg)
}

// DeleteUser handles deleting a user account (admin only)
// This endpoint removes the user and all associated data except statistics
func (h *Handler) DeleteUser(c *gin.Context) {
	// Get user ID from URL parameter
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	// Call service to delete the user
	if err := h.service.DeleteUser(uid); err != nil {
		utils.Error(c, 3001, err.Error())
		return
	}

	admin.LogAdminAction(c, admin.ActionDelete, admin.ResUser,
		strconv.FormatUint(uint64(uid), 10), nil)

	utils.SuccessWithMessage(c, "User deleted successfully", nil)
}

// BatchDeleteUsersRequest 批量删除请求体
type BatchDeleteUsersRequest struct {
	IDs []uint `json:"ids" binding:"required,min=1,max=200"`
}

// BatchDeleteUsersResponse 部分成功也返回 200，前端按 failed 数组提示。
type BatchDeleteUsersResponse struct {
	SuccessCount int                   `json:"success_count"`
	FailedCount  int                   `json:"failed_count"`
	Failed       []BatchDeleteFailItem `json:"failed,omitempty"`
}

type BatchDeleteFailItem struct {
	ID     uint   `json:"id"`
	Reason string `json:"reason"`
}

// BatchDeleteUsers handles bulk deletion of user accounts (admin only).
// 行为：
//   - service.DeleteUser 内部已禁止删除 admin/super_admin，无需再次校验
//   - 单个失败不阻断整体；返回逐个 id 的失败原因
//   - 上限 200 防滥用
func (h *Handler) BatchDeleteUsers(c *gin.Context) {
	var req BatchDeleteUsersRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	resp := BatchDeleteUsersResponse{}
	for _, id := range req.IDs {
		if err := h.service.DeleteUser(id); err != nil {
			resp.FailedCount++
			resp.Failed = append(resp.Failed, BatchDeleteFailItem{
				ID:     id,
				Reason: err.Error(),
			})
			continue
		}
		resp.SuccessCount++
	}

	admin.LogAdminAction(c, admin.ActionBatchDelete, admin.ResUser, "", gin.H{
		"requested":     len(req.IDs),
		"success_count": resp.SuccessCount,
		"failed_count":  resp.FailedCount,
		"ids":           req.IDs,
	})

	utils.Success(c, resp)
}

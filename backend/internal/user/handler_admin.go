// ============================================================================
// Scholay学术 V1.0
// Handler - 管理员专用（用户列表、统计、图表、删除）
// ============================================================================

package user

import (
	"strconv"
	"time"

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
	if tagStr := c.Query("tag_id"); tagStr != "" {
		if v, err := strconv.ParseUint(tagStr, 10, 64); err == nil {
			filter.TagID = uint(v)
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

// GetOnlineUsers handles getting currently online users (admin only)
// 基于 WebSocket 连接状态返回在线统计
func (h *Handler) GetOnlineUsers(c *gin.Context) {
	if h.onlineStatsProvider != nil {
		// 使用 WebSocket 连接状态
		onlineUsers := h.onlineStatsProvider.GetOnlineUserCount()
		onlineGuests := h.onlineStatsProvider.GetOnlineGuestCount()

		utils.Success(c, gin.H{
			"online_users":  onlineUsers,
			"online_guests": onlineGuests,
			"total_online":  onlineUsers + onlineGuests,
		})
		return
	}

	// 回退到旧逻辑（数据库查询）
	users, err := h.service.GetOnlineUsers()
	if err != nil {
		utils.Error(c, 2009, "Failed to get online users")
		return
	}

	utils.Success(c, gin.H{
		"online_users": len(users),
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
// 一次返回:基础详情 + 最近 10 个订单 + 最近 10 条反馈 + 最近 10 个会话。
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

// GetUserStatisticsChart handles getting user statistics chart data (admin only)
// 支持自定义时间范围和时间粒度
// Query params:
//   - start_time: 开始时间 (格式: 2006-01-02 15:04:05)
//   - end_time: 结束时间 (格式: 2006-01-02 15:04:05)
//   - granularity: 时间粒度 (hour, day, week, month)
func (h *Handler) GetUserStatisticsChart(c *gin.Context) {
	// 解析时间范围参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	granularity := c.Query("granularity")

	// 默认值：最近30天，按天统计
	if granularity == "" {
		granularity = "day"
	}

	// 验证粒度参数
	validGranularities := map[string]bool{"hour": true, "day": true, "week": true, "month": true}
	if !validGranularities[granularity] {
		utils.Error(c, 2012, "Invalid granularity, must be one of: hour, day, week, month")
		return
	}

	var startTime, endTime time.Time
	var err error
	loc := time.Local

	if startTimeStr != "" {
		startTime, err = time.ParseInLocation("2006-01-02 15:04:05", startTimeStr, loc)
		if err != nil {
			utils.Error(c, 2012, "Invalid start_time format, expected: 2006-01-02 15:04:05")
			return
		}
	} else {
		// 默认开始时间：30天前
		startTime = time.Now().AddDate(0, 0, -29)
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, loc)
	}

	if endTimeStr != "" {
		endTime, err = time.ParseInLocation("2006-01-02 15:04:05", endTimeStr, loc)
		if err != nil {
			utils.Error(c, 2012, "Invalid end_time format, expected: 2006-01-02 15:04:05")
			return
		}
	} else {
		// 默认结束时间：当前时间
		endTime = time.Now()
	}

	// 验证时间范围
	if endTime.Before(startTime) {
		utils.Error(c, 2012, "end_time must be after start_time")
		return
	}

	data, err := h.service.GetUserStatisticsChartWithGranularity(startTime, endTime, granularity)
	if err != nil {
		utils.InternalError(c, 2012, "Failed to get user statistics", err)
		return
	}

	utils.Success(c, map[string]any{
		"statistics":  data,
		"start_time":  startTime.Format("2006-01-02 15:04:05"),
		"end_time":    endTime.Format("2006-01-02 15:04:05"),
		"granularity": granularity,
	})
}

// GetOnlineUserChart handles getting online user chart data (admin only)
// 支持自定义时间范围和时间粒度
// Query params:
//   - start_time: 开始时间 (格式: 2006-01-02 15:04:05)
//   - end_time: 结束时间 (格式: 2006-01-02 15:04:05)
//   - granularity: 时间粒度 (5min, hour)
//   - hours: 兼容旧接口，查询最近N小时的数据
func (h *Handler) GetOnlineUserChart(c *gin.Context) {
	// 解析时间范围参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	granularity := c.Query("granularity")

	// 默认值
	if granularity == "" {
		granularity = "5min"
	}

	// 验证粒度参数
	validGranularities := map[string]bool{"5min": true, "hour": true}
	if !validGranularities[granularity] {
		utils.Error(c, 2013, "Invalid granularity, must be one of: 5min, hour")
		return
	}

	var startTime, endTime time.Time
	var err error
	loc := time.Local

	// 兼容旧接口：如果没有提供 start_time/end_time，使用 hours 参数
	if startTimeStr == "" && endTimeStr == "" {
		hours := 24
		if hoursParam := c.Query("hours"); hoursParam != "" {
			if parsedHours, err := strconv.Atoi(hoursParam); err == nil && parsedHours > 0 {
				hours = parsedHours
			}
		}
		endTime = time.Now()
		startTime = endTime.Add(-time.Duration(hours) * time.Hour)
	} else {
		if startTimeStr != "" {
			startTime, err = time.ParseInLocation("2006-01-02 15:04:05", startTimeStr, loc)
			if err != nil {
				utils.Error(c, 2013, "Invalid start_time format, expected: 2006-01-02 15:04:05")
				return
			}
		} else {
			startTime = time.Now().Add(-24 * time.Hour)
		}

		if endTimeStr != "" {
			endTime, err = time.ParseInLocation("2006-01-02 15:04:05", endTimeStr, loc)
			if err != nil {
				utils.Error(c, 2013, "Invalid end_time format, expected: 2006-01-02 15:04:05")
				return
			}
		} else {
			endTime = time.Now()
		}
	}

	// 验证时间范围
	if endTime.Before(startTime) {
		utils.Error(c, 2013, "end_time must be after start_time")
		return
	}

	data, err := h.service.GetOnlineUserChartDataWithGranularity(startTime, endTime, granularity)
	if err != nil {
		utils.InternalError(c, 2013, "Failed to get online user chart data", err)
		return
	}

	utils.Success(c, map[string]any{
		"snapshots":   data,
		"start_time":  startTime.Format("2006-01-02 15:04:05"),
		"end_time":    endTime.Format("2006-01-02 15:04:05"),
		"granularity": granularity,
	})
}

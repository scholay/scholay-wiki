// ============================================================================
// Scholay学术 V1.0
// Handler - 管理员专用（用户列表、统计、删除）
// ============================================================================

package user

import (
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// GetUserDetail 用户详情(admin):返回该用户的登录方式(账号/第三方绑定)。基础资料已在列表行,
// VIP 今日额度走 /admin/users/:id/vip(vip handler)。供用户管理的「详情抽屉」用。
func (h *Handler) GetUserDetail(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	u, err := h.service.FindByID(uint(id))
	if err != nil || u == nil {
		utils.Error(c, 2008, "获取用户详情失败")
		return
	}
	providers, _ := h.service.GetUserAuthProviders(uint(id))
	// 精简视图:只回登录方式 + 绑定时间, 不泄露 openID/union/provider_data 等敏感原始数据。
	type providerView struct {
		Provider  string    `json:"provider"`
		CreatedAt time.Time `json:"created_at"`
	}
	views := make([]providerView, 0, len(providers))
	for _, p := range providers {
		views = append(views, providerView{Provider: p.Provider, CreatedAt: p.CreatedAt})
	}
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	// 身份 + 登录方式(供 admin「用户单元」展开:邮箱/手机号 + 验证态 + OAuth 绑定)。
	utils.Success(c, gin.H{
		"id":             u.ID,
		"username":       deref(u.Username),
		"email":          deref(u.Email),
		"email_verified": u.EmailVerified,
		"phone":          deref(u.Phone),
		"phone_verified": u.PhoneVerified,
		"auth_providers": views,
	})
}

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
//   q              关键词，LIKE 匹配 username/email/phone（最长 100）
//   status         用户状态精确匹配（1=正常 / 2=冻结），缺省不过滤
//   role           角色精确匹配（user/admin/super_admin），缺省=显示全部(含管理员)
//   tier           会员等级 effective 过滤（pro=未过期的 pro / free=其余），缺省不过滤
//   email_verified 邮箱验证状态（1/0），缺省不过滤
//   created_from / created_to  注册时间区间（YYYY-MM-DD），缺省不过滤
//   sort_by        last_active_at | last_login_at | created_at | vip_expires_at
//   sort_order     asc | desc
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

	validSortFields := map[string]bool{"last_active_at": true, "last_login_at": true, "created_at": true, "vip_expires_at": true}
	if !validSortFields[sortBy] {
		sortBy = "last_login_at"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	filter := UserListFilter{
		Q:           c.Query("q"),
		Role:        c.Query("role"),
		Tier:        c.Query("tier"),
		CreatedFrom: c.Query("created_from"),
		CreatedTo:   c.Query("created_to"),
		SortBy:      sortBy,
		SortOrder:   sortOrder,
	}
	if statusStr := c.Query("status"); statusStr != "" {
		if v, err := strconv.Atoi(statusStr); err == nil {
			s := int8(v)
			filter.Status = &s
		}
	}
	if vStr := c.Query("email_verified"); vStr == "1" || vStr == "0" {
		b := vStr == "1"
		filter.EmailVerified = &b
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
		utils.SafeError(c, 3001, err)
		return
	}

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


	utils.Success(c, resp)
}

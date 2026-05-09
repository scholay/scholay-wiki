package admin

import (
	"strconv"
	"time"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ListAuditLogsHandler GET /api/v1/admin/audit-logs
//
// Query params:
//
//	page / page_size
//	admin_user_id  操作人 ID
//	action         create / update / delete / role_assign / clear / ...
//	resource_type  user / prompt_template / feedback / ...
//	start_time / end_time  RFC3339 或 2006-01-02 15:04:05
func ListAuditLogsHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}

	f := AuditListFilter{
		Action:       c.Query("action"),
		ResourceType: c.Query("resource_type"),
	}
	if v := c.Query("admin_user_id"); v != "" {
		if uid, err := strconv.ParseUint(v, 10, 64); err == nil {
			f.AdminUserID = uint(uid)
		}
	}
	if v := c.Query("start_time"); v != "" {
		if t, err := parseFlexibleTime(v); err == nil {
			f.StartTime = &t
		}
	}
	if v := c.Query("end_time"); v != "" {
		if t, err := parseFlexibleTime(v); err == nil {
			f.EndTime = &t
		}
	}

	offset := database.CalcOffset(page, pageSize)
	rows, total, err := ListAuditLogs(offset, pageSize, f)
	if err != nil {
		utils.Error(c, 4030, "查询审计日志失败")
		return
	}

	utils.Success(c, gin.H{
		"items":     rows,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// parseFlexibleTime 接受 RFC3339 / 2006-01-02 15:04:05 / 2006-01-02 三种格式
func parseFlexibleTime(s string) (time.Time, error) {
	loc := time.Local
	for _, layout := range []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.ParseInLocation(layout, s, loc); err == nil {
			return t, nil
		}
	}
	return time.Time{}, &time.ParseError{}
}

package announcement

import (
	"strconv"
	"time"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler 公告管理(后台)+ 公开查询
type Handler struct{}

// NewHandler creates a new handler
func NewHandler() *Handler { return &Handler{} }

// ListAdmin 后台列表(全部,带分页)
// GET /api/v1/admin/announcements
func (h *Handler) ListAdmin(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	q := database.GetDB().Model(&Announcement{})
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ?", t)
	}
	if active := c.Query("active"); active == "1" {
		q = q.Where("is_active = 1")
	} else if active == "0" {
		q = q.Where("is_active = 0")
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		utils.Error(c, 7001, "Failed to count")
		return
	}

	var items []Announcement
	if err := q.Order("priority DESC, created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&items).Error; err != nil {
		utils.Error(c, 7002, "Failed to list")
		return
	}

	utils.Success(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// CreateRequest 创建/更新请求
type CreateRequest struct {
	Type           string     `json:"type" binding:"required,oneof=banner popup maintenance_note"`
	Title          string     `json:"title" binding:"required,max=200"`
	Content        string     `json:"content" binding:"required"`
	LinkURL        string     `json:"link_url"`
	LinkText       string     `json:"link_text"`
	Severity       string     `json:"severity" binding:"omitempty,oneof=info warning danger success"`
	TargetAudience string     `json:"target_audience" binding:"omitempty,oneof=all logged_in paid"`
	Dismissable    *int8      `json:"dismissable"`
	StartsAt       *time.Time `json:"starts_at"`
	EndsAt         *time.Time `json:"ends_at"`
	IsActive       *int8      `json:"is_active"`
	Priority       int        `json:"priority"`
}

// Create POST /api/v1/admin/announcements
func (h *Handler) Create(c *gin.Context) {
	var req CreateRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	row := Announcement{
		Type:           req.Type,
		Title:          req.Title,
		Content:        req.Content,
		LinkURL:        req.LinkURL,
		LinkText:       req.LinkText,
		Severity:       defaultStr(req.Severity, "info"),
		TargetAudience: defaultStr(req.TargetAudience, "all"),
		Dismissable:    defaultInt8(req.Dismissable, 1),
		StartsAt:       req.StartsAt,
		EndsAt:         req.EndsAt,
		IsActive:       defaultInt8(req.IsActive, 1),
		Priority:       req.Priority,
	}
	if uid, ok := utils.GetUserID(c); ok {
		row.CreatedBy = &uid
	}

	if err := database.GetDB().Create(&row).Error; err != nil {
		utils.Error(c, 7003, "Failed to create")
		return
	}

	utils.Success(c, row)
}

// Update PUT /api/v1/admin/announcements/:id
func (h *Handler) Update(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req CreateRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	updates := map[string]any{
		"type":            req.Type,
		"title":           req.Title,
		"content":         req.Content,
		"link_url":        req.LinkURL,
		"link_text":       req.LinkText,
		"severity":        defaultStr(req.Severity, "info"),
		"target_audience": defaultStr(req.TargetAudience, "all"),
		"dismissable":     defaultInt8(req.Dismissable, 1),
		"starts_at":       req.StartsAt,
		"ends_at":         req.EndsAt,
		"is_active":       defaultInt8(req.IsActive, 1),
		"priority":        req.Priority,
	}
	if err := database.GetDB().Model(&Announcement{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		utils.Error(c, 7004, "Failed to update")
		return
	}

	utils.SuccessWithMessage(c, "Updated", nil)
}

// Delete DELETE /api/v1/admin/announcements/:id
func (h *Handler) Delete(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if err := database.GetDB().Delete(&Announcement{}, id).Error; err != nil {
		utils.Error(c, 7005, "Failed to delete")
		return
	}
	utils.SuccessWithMessage(c, "Deleted", nil)
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
func defaultInt8(p *int8, fallback int8) int8 {
	if p == nil {
		return fallback
	}
	return *p
}

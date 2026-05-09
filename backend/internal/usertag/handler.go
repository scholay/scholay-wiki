package usertag

import (
	"strconv"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler 处理标签 CRUD + 标签↔用户 关联
type Handler struct{}

// NewHandler creates a new handler
func NewHandler() *Handler { return &Handler{} }

// ListTags GET /api/v1/admin/user-tags
// 返回标签字典 + 每个标签下的用户数
func (h *Handler) ListTags(c *gin.Context) {
	var tags []Tag
	if err := database.GetDB().Order("created_at ASC, id ASC").Find(&tags).Error; err != nil {
		utils.Error(c, 7100, "Failed to list tags")
		return
	}

	// 一次性查所有 tag 的用户数 (GROUP BY tag_id)
	type cnt struct {
		TagID uint
		Total int64
	}
	var counts []cnt
	database.GetDB().Table("user_tag_assignments").
		Select("tag_id, COUNT(user_id) AS total").
		Group("tag_id").
		Scan(&counts)
	countMap := make(map[uint]int64, len(counts))
	for _, c := range counts {
		countMap[c.TagID] = c.Total
	}
	for i := range tags {
		tags[i].UserCount = countMap[tags[i].ID]
	}

	utils.Success(c, gin.H{"items": tags})
}

// TagRequest 创建/更新请求
type TagRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=50"`
	Color       string `json:"color" binding:"omitempty,oneof=default success warning destructive info secondary outline"`
	Description string `json:"description" binding:"max=255"`
}

// CreateTag POST /api/v1/admin/user-tags
func (h *Handler) CreateTag(c *gin.Context) {
	var req TagRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	row := Tag{
		Name:        req.Name,
		Color:       defaultColor(req.Color),
		Description: req.Description,
	}
	if uid, ok := utils.GetUserID(c); ok {
		row.CreatedBy = &uid
	}
	if err := database.GetDB().Create(&row).Error; err != nil {
		utils.Error(c, 7101, "Failed to create (name may be duplicated)")
		return
	}
	admin.LogAdminAction(c, admin.ActionCreate, "user_tag",
		strconv.FormatUint(uint64(row.ID), 10), gin.H{"name": row.Name})
	utils.Success(c, row)
}

// UpdateTag PUT /api/v1/admin/user-tags/:id
func (h *Handler) UpdateTag(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	var req TagRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := database.GetDB().Model(&Tag{}).Where("id = ?", id).Updates(map[string]any{
		"name":        req.Name,
		"color":       defaultColor(req.Color),
		"description": req.Description,
	}).Error; err != nil {
		utils.Error(c, 7102, "Failed to update")
		return
	}
	admin.LogAdminAction(c, admin.ActionUpdate, "user_tag",
		strconv.FormatUint(uint64(id), 10), gin.H{"name": req.Name})
	utils.SuccessWithMessage(c, "Updated", nil)
}

// DeleteTag DELETE /api/v1/admin/user-tags/:id
// 删除标签 + 所有关联(用户身上的标签消失)
func (h *Handler) DeleteTag(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	tx := database.GetDB().Begin()
	tx.Where("tag_id = ?", id).Delete(&Assignment{})
	if err := tx.Delete(&Tag{}, id).Error; err != nil {
		tx.Rollback()
		utils.Error(c, 7103, "Failed to delete")
		return
	}
	tx.Commit()
	admin.LogAdminAction(c, admin.ActionDelete, "user_tag",
		strconv.FormatUint(uint64(id), 10), nil)
	utils.SuccessWithMessage(c, "Deleted", nil)
}

// AssignTagsRequest 给一批用户分配标签 / 取消标签
type AssignTagsRequest struct {
	UserIDs []uint `json:"user_ids" binding:"required,min=1,max=500"`
	TagID   uint   `json:"tag_id" binding:"required"`
	Action  string `json:"action" binding:"required,oneof=assign unassign"`
}

// AssignTags POST /api/v1/admin/user-tags/assign
// 批量给用户打/取消标签(批量运营动作)
func (h *Handler) AssignTags(c *gin.Context) {
	var req AssignTagsRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 校验 tag 存在
	var tag Tag
	if err := database.GetDB().First(&tag, req.TagID).Error; err != nil {
		utils.Error(c, 7104, "Tag not found")
		return
	}

	if req.Action == "unassign" {
		if err := database.GetDB().Where("user_id IN ? AND tag_id = ?", req.UserIDs, req.TagID).
			Delete(&Assignment{}).Error; err != nil {
			utils.Error(c, 7105, "Failed to unassign")
			return
		}
		admin.LogAdminAction(c, "untag", "user_tag",
			strconv.FormatUint(uint64(req.TagID), 10), gin.H{
				"tag_name":   tag.Name,
				"user_count": len(req.UserIDs),
			})
		utils.SuccessWithMessage(c, "Unassigned", gin.H{"affected": len(req.UserIDs)})
		return
	}

	// assign:批量插入,主键冲突自动忽略(防重)
	now := time.Now()
	var operatorID *uint
	if uid, ok := utils.GetUserID(c); ok {
		operatorID = &uid
	}
	rows := make([]Assignment, 0, len(req.UserIDs))
	for _, uid := range req.UserIDs {
		rows = append(rows, Assignment{
			UserID:     uid,
			TagID:      req.TagID,
			AssignedBy: operatorID,
			CreatedAt:  now,
		})
	}
	// INSERT IGNORE 通过 OnConflict DoNothing 实现
	if err := database.GetDB().
		Exec("INSERT IGNORE INTO user_tag_assignments (user_id, tag_id, assigned_by, created_at) VALUES "+placeholders(len(rows)),
			flattenAssignmentArgs(rows)...).Error; err != nil {
		utils.Error(c, 7106, "Failed to assign")
		return
	}

	admin.LogAdminAction(c, "tag", "user_tag",
		strconv.FormatUint(uint64(req.TagID), 10), gin.H{
			"tag_name":   tag.Name,
			"user_count": len(req.UserIDs),
		})
	utils.SuccessWithMessage(c, "Assigned", gin.H{"affected": len(req.UserIDs)})
}

// GetUserTags GET /api/v1/admin/users/:id/tags
// 查某用户身上的所有标签
func (h *Handler) GetUserTags(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	var tags []Tag
	database.GetDB().
		Table("user_tags").
		Joins("JOIN user_tag_assignments ON user_tag_assignments.tag_id = user_tags.id").
		Where("user_tag_assignments.user_id = ?", uid).
		Order("user_tags.id ASC").
		Find(&tags)
	utils.Success(c, gin.H{"items": tags})
}

func defaultColor(c string) string {
	if c == "" {
		return "default"
	}
	return c
}

func placeholders(n int) string {
	if n == 0 {
		return "(0,0,NULL,NOW())"
	}
	out := ""
	for i := 0; i < n; i++ {
		if i > 0 {
			out += ","
		}
		out += "(?,?,?,?)"
	}
	return out
}

func flattenAssignmentArgs(rows []Assignment) []any {
	out := make([]any, 0, len(rows)*4)
	for _, r := range rows {
		out = append(out, r.UserID, r.TagID, r.AssignedBy, r.CreatedAt)
	}
	return out
}

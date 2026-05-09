// Package ai — Prompt 模板历史版本快照与回滚
package ai

import (
	"time"

	"scholar-backend/internal/common/database"
)

// PromptTemplateVersion 是 prompt_template_versions 表的 GORM 模型
type PromptTemplateVersion struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	TemplateID     uint      `gorm:"column:template_id;index" json:"template_id"`
	TemplateKey    string    `gorm:"column:template_key;size:50" json:"template_key"`
	Name           string    `gorm:"size:100" json:"name"`
	Template       string    `gorm:"type:text" json:"template"`
	Description    string    `gorm:"type:text" json:"description"`
	IsActive       int       `gorm:"default:1" json:"is_active"`
	ChangeNote     string    `gorm:"column:change_note;size:255" json:"change_note"`
	SnapshotBy     *uint     `gorm:"column:snapshot_by" json:"snapshot_by"`
	SnapshotByName string    `gorm:"column:snapshot_by_name;size:100" json:"snapshot_by_name"`
	CreatedAt      time.Time `gorm:"column:created_at;index" json:"created_at"`
}

// TableName specifies the table name
func (PromptTemplateVersion) TableName() string {
	return "prompt_template_versions"
}

// SnapshotPromptTemplate 把当前版本快照一份到 versions 表。
// 调用时机:每次 update template 之前。
//
// 注:这里同步写,不放 goroutine — update 后还要返回成功;若 snapshot 失败应阻断 update 让管理员重试。
func SnapshotPromptTemplate(t *PromptTemplate, snapshotBy uint, snapshotByName, note string) error {
	row := PromptTemplateVersion{
		TemplateID:     t.ID,
		TemplateKey:    t.Key,
		Name:           t.Name,
		Template:       t.Template,
		Description:    t.Description,
		IsActive:       t.IsActive,
		ChangeNote:     note,
		SnapshotByName: snapshotByName,
		CreatedAt:      time.Now(),
	}
	if snapshotBy > 0 {
		row.SnapshotBy = &snapshotBy
	}
	return database.GetDB().Create(&row).Error
}

// ListPromptTemplateVersions 查询某模板的历史版本(倒序,最近的在前)
func ListPromptTemplateVersions(templateID uint, limit int) ([]PromptTemplateVersion, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []PromptTemplateVersion
	err := database.GetDB().
		Where("template_id = ?", templateID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

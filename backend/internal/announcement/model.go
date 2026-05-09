// Package announcement — 全站公告 / Banner / 弹窗 / 维护通知
package announcement

import "time"

// Announcement 表 announcements 的 GORM 模型
type Announcement struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Type           string     `gorm:"size:20;default:banner" json:"type"`
	Title          string     `gorm:"size:200;not null" json:"title"`
	Content        string     `gorm:"type:text;not null" json:"content"`
	LinkURL        string     `gorm:"column:link_url;size:500" json:"link_url"`
	LinkText       string     `gorm:"column:link_text;size:50" json:"link_text"`
	Severity       string     `gorm:"size:20;default:info" json:"severity"`
	TargetAudience string     `gorm:"column:target_audience;size:20;default:all" json:"target_audience"`
	Dismissable    int8       `gorm:"default:1" json:"dismissable"`
	StartsAt       *time.Time `gorm:"column:starts_at" json:"starts_at"`
	EndsAt         *time.Time `gorm:"column:ends_at" json:"ends_at"`
	IsActive       int8       `gorm:"column:is_active;default:1" json:"is_active"`
	Priority       int        `gorm:"default:0" json:"priority"`
	CreatedBy      *uint      `gorm:"column:created_by" json:"created_by,omitempty"`
	CreatedAt      time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

// TableName specifies table name
func (Announcement) TableName() string {
	return "announcements"
}

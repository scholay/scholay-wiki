// Package usertag — 用户标签字典 + 用户↔标签 多对多
package usertag

import "time"

// Tag 标签字典
type Tag struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:50;not null;uniqueIndex:uk_name" json:"name"`
	Color       string    `gorm:"size:20;default:default" json:"color"`
	Description string    `gorm:"size:255" json:"description"`
	CreatedBy   *uint     `gorm:"column:created_by" json:"created_by,omitempty"`
	CreatedAt   time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at" json:"updated_at"`

	// non-DB:统计字段(查列表时填充)
	UserCount int64 `gorm:"-" json:"user_count"`
}

// TableName specifies table name
func (Tag) TableName() string { return "user_tags" }

// Assignment 用户↔标签 关联
type Assignment struct {
	UserID     uint      `gorm:"primaryKey" json:"user_id"`
	TagID      uint      `gorm:"primaryKey" json:"tag_id"`
	AssignedBy *uint     `gorm:"column:assigned_by" json:"assigned_by,omitempty"`
	CreatedAt  time.Time `gorm:"column:created_at" json:"created_at"`
}

// TableName specifies table name
func (Assignment) TableName() string { return "user_tag_assignments" }

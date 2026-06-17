// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

package usermemory

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository user_memory_blocks 表访问层。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ListByUser 取某用户全部记忆块(label 升序,渲染/展示用)。
func (r *Repository) ListByUser(userID uint) ([]MemoryBlock, error) {
	var rows []MemoryBlock
	err := r.db.Where("user_id = ?", userID).Order("label asc").Find(&rows).Error
	return rows, err
}

// Get 取某用户某 label 的记忆块;不存在返回 (nil, nil)。
func (r *Repository) Get(userID uint, label string) (*MemoryBlock, error) {
	var row MemoryBlock
	err := r.db.Where("user_id = ? AND label = ?", userID, label).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// Upsert 写一个记忆块(靠 uk_user_label 幂等:存在则更新 value/char_limit/updated_at)。
func (r *Repository) Upsert(userID uint, label, value string, charLimit int) error {
	now := time.Now()
	row := MemoryBlock{
		UserID:    userID,
		Label:     label,
		Value:     value,
		CharLimit: charLimit,
		UpdatedAt: now,
		CreatedAt: now,
	}
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "label"}},
		DoUpdates: clause.Assignments(map[string]any{
			"value":      value,
			"char_limit": charLimit,
			"updated_at": now,
		}),
	}).Create(&row).Error
}

// DeleteBlock 删某用户某 label 的记忆块。
func (r *Repository) DeleteBlock(userID uint, label string) error {
	return r.db.Where("user_id = ? AND label = ?", userID, label).Delete(&MemoryBlock{}).Error
}

// DeleteAll 清空某用户全部记忆(GDPR / 删用户级联)。
func (r *Repository) DeleteAll(userID uint) error {
	return r.db.Where("user_id = ?", userID).Delete(&MemoryBlock{}).Error
}

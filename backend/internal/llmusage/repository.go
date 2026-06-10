package llmusage

import (
	"context"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// Create 插一行账本 (ctx 带 deadline —— DB 卡住时及时放弃, 不积压 record 池 worker)。
func (r *Repository) Create(ctx context.Context, row *LLMTokenUsage) error {
	return r.db.WithContext(ctx).Create(row).Error
}

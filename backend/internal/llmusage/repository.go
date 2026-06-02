package llmusage

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// Create 插一行账本。
func (r *Repository) Create(row *LLMTokenUsage) error {
	return r.db.Create(row).Error
}

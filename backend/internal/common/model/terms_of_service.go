package model

import "time"

// TermsOfService represents terms of service configuration
type TermsOfService struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Version   string    `gorm:"size:50;not null" json:"version"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName specifies table name
func (TermsOfService) TableName() string {
	return "terms_of_service"
}

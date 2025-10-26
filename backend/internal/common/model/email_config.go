package model

import "time"

// EmailConfig represents email server configuration
type EmailConfig struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	SMTPHost     string    `gorm:"size:255;not null" json:"smtp_host"`
	SMTPPort     int       `gorm:"not null" json:"smtp_port"`
	SMTPUser     string    `gorm:"size:255;not null" json:"smtp_user"`
	SMTPPassword string    `gorm:"size:255;not null" json:"smtp_password"`
	FromEmail    string    `gorm:"size:255;not null" json:"from_email"`
	FromName     string    `gorm:"size:255;not null" json:"from_name"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName specifies table name
func (EmailConfig) TableName() string {
	return "email_configs"
}

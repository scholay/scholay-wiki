package admin

import (
	"time"
)

// AdminUser represents an admin user in the system
type AdminUser struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Username    string     `gorm:"unique;not null;size:50" json:"username"`
	PasswordHash string    `gorm:"not null;size:255" json:"-"`
	Email       *string    `gorm:"size:100" json:"email"`
	Status      int8       `gorm:"not null;default:1" json:"status"` // 1=active, 0=inactive
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// TableName specifies the table name for AdminUser
func (AdminUser) TableName() string {
	return "admin_users"
}

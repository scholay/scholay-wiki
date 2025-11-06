package model

import (
	"time"
)

// AlipayConfig represents an Alipay payment configuration
type AlipayConfig struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	AppID           string    `gorm:"type:varchar(32);not null" json:"app_id"`
	PrivateKey      string    `gorm:"type:text;not null" json:"private_key"`
	AlipayPublicKey string    `gorm:"type:text;not null" json:"alipay_public_key"`
	GatewayURL      string    `gorm:"type:varchar(255);not null;default:'https://openapi.alipay.com/gateway.do'" json:"gateway_url"`
	NotifyURL       string    `gorm:"type:varchar(255);not null" json:"notify_url"`
	ReturnURL       string    `gorm:"type:varchar(255)" json:"return_url"`
	IsSandbox       bool      `gorm:"not null;default:false" json:"is_sandbox"`
	IsActive        bool      `gorm:"not null;default:true;index" json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName specifies the table name for AlipayConfig
func (AlipayConfig) TableName() string {
	return "alipay_configs"
}

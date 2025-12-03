// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// SMSConfig represents Aliyun SMS service configuration
type SMSConfig struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	AccessKeyID     string    `gorm:"size:255;not null" json:"access_key_id"`
	AccessSecret    string    `gorm:"size:255;not null" json:"access_secret"`
	SignName        string    `gorm:"size:100;not null" json:"sign_name"`        // 短信签名
	TemplateCode    string    `gorm:"size:50;not null" json:"template_code"`     // 短信模板代码
	TemplateContent string    `gorm:"type:text;not null" json:"template_content"` // 短信模板内容,如: 您的验证码是${code},有效期为5分钟
	Endpoint        string    `gorm:"size:255;default:'dypnsapi.aliyuncs.com'" json:"endpoint"` // 号码认证服务端点
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

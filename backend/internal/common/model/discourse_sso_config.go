package model

import "time"

// DiscourseSSOConfig 恩特学术（Discourse）DiscourseConnect Provider 配置
type DiscourseSSOConfig struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	SiteURL      string    `gorm:"column:site_url;size:255" json:"site_url"`           // 恩特学术站点 URL: https://enterscholar.com
	SSOSecret    string    `gorm:"column:sso_secret;size:255" json:"sso_secret"`       // DiscourseConnect Provider Secret
	RedirectURI  string    `gorm:"column:redirect_uri;size:255" json:"redirect_uri"`   // 回调地址
	Enabled      bool      `gorm:"column:enabled;default:false" json:"enabled"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (DiscourseSSOConfig) TableName() string {
	return "discourse_sso_config"
}

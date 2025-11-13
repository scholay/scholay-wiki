package model

import "time"

// SystemConfig represents system configuration settings
type SystemConfig struct {
	ID                       uint      `gorm:"primaryKey" json:"id"`
	RequireEmailVerification bool      `gorm:"default:true" json:"require_email_verification"`                          // 登录/注册是否需要邮箱验证码
	EnableTurnstile          bool      `gorm:"default:false" json:"enable_turnstile"`                                   // 是否启用 Cloudflare Turnstile 人机验证
	TurnstileSiteKey         string    `gorm:"type:varchar(100)" json:"turnstile_site_key"`                             // Turnstile Site Key (公钥)
	TurnstileSecretKey       string    `gorm:"type:varchar(100)" json:"turnstile_secret_key"`                           // Turnstile Secret Key (私钥)
	EnableGithubOAuth        bool      `gorm:"column:enable_github_oauth;default:false" json:"enable_github_oauth"`     // 是否启用 GitHub OAuth 登录
	GithubClientID           string    `gorm:"column:github_client_id;type:varchar(100)" json:"github_client_id"`       // GitHub OAuth Client ID
	GithubClientSecret       string    `gorm:"column:github_client_secret;type:varchar(255)" json:"github_client_secret"` // GitHub OAuth Client Secret
	GithubRedirectURI        string    `gorm:"column:github_redirect_uri;type:varchar(255)" json:"github_redirect_uri"` // GitHub OAuth Redirect URI
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// TableName specifies table name
func (SystemConfig) TableName() string {
	return "system_configs"
}

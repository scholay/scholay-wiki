// ============================================================================
// 限时领取会员推广(Promo)—— 数据模型。
//   PromoConfig:单行配置(id 恒为 1,迁移 0039 seed)
//     - 后台:总开关 + 微信客服二维码(data URL)+ 可配置文案
//     - 用户端:顶部导航按钮 + 首次进站/额度用尽弹窗,扫码加客服领取
// ============================================================================

package promo

import "time"

// PromoConfig 单行配置(id 恒为 1)。
type PromoConfig struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	Enabled    bool   `gorm:"column:enabled" json:"enabled"`
	Title      string `gorm:"column:title" json:"title"`
	Subtitle   string `gorm:"column:subtitle" json:"subtitle"`
	Benefits   string `gorm:"column:benefits" json:"benefits"` // 福利点:一行一条
	ButtonText string `gorm:"column:button_text" json:"button_text"`
	WechatQR   string `gorm:"column:wechat_qr" json:"wechat_qr"` // data URL

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (PromoConfig) TableName() string { return "promo_config" }

// PublicView 用户端下发结构:
//   - 关闭时只透出 enabled=false(不泄漏二维码/文案给无关场景)
//   - 开启时给全部展示字段(文案留空,前端走内置默认)
type PublicView struct {
	Enabled    bool   `json:"enabled"`
	Title      string `json:"title,omitempty"`
	Subtitle   string `json:"subtitle,omitempty"`
	Benefits   string `json:"benefits,omitempty"`
	ButtonText string `json:"button_text,omitempty"`
	WechatQR   string `json:"wechat_qr,omitempty"`
}

// PublicSummaryView 是用户端常驻控制器使用的轻量配置。
// 二维码 data URL 不进入这个响应，只下发真正打开弹窗后才会请求的 URL。
// 旧 /config/promo 依旧返回 PublicView，保持已部署客户端兼容。
type PublicSummaryView struct {
	Enabled     bool   `json:"enabled"`
	Title       string `json:"title,omitempty"`
	Subtitle    string `json:"subtitle,omitempty"`
	Benefits    string `json:"benefits,omitempty"`
	ButtonText  string `json:"button_text,omitempty"`
	WechatQRURL string `json:"wechat_qr_url,omitempty"`
}

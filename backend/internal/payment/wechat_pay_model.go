package payment

import "time"

// WeChatPayConfig 微信支付配置
type WeChatPayConfig struct {
	ID         uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	MchID      string    `gorm:"type:varchar(32);not null" json:"mch_id"`                 // 商户号
	AppID      string    `gorm:"type:varchar(32);not null" json:"app_id"`                 // 微信App ID
	APIv3Key   string    `gorm:"column:api_v3_key;type:varchar(64);not null" json:"-"`   // APIv3密钥（不返回给前端）
	SerialNo   string    `gorm:"type:varchar(64);not null" json:"serial_no"`              // 商户API证书序列号
	PrivateKey string    `gorm:"type:text;not null" json:"-"`                             // 商户私钥（不返回给前端）
	NotifyURL  string    `gorm:"type:varchar(255);not null" json:"notify_url"`            // 支付回调URL
	IsSandbox  bool      `gorm:"type:boolean;not null;default:false" json:"is_sandbox"`   // 是否沙箱环境
	IsActive   bool      `gorm:"type:boolean;not null;default:true" json:"is_active"`     // 是否启用
	CreatedAt  time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"created_at"`    // 创建时间
	UpdatedAt  time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"updated_at"`    // 更新时间
}

func (WeChatPayConfig) TableName() string {
	return "wechat_pay_configs"
}

// WeChatPayConfigDTO 用于前端展示和编辑（隐藏敏感信息）
type WeChatPayConfigDTO struct {
	ID        uint64 `json:"id"`
	MchID     string `json:"mch_id"`
	AppID     string `json:"app_id"`
	APIv3Key  string `json:"api_v3_key,omitempty"` // 仅在show_keys=true时返回
	SerialNo  string `json:"serial_no"`
	PrivateKey string `json:"private_key,omitempty"` // 仅在show_keys=true时返回
	NotifyURL string `json:"notify_url"`
	IsSandbox bool   `json:"is_sandbox"`
	IsActive  bool   `json:"is_active"`
}

// ToDTO 转换为DTO（默认隐藏敏感信息）
func (c *WeChatPayConfig) ToDTO(showKeys bool) *WeChatPayConfigDTO {
	dto := &WeChatPayConfigDTO{
		ID:        c.ID,
		MchID:     c.MchID,
		AppID:     c.AppID,
		SerialNo:  c.SerialNo,
		NotifyURL: c.NotifyURL,
		IsSandbox: c.IsSandbox,
		IsActive:  c.IsActive,
	}

	if showKeys {
		dto.APIv3Key = c.APIv3Key
		dto.PrivateKey = c.PrivateKey
	} else {
		// 返回脱敏后的信息
		if len(c.APIv3Key) > 8 {
			dto.APIv3Key = c.APIv3Key[:4] + "****" + c.APIv3Key[len(c.APIv3Key)-4:]
		}
		if len(c.PrivateKey) > 20 {
			dto.PrivateKey = "-----BEGIN PRIVATE KEY-----\n****\n-----END PRIVATE KEY-----"
		}
	}

	return dto
}

// WeChatPayNotifyRequest 微信支付回调请求
type WeChatPayNotifyRequest struct {
	ID           string                       `json:"id"`
	CreateTime   string                       `json:"create_time"`
	ResourceType string                       `json:"resource_type"`
	EventType    string                       `json:"event_type"`
	Summary      string                       `json:"summary"`
	Resource     WeChatPayNotifyResource      `json:"resource"`
}

// WeChatPayNotifyResource 微信支付回调资源
type WeChatPayNotifyResource struct {
	Algorithm      string `json:"algorithm"`
	Ciphertext     string `json:"ciphertext"`
	AssociatedData string `json:"associated_data"`
	Nonce          string `json:"nonce"`
}

// WeChatPayNotifyDecrypted 解密后的回调数据
type WeChatPayNotifyDecrypted struct {
	MchID          string                     `json:"mchid"`
	AppID          string                     `json:"appid"`
	OutTradeNo     string                     `json:"out_trade_no"`
	TransactionID  string                     `json:"transaction_id"`
	TradeType      string                     `json:"trade_type"`
	TradeState     string                     `json:"trade_state"`
	TradeStateDesc string                     `json:"trade_state_desc"`
	BankType       string                     `json:"bank_type"`
	Attach         string                     `json:"attach"`
	SuccessTime    string                     `json:"success_time"`
	Payer          WeChatPayNotifyPayer       `json:"payer"`
	Amount         WeChatPayNotifyAmount      `json:"amount"`
}

// WeChatPayNotifyPayer 支付者信息
type WeChatPayNotifyPayer struct {
	OpenID string `json:"openid"`
}

// WeChatPayNotifyAmount 金额信息
type WeChatPayNotifyAmount struct {
	Total         int    `json:"total"`
	PayerTotal    int    `json:"payer_total"`
	Currency      string `json:"currency"`
	PayerCurrency string `json:"payer_currency"`
}

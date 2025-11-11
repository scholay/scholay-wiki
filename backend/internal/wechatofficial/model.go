package wechatofficial

import (
	"encoding/xml"
	"time"
)

// WeChatOfficialConfig represents WeChat Official Account auto-reply configuration
type WeChatOfficialConfig struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	AppID           string    `json:"app_id" gorm:"column:app_id;type:varchar(100);not null;default:''"`
	AppSecret       string    `json:"app_secret" gorm:"column:app_secret;type:varchar(255);not null;default:''"`
	Token           string    `json:"token" gorm:"column:token;type:varchar(100);not null;default:''"`
	EncodingAESKey  string    `json:"encoding_aes_key" gorm:"column:encoding_aes_key;type:varchar(100);not null;default:''"`
	EncryptionMode  string    `json:"encryption_mode" gorm:"column:encryption_mode;type:varchar(20);not null;default:'plaintext'"` // plaintext, compatible, secure
	AutoReplyEnabled bool     `json:"auto_reply_enabled" gorm:"column:auto_reply_enabled;not null;default:false"`
	AIModelLevel    string    `json:"ai_model_level" gorm:"column:ai_model_level;type:varchar(20);not null;default:'low'"` // low, medium, high
	SystemPrompt    string    `json:"system_prompt" gorm:"column:system_prompt;type:text"`
	CreatedAt       time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName specifies the table name
func (WeChatOfficialConfig) TableName() string {
	return "wechat_official_config"
}

// WeChatTextMessage represents a text message from WeChat
type WeChatTextMessage struct {
	ToUserName   string `xml:"ToUserName"`
	FromUserName string `xml:"FromUserName"`
	CreateTime   int64  `xml:"CreateTime"`
	MsgType      string `xml:"MsgType"`
	Content      string `xml:"Content"`
	MsgID        int64  `xml:"MsgId"`
}

// WeChatTextResponse represents a text response to WeChat
type WeChatTextResponse struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
}

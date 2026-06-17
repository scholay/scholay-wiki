// ============================================================================
// 客服与联系中心 —— 数据模型。
//   SupportCenterConfig:单行配置(用户侧联系方式展示 + IMAP 收件 + 飞书通知)
//   MailInbox:IMAP 拉取的收件箱(一封一行,account+uid_validity+uid 去重)
// ============================================================================

package supportcenter

import (
	"time"

	"scholar-backend/internal/common/utils"
)

// SupportCenterConfig 单行配置(id 恒为 1,迁移 0027 seed)。
type SupportCenterConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// 用户侧「联系我们」展示
	SupportEmail  string `gorm:"column:support_email" json:"support_email"`
	BusinessEmail string `gorm:"column:business_email" json:"business_email"`
	ContactNote   string `gorm:"column:contact_note" json:"contact_note"`
	WecomQR       string `gorm:"column:wecom_qr" json:"wecom_qr"`   // data URL
	FeishuQR      string `gorm:"column:feishu_qr" json:"feishu_qr"` // data URL

	// IMAP 收件
	IMAPEnabled     bool   `gorm:"column:imap_enabled" json:"imap_enabled"`
	IMAPHost        string `gorm:"column:imap_host" json:"imap_host"`
	IMAPPort        int    `gorm:"column:imap_port" json:"imap_port"`
	IMAPUsername    string `gorm:"column:imap_username" json:"imap_username"`
	IMAPPassword    string `gorm:"column:imap_password" json:"imap_password"`
	IMAPTLS         bool   `gorm:"column:imap_tls" json:"imap_tls"`
	IMAPPollMinutes int    `gorm:"column:imap_poll_minutes" json:"imap_poll_minutes"`

	// SMTP 发信(客服邮箱自有发信通道;未配置则回落全站 email_configs)
	SMTPHost     string `gorm:"column:smtp_host" json:"smtp_host"`
	SMTPPort     int    `gorm:"column:smtp_port" json:"smtp_port"`
	SMTPUsername string `gorm:"column:smtp_username" json:"smtp_username"`
	SMTPPassword string `gorm:"column:smtp_password" json:"smtp_password"`
	SMTPFromName string `gorm:"column:smtp_from_name" json:"smtp_from_name"`

	// 飞书通知(群自定义机器人 webhook)
	FeishuWebhookURL      string `gorm:"column:feishu_webhook_url" json:"feishu_webhook_url"`
	FeishuSecret          string `gorm:"column:feishu_secret" json:"feishu_secret"`
	FeishuNotifyFeedback  bool   `gorm:"column:feishu_notify_feedback" json:"feishu_notify_feedback"`
	FeishuNotifyEmail     bool   `gorm:"column:feishu_notify_email" json:"feishu_notify_email"`
	FeishuNotifyPayment   bool   `gorm:"column:feishu_notify_payment" json:"feishu_notify_payment"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (SupportCenterConfig) TableName() string { return "support_center_config" }

// MaskSensitive 按需脱敏(IMAP 密码 / SMTP 密码 / 飞书 webhook(含 token)/ 飞书 secret)。
func (c *SupportCenterConfig) MaskSensitive(show bool) *SupportCenterConfig {
	cp := *c
	utils.MaskSecret(&cp.IMAPPassword, show)
	utils.MaskSecret(&cp.SMTPPassword, show)
	utils.MaskSecret(&cp.FeishuWebhookURL, show)
	utils.MaskSecret(&cp.FeishuSecret, show)
	return &cp
}

// MailInbox 收件箱一行。
type MailInbox struct {
	ID          uint64     `gorm:"primaryKey" json:"id"`
	Account     string     `gorm:"column:account" json:"account"`
	UIDValidity uint64     `gorm:"column:uid_validity" json:"uid_validity"`
	UID         uint64     `gorm:"column:uid" json:"uid"`
	MessageID   string     `gorm:"column:message_id" json:"message_id"`
	FromName    string     `gorm:"column:from_name" json:"from_name"`
	FromAddr    string     `gorm:"column:from_addr" json:"from_addr"`
	ToAddr      string     `gorm:"column:to_addr" json:"to_addr"`
	Subject     string     `gorm:"column:subject" json:"subject"`
	SentAt      *time.Time `gorm:"column:sent_at" json:"sent_at"`
	Snippet     string     `gorm:"column:snippet" json:"snippet"`
	TextBody    string     `gorm:"column:text_body" json:"text_body"`
	HTMLBody    string     `gorm:"column:html_body" json:"html_body"`
	Status      string     `gorm:"column:status" json:"status"` // unread | read | replied
	RepliedAt   *time.Time `gorm:"column:replied_at" json:"replied_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (MailInbox) TableName() string { return "mail_inbox" }

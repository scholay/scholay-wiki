// ============================================================================
// 客服与联系中心 —— service:配置读写 + 收件箱回信 / 主动写信(复用全站 SMTP 发送链:
// utils.SendEmailWithTLS + EmailObserver → email_logs 发送记录自动落)。
// ============================================================================

package supportcenter

import (
	"fmt"
	"html"
	"net/mail"
	"strings"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
)

// ConfigService 最小依赖:取当前激活的 SMTP 发信配置(与 feedback 同款注入)。
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
}

type Service struct {
	repo          *Repository
	configService ConfigService
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetConfigService 注入 SMTP 配置来源(bootstrap)。
func (s *Service) SetConfigService(cs ConfigService) { s.configService = cs }

// ─── 配置 ─────────────────────────────────────────────────────────────────

func (s *Service) GetConfig() (*SupportCenterConfig, error) { return s.repo.GetConfig() }

// UpdateConfig 更新单行配置;敏感字段(IMAP 密码/飞书 webhook/secret)空值或遮罩 = 保留旧值。
func (s *Service) UpdateConfig(in *SupportCenterConfig) error {
	old, err := s.repo.GetConfig()
	if err != nil {
		return err
	}
	in.IMAPPassword, _ = utils.PreserveSecretOnEmptyNoCtx(in.IMAPPassword, old.IMAPPassword, true)
	in.SMTPPassword, _ = utils.PreserveSecretOnEmptyNoCtx(in.SMTPPassword, old.SMTPPassword, true)
	in.FeishuWebhookURL, _ = utils.PreserveSecretOnEmptyNoCtx(in.FeishuWebhookURL, old.FeishuWebhookURL, true)
	in.FeishuSecret, _ = utils.PreserveSecretOnEmptyNoCtx(in.FeishuSecret, old.FeishuSecret, true)
	if in.IMAPPollMinutes < 1 {
		in.IMAPPollMinutes = 5
	}
	if in.IMAPPort <= 0 {
		in.IMAPPort = 993
	}
	if in.SMTPPort <= 0 {
		in.SMTPPort = 465
	}
	return s.repo.UpdateConfig(in)
}

// PublicContact 用户端「联系我们」展示数据(只透出展示字段,空字段前端自然隐藏)。
type PublicContact struct {
	SupportEmail  string `json:"support_email"`
	BusinessEmail string `json:"business_email"`
	ContactNote   string `json:"contact_note"`
	WecomQR       string `json:"wecom_qr"`
	FeishuQR      string `json:"feishu_qr"`
}

func (s *Service) GetPublicContact() (*PublicContact, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	return &PublicContact{
		SupportEmail:  cfg.SupportEmail,
		BusinessEmail: cfg.BusinessEmail,
		ContactNote:   cfg.ContactNote,
		WecomQR:       cfg.WecomQR,
		FeishuQR:      cfg.FeishuQR,
	}, nil
}

// ─── 发信(回信 / 主动写信)──────────────────────────────────────────────

// resolveSendConfig 解析发信配置:优先用「客服邮箱自有 SMTP」(回信/写信从 support@ 发出),
// 未配置则回落全站激活的 email_configs(向后兼容)。第二返回值=来源标签(日志/报错友好)。
func (s *Service) resolveSendConfig() (utils.EmailConfig, error) {
	cfg, err := s.repo.GetConfig()
	if err == nil && cfg.SMTPHost != "" && cfg.SMTPUsername != "" && cfg.SMTPPassword != "" {
		fromName := cfg.SMTPFromName
		if fromName == "" {
			fromName = "客服中心"
		}
		port := cfg.SMTPPort
		if port <= 0 {
			port = 465
		}
		return utils.EmailConfig{
			SMTPHost: cfg.SMTPHost, SMTPPort: port,
			SMTPUser: cfg.SMTPUsername, SMTPPassword: cfg.SMTPPassword,
			FromEmail: cfg.SMTPUsername, FromName: fromName,
		}, nil
	}
	// 回落全站发信。
	if s.configService == nil {
		return utils.EmailConfig{}, fmt.Errorf("尚未配置发信:请在「客服配置 → 发信(SMTP)」或「系统设置 → 邮件」中设置")
	}
	ec, err := s.configService.GetActiveEmailConfig()
	if err != nil || ec == nil {
		return utils.EmailConfig{}, fmt.Errorf("尚未配置发信:请在「客服配置 → 发信(SMTP)」或「系统设置 → 邮件」中设置")
	}
	return utils.EmailConfig{
		SMTPHost: ec.SMTPHost, SMTPPort: ec.SMTPPort,
		SMTPUser: ec.SMTPUser, SMTPPassword: ec.SMTPPassword,
		FromEmail: ec.FromEmail, FromName: ec.FromName,
	}, nil
}

// sendMail 按 resolveSendConfig 发一封 HTML 邮件(自动进 email_logs 发送记录)。
func (s *Service) sendMail(to, subject, body string) error {
	cfg, err := s.resolveSendConfig()
	if err != nil {
		return err
	}
	return utils.SendEmailWithTLS(cfg, []string{to}, subject, body)
}

// TestSMTP 用「已保存」的客服发信配置给自己发一封测试邮件(配置页「测试发信」)。
func (s *Service) TestSMTP() error {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return err
	}
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" || cfg.SMTPPassword == "" {
		return fmt.Errorf("发信配置不完整(服务器 / 账号 / 密码)")
	}
	return s.sendMail(cfg.SMTPUsername, "Scholay 客服中心:发信测试",
		renderPlainBody("这是一封发信配置测试邮件,收到即表示客服邮箱 SMTP 发信正常。"))
}

// renderPlainBody 把后台 textarea 写的纯文本包成简洁 HTML(转义 + 换行 → <br>)。
func renderPlainBody(text string) string {
	escaped := html.EscapeString(text)
	escaped = strings.ReplaceAll(escaped, "\n", "<br>")
	return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.7;color:#333;">` +
		escaped + `</div>`
}

// ReplyInbox 回复收件箱某封邮件:发给原发件人 → 标记 replied。
func (s *Service) ReplyInbox(id uint64, subject, body string) error {
	m, err := s.repo.GetInbox(id)
	if err != nil {
		return fmt.Errorf("邮件不存在: %w", err)
	}
	if m.FromAddr == "" {
		return fmt.Errorf("该邮件没有可回复的发件人地址")
	}
	if strings.TrimSpace(subject) == "" {
		subject = "Re: " + m.Subject
	}
	if err := s.sendMail(m.FromAddr, subject, renderPlainBody(body)); err != nil {
		return err
	}
	return s.repo.MarkStatus(id, "replied")
}

// Compose 主动写信给任意邮箱(后台「写邮件」;用户有邮箱即可直接写信)。
func (s *Service) Compose(to, subject, body string) error {
	if _, err := mail.ParseAddress(to); err != nil {
		return fmt.Errorf("收件邮箱格式不正确")
	}
	if strings.TrimSpace(subject) == "" || strings.TrimSpace(body) == "" {
		return fmt.Errorf("主题与正文不能为空")
	}
	return s.sendMail(to, subject, renderPlainBody(body))
}

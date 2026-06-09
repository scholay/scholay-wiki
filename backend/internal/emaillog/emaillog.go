// ============================================================================
// internal/emaillog —— 邮件发送记录。
//
// 全站邮件经 utils.SendEmailWithTLS 发出,bootstrap 注册 observer 把每封邮件的结果
// (成功/失败 + 报错 + 收件地址 + 主题 + 发件人 + 时间)落到 email_logs 表。
// 管理后台「邮件记录」菜单分页查看 + 按状态/类别/收件人筛选。
//
// 落库是 best-effort(observer 里 safego.Go 异步),记录失败只告警,不影响发信本身。
// ============================================================================

package emaillog

import (
	"log/slog"
	"strings"
	"time"

	"gorm.io/gorm"
)

// EmailLog email_logs 表一行(邮件 + 短信统一记录,按 channel 区分)。
//   channel=email:to_email=收件邮箱, from_name=发件人名, subject=主题
//   channel=sms  :to_email=手机号,   from_name=短信签名, subject=模板内容
type EmailLog struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Channel   string    `gorm:"column:channel" json:"channel"` // email | sms
	ToEmail   string    `gorm:"column:to_email" json:"to_email"`
	Subject   string    `gorm:"column:subject" json:"subject"`
	Category  string    `gorm:"column:category" json:"category"` // verification|feedback|billing|test|other
	FromEmail string    `gorm:"column:from_email" json:"from_email"`
	FromName  string    `gorm:"column:from_name" json:"from_name"`
	Status    string    `gorm:"column:status" json:"status"` // success | failed
	Error     string    `gorm:"column:error" json:"error"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (EmailLog) TableName() string { return "email_logs" }

// ─── Repository ──────────────────────────────────────────────────────────

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(l *EmailLog) error { return r.db.Create(l).Error }

// Filter 列表过滤。
type Filter struct {
	Channel  string // email | sms | ""
	Status   string // success | failed | ""
	Category string // verification | feedback | billing | test | other | ""
	Search   string // 模糊匹配收件地址 / 主题
}

func (f Filter) apply(q *gorm.DB) *gorm.DB {
	if f.Channel == "email" || f.Channel == "sms" {
		q = q.Where("channel = ?", f.Channel)
	}
	if f.Status == "success" || f.Status == "failed" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Category != "" {
		q = q.Where("category = ?", f.Category)
	}
	if f.Search != "" {
		like := "%" + f.Search + "%"
		q = q.Where("to_email LIKE ? OR subject LIKE ?", like, like)
	}
	return q
}

// List 分页查询(created_at DESC)。
func (r *Repository) List(f Filter, limit, offset int) ([]EmailLog, int64, error) {
	q := f.apply(r.db.Model(&EmailLog{}))
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []EmailLog
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// Stats 总数 / 成功 / 失败计数(按 channel 过滤,顶部概览卡)。
func (r *Repository) Stats(channel string) (total, success, failed int64, err error) {
	base := r.db.Model(&EmailLog{})
	if channel == "email" || channel == "sms" {
		base = base.Where("channel = ?", channel)
	}
	if err = base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return
	}
	if err = base.Session(&gorm.Session{}).Where("status = ?", "failed").Count(&failed).Error; err != nil {
		return
	}
	success = total - failed
	return
}

// ─── Service ─────────────────────────────────────────────────────────────

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// Record 落一条发送记录(邮件/短信,由 utils 的 observer 调用)。best-effort,失败只告警。
//   channel=email:recipient=邮箱, sender=发件邮箱, senderName=发件人名
//   channel=sms  :recipient=手机号, sender="",     senderName=短信签名
func (s *Service) Record(channel, recipient, subject, sender, senderName string, success bool, errMsg string) {
	if channel != "sms" {
		channel = "email"
	}
	status := "success"
	if !success {
		status = "failed"
	}
	if len(errMsg) > 4000 {
		errMsg = errMsg[:4000]
	}
	l := &EmailLog{
		Channel: channel, ToEmail: recipient, Subject: subject, Category: categoryOf(subject),
		FromEmail: sender, FromName: senderName, Status: status, Error: errMsg,
	}
	if err := s.repo.Create(l); err != nil {
		slog.Warn("emaillog: record failed", "channel", channel, "to", recipient, "err", err)
	}
}

func (s *Service) List(f Filter, page, pageSize int) ([]EmailLog, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 30
	}
	return s.repo.List(f, pageSize, (page-1)*pageSize)
}

func (s *Service) Stats(channel string) (total, success, failed int64, err error) {
	return s.repo.Stats(channel)
}

// categoryOf 按主题粗分类(无类别字段透传,按关键词归类,便于后台筛选)。
func categoryOf(subject string) string {
	switch {
	case strings.Contains(subject, "验证码"):
		return "verification"
	case strings.Contains(subject, "反馈"):
		return "feedback"
	case strings.Contains(subject, "配置测试"), strings.Contains(subject, "测试"):
		return "test"
	case containsAny(subject, "会员", "套餐", "充值", "经费", "订阅", "续期", "升级", "兑换"):
		return "billing"
	default:
		return "other"
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

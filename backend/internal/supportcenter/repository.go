// ============================================================================
// 客服与联系中心 —— 数据访问。
// ============================================================================

package supportcenter

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ─── 配置(单行)──────────────────────────────────────────────────────────

// GetConfig 取单行配置;迁移已 seed id=1,记录不存在时兜底空配置(不报错)。
func (r *Repository) GetConfig() (*SupportCenterConfig, error) {
	var c SupportCenterConfig
	if err := r.db.First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SupportCenterConfig{ID: 1, IMAPPort: 993, IMAPTLS: true, IMAPPollMinutes: 5}, nil
		}
		return nil, err
	}
	return &c, nil
}

// UpdateConfig 全量更新单行(map 指定字段,避免 gorm 跳零值导致开关关不掉)。
func (r *Repository) UpdateConfig(c *SupportCenterConfig) error {
	return r.db.Model(&SupportCenterConfig{}).Where("id = ?", 1).Updates(map[string]any{
		"support_email":           c.SupportEmail,
		"business_email":          c.BusinessEmail,
		"contact_note":            c.ContactNote,
		"wecom_qr":                c.WecomQR,
		"feishu_qr":               c.FeishuQR,
		"imap_enabled":            c.IMAPEnabled,
		"imap_host":               c.IMAPHost,
		"imap_port":               c.IMAPPort,
		"imap_username":           c.IMAPUsername,
		"imap_password":           c.IMAPPassword,
		"imap_tls":                c.IMAPTLS,
		"imap_poll_minutes":       c.IMAPPollMinutes,
		"smtp_host":               c.SMTPHost,
		"smtp_port":               c.SMTPPort,
		"smtp_username":           c.SMTPUsername,
		"smtp_password":           c.SMTPPassword,
		"smtp_from_name":          c.SMTPFromName,
		"feishu_webhook_url":      c.FeishuWebhookURL,
		"feishu_secret":           c.FeishuSecret,
		"feishu_notify_feedback":  c.FeishuNotifyFeedback,
		"feishu_notify_email":     c.FeishuNotifyEmail,
	}).Error
}

// ─── 收件箱 ────────────────────────────────────────────────────────────────

// MaxUID 当前账号 + uidvalidity 下已入库的最大 IMAP UID(增量拉取游标)。无记录返回 0。
func (r *Repository) MaxUID(account string, uidValidity uint64) (uint64, error) {
	var max *uint64
	err := r.db.Model(&MailInbox{}).
		Where("account = ? AND uid_validity = ?", account, uidValidity).
		Select("MAX(uid)").Scan(&max).Error
	if err != nil || max == nil {
		return 0, err
	}
	return *max, nil
}

// InsertIgnore 入库一封;唯一键(account, uid_validity, uid)冲突时跳过(幂等)。
// 返回是否真的新插入(供「只对新邮件发飞书通知」判定)。
func (r *Repository) InsertIgnore(m *MailInbox) (bool, error) {
	res := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(m)
	return res.RowsAffected > 0, res.Error
}

// ListInbox 分页收件箱;status 可空(全部),keyword 模糊匹配 发件人/主题。
func (r *Repository) ListInbox(status, keyword string, limit, offset int) ([]MailInbox, int64, error) {
	q := r.db.Model(&MailInbox{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("from_addr LIKE ? OR from_name LIKE ? OR subject LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []MailInbox
	// 列表不带大字段(正文进详情再取),防整页 MEDIUMTEXT 拖垮传输。
	err := q.Omit("text_body", "html_body").
		Order("sent_at DESC, id DESC").Limit(limit).Offset(offset).Find(&rows).Error
	return rows, total, err
}

// GetInbox 取一封(含正文)。
func (r *Repository) GetInbox(id uint64) (*MailInbox, error) {
	var m MailInbox
	if err := r.db.First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// MarkStatus 标记状态(read / replied;replied 时记时间)。
func (r *Repository) MarkStatus(id uint64, status string) error {
	updates := map[string]any{"status": status}
	if status == "replied" {
		updates["replied_at"] = time.Now()
	}
	return r.db.Model(&MailInbox{}).Where("id = ?", id).Updates(updates).Error
}

// MarkReadIfUnread 详情打开时 unread → read(已回复的不动)。
func (r *Repository) MarkReadIfUnread(id uint64) error {
	return r.db.Model(&MailInbox{}).
		Where("id = ? AND status = 'unread'", id).
		Update("status", "read").Error
}

// CountUnread 未读数(后台角标用)。
func (r *Repository) CountUnread() (int64, error) {
	var n int64
	err := r.db.Model(&MailInbox{}).Where("status = 'unread'").Count(&n).Error
	return n, err
}

// ============================================================================
// Scholay学术 V1.0
// Admin Audit Log — 跟踪管理员所有写操作
// ============================================================================

package admin

import (
	"encoding/json"
	"log/slog"
	"time"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

// AuditLog 是 admin_audit_logs 表的 GORM 模型
type AuditLog struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	AdminUserID   uint      `gorm:"column:admin_user_id;index" json:"admin_user_id"`
	AdminUsername string    `gorm:"column:admin_username;size:100" json:"admin_username"`
	AdminRole     string    `gorm:"column:admin_role;size:20" json:"admin_role"`
	Action        string    `gorm:"column:action;size:50;index" json:"action"`
	ResourceType  string    `gorm:"column:resource_type;size:50;index" json:"resource_type"`
	ResourceID    string    `gorm:"column:resource_id;size:100" json:"resource_id"`
	Details       string    `gorm:"column:details;type:json" json:"details"`
	IP            string    `gorm:"column:ip;size:45" json:"ip"`
	UserAgent     string    `gorm:"column:user_agent;size:500" json:"user_agent"`
	CreatedAt     time.Time `gorm:"column:created_at;index" json:"created_at"`
}

// TableName specifies the table name for AuditLog
func (AuditLog) TableName() string {
	return "admin_audit_logs"
}

// 常用动作 / 资源常量,代码侧统一引用避免拼写错。
const (
	ActionCreate      = "create"
	ActionUpdate      = "update"
	ActionDelete      = "delete"
	ActionBatchDelete = "batch_delete"
	ActionClear       = "clear"
	ActionRoleAssign  = "role_assign"
	ActionActivate    = "activate"
	ActionTest        = "test"

	ResUser            = "user"
	ResMessageTemplate = "message_template"
	ResFeedback        = "feedback"
	ResUsageLog        = "usage_log"
	ResThirdParty      = "third_party_account"
	ResLatexAgent      = "latex_agent"
	ResAlipayConfig    = "alipay_config"
	ResWechatPay       = "wechat_pay_config"
	ResWechatOAuth     = "wechat_config"
	ResOfficial        = "wechat_official_config"
	ResOAuth           = "oauth_config"
	ResEmailConfig     = "email_config"
	ResSMSConfig       = "sms_config"
	ResSystemConfig    = "system_config"
	ResCodeSnippet     = "code_snippet"
)

// LogAdminAction 异步记录一条审计日志,失败仅打 warn 不影响主流程。
//
// 调用建议:
//
//	admin.LogAdminAction(c, admin.ActionDelete, admin.ResUser, fmt.Sprint(uid), gin.H{
//	  "deleted_email": user.Email,
//	})
//
// 不建议在每个 GET 上记录,只在写操作上调用。
func LogAdminAction(c *gin.Context, action, resourceType, resourceID string, details any) {
	uid, _ := c.Get("user_id")
	username, _ := c.Get("username")
	role, _ := c.Get("user_role")

	uidU, _ := uid.(uint)
	usernameStr, _ := username.(string)
	roleStr, _ := role.(string)

	var detailsJSON string
	if details != nil {
		if b, err := json.Marshal(details); err == nil {
			detailsJSON = string(b)
		}
	}

	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")
	if len(ua) > 500 {
		ua = ua[:500]
	}

	row := AuditLog{
		AdminUserID:   uidU,
		AdminUsername: usernameStr,
		AdminRole:     roleStr,
		Action:        action,
		ResourceType:  resourceType,
		ResourceID:    resourceID,
		Details:       detailsJSON,
		IP:            ip,
		UserAgent:     ua,
		CreatedAt:     time.Now(),
	}

	// 异步写入,即使数据库慢也不阻塞主请求
	safego.Go("admin-audit-log", func() {
		if err := database.GetDB().Create(&row).Error; err != nil {
			slog.Warn("audit log insert failed",
				"action", action, "resource", resourceType, "id", resourceID, "err", err)
		}
	})
}

// AuditListFilter 审计日志查询过滤
type AuditListFilter struct {
	AdminUserID  uint   // 0 = 不过滤
	Action       string // "" = 不过滤
	ResourceType string // "" = 不过滤
	StartTime    *time.Time
	EndTime      *time.Time
}

// ListAuditLogs 分页查询审计日志(供管理后台 UI 使用)
func ListAuditLogs(offset, limit int, f AuditListFilter) ([]AuditLog, int64, error) {
	q := database.GetDB().Model(&AuditLog{})
	if f.AdminUserID > 0 {
		q = q.Where("admin_user_id = ?", f.AdminUserID)
	}
	if f.Action != "" {
		q = q.Where("action = ?", f.Action)
	}
	if f.ResourceType != "" {
		q = q.Where("resource_type = ?", f.ResourceType)
	}
	if f.StartTime != nil {
		q = q.Where("created_at >= ?", *f.StartTime)
	}
	if f.EndTime != nil {
		q = q.Where("created_at <= ?", *f.EndTime)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []AuditLog
	if err := q.Order("created_at DESC, id DESC").
		Offset(offset).Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

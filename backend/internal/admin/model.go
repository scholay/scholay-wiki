// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"time"
)

// 角色常量。三级权限：
//   RoleUser       —— 普通用户
//   RoleAdmin      —— 管理员，拥有除"角色分配"外的所有后台权限
//   RoleSuperAdmin —— 超级管理员，比 admin 多一个能力：把用户提升/降级为 admin
const (
	RoleUser       = "user"
	RoleAdmin      = "admin"
	RoleSuperAdmin = "super_admin"
)

// IsAdminRole 判断角色是否具备后台管理员权限（admin 或 super_admin）。
func IsAdminRole(role string) bool {
	return role == RoleAdmin || role == RoleSuperAdmin
}

// 前端用 permissions 数组判断 UI 元素是否显示。
// 命名规则: <resource>.<action>，新增能力直接往这里加，不要在前端硬编码 role 字符串。
const (
	PermUsersView        = "users.view"
	PermUsersDelete      = "users.delete"
	PermUsersRoleAssign  = "users.role.assign" // 仅 super_admin
	PermConfigManage     = "config.manage"
	PermContentManage    = "content.manage"
	PermAnalyticsView    = "analytics.view"
)

// PermissionsForRole 返回该角色拥有的全部权限列表。
func PermissionsForRole(role string) []string {
	switch role {
	case RoleSuperAdmin:
		return []string{
			PermUsersView, PermUsersDelete, PermUsersRoleAssign,
			PermConfigManage, PermContentManage, PermAnalyticsView,
		}
	case RoleAdmin:
		return []string{
			PermUsersView, PermUsersDelete,
			PermConfigManage, PermContentManage, PermAnalyticsView,
		}
	default:
		return []string{}
	}
}

// AdminUser represents an admin account stored in the unified users table.
type AdminUser struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	Username      string     `gorm:"size:50" json:"username"`
	PasswordHash  string     `gorm:"size:255" json:"-"`
	Email         *string    `gorm:"size:100" json:"email"`
	Role          string     `gorm:"size:20" json:"role"`
	Status        int8       `gorm:"not null;default:1" json:"status"` // 1=active, 0=inactive
	EmailVerified bool       `gorm:"not null;default:false" json:"email_verified"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// TableName specifies the table name for AdminUser
func (AdminUser) TableName() string {
	return "users"
}

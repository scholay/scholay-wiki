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

// 角色常量。四级权限：
//   RoleUser       —— 普通用户
//   RoleOperations —— 运营，介于 user 与 admin 之间：能进 /admin，只碰内容/用户运营
//                     + 只读看板，碰不到系统/凭证/财务配置与角色分配
//   RoleAdmin      —— 管理员，拥有除"角色分配"外的所有后台权限
//   RoleSuperAdmin —— 超级管理员，比 admin 多一个能力：把用户提升/降级为 admin/operations
const (
	RoleUser       = "user"
	RoleOperations = "operations"
	RoleAdmin      = "admin"
	RoleSuperAdmin = "super_admin"
)

// IsAdminRole 判断角色是否为"完全管理员"（admin 或 super_admin）。
// ⚠️ operations 不算 —— 它只能访问被授权的运营子集。别把它塞进这里，否则
// FindByID / adminRoles / dashboard 统计排除口径会把它当成完整 admin。
func IsAdminRole(role string) bool {
	return role == RoleAdmin || role == RoleSuperAdmin
}

// CanAccessAdmin 判断角色是否可以进入 /admin 后台外壳（完整管理员或运营）。
// 具体每个菜单/接口能不能用，由 PermissionsForRole + middleware.RequirePermission 决定。
func CanAccessAdmin(role string) bool {
	return IsAdminRole(role) || role == RoleOperations
}

// 权限点。命名规则 <resource>.<action>。前后端共用同一份定义（单一真源）：
//   - 后端 middleware.RequirePermission(perm) 按此对路由子组做硬闸（越权 403）
//   - 前端读 /user/profile 下发的 permissions 数组过滤菜单/按钮（纯 UI，非安全边界）
// 新增能力直接往这里加，不要在前端硬编码 role 字符串。
const (
	PermUsersView       = "users.view"        // 看用户列表/统计/详情（只读）
	PermUsersManage     = "users.manage"      // 用户写操作：冻结/解冻/删号/发会员/调钱包
	PermUsersRoleAssign = "users.role.assign" // 分配角色 —— 仅 super_admin
	PermConfigManage    = "config.manage"     // 系统/凭证/支付/模型/计费等配置（仅完整管理员）
	PermContentManage   = "content.manage"    // 内容/互动运营：公告/反馈/审核/站内信/邮件/工具/推广
	PermAnalyticsView   = "analytics.view"    // 只读看板/统计/日志/会话监控/营收
	// PermFinanceRefund 订单退款登记 —— 唯一一个「点一下就把公司的钱转出去 + 回收用户权益」的动作。
	//
	// 单列一个权限点而不是复用 config.manage：退款和「改支付配置」是两类事，
	// 应该能独立授予/收回（比如让财务只有退款权、没有改商户凭证的权）。
	// 运营（operations）**不给** —— 订单只读接口在 analytics.view 组里，运营看得到订单，
	// 但看得到 ≠ 退得了。
	PermFinanceRefund = "finance.refund"
)

// PermissionsForRole 返回该角色拥有的全部权限列表（单一真源）。
func PermissionsForRole(role string) []string {
	switch role {
	case RoleSuperAdmin:
		return []string{
			PermUsersView, PermUsersManage, PermUsersRoleAssign,
			PermConfigManage, PermContentManage, PermAnalyticsView,
			PermFinanceRefund,
		}
	case RoleAdmin:
		return []string{
			PermUsersView, PermUsersManage,
			PermConfigManage, PermContentManage, PermAnalyticsView,
			PermFinanceRefund,
		}
	case RoleOperations:
		// 运营：内容/用户运营 + 只读看板；不含 config.manage / users.manage / 角色分配。
		return []string{
			PermUsersView, PermContentManage, PermAnalyticsView,
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
	LastLoginIP   *string    `gorm:"size:45;column:last_login_ip" json:"last_login_ip,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// TableName specifies the table name for AdminUser
func (AdminUser) TableName() string {
	return "users"
}

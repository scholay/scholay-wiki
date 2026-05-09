/**
 * 角色判断工具 — 与后端 internal/admin/model.go 中的 IsAdminRole 对齐
 *
 * 三级权限：user / admin / super_admin
 *   - admin / super_admin 都属于"后台管理员",可以进 /admin
 *   - 仅 super_admin 可以分配/撤销 admin 角色 (在 admin/v2/users 页面操作)
 */

export type UserRole = 'user' | 'admin' | 'super_admin' | string | undefined | null;

/** 是否具备进入后台 (/admin) 的权限 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** 是否是超级管理员 (可分配管理员角色) */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'super_admin';
}

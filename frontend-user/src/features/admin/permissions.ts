// 后台 RBAC 前端单一真源 —— 镜像 backend/internal/admin/model.go 的权限点 + PermissionsForRole。
//
// ⚠️ 安全边界在**后端**:每个 /api/v1/admin/* 子组挂 middleware.RequirePermission,越权直接 403。
// 这里的 permissions 只用于**菜单/按钮的显隐**(纯 UI 便利),藏了菜单也拦不住直接打 API —— 后端才拦得住。
//
// 权限来源优先级:后端 /user/profile 下发的 user.permissions(权威)> 按角色兜底(下方 permissionsForRole)。
// 兜底存在的意义:登录响应不含 permissions、profile 尚未拉回的短暂窗口里,靠 token 里的 role 也能正确渲染菜单。

import { useMemo } from 'react';
import { useAuthStore, type StoredUser } from '@/stores/auth.store';

export const PERM = {
  usersView: 'users.view',
  usersManage: 'users.manage',
  usersRoleAssign: 'users.role.assign',
  configManage: 'config.manage',
  contentManage: 'content.manage',
  analyticsView: 'analytics.view',
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

type Role = StoredUser['role'];

/** 按角色兜底权限集(镜像后端 PermissionsForRole)。仅在 profile 尚未下发 permissions 时用。 */
export function permissionsForRole(role?: Role): Permission[] {
  switch (role) {
    case 'super_admin':
      return [
        PERM.usersView, PERM.usersManage, PERM.usersRoleAssign,
        PERM.configManage, PERM.contentManage, PERM.analyticsView,
      ];
    case 'admin':
      return [
        PERM.usersView, PERM.usersManage,
        PERM.configManage, PERM.contentManage, PERM.analyticsView,
      ];
    case 'operations':
      return [PERM.usersView, PERM.contentManage, PERM.analyticsView];
    default:
      return [];
  }
}

/** 当前用户的有效权限集(权威 permissions 优先,缺失时按角色兜底)。引用稳定,可安全用于渲染过滤。 */
export function useAdminPermissions(): ReadonlySet<string> {
  const role = useAuthStore((s) => s.user?.role);
  const perms = useAuthStore((s) => s.user?.permissions);
  return useMemo(() => new Set<string>(perms ?? permissionsForRole(role)), [perms, role]);
}

/** 当前用户是否具备某权限点(后台按钮/区块显隐用)。 */
export function useHasPermission(perm: Permission): boolean {
  return useAdminPermissions().has(perm);
}

// ── 角色展示(徽章/文案)统一映射,避免各页各写一份三元 ──
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  operations: '运营',
  user: '用户',
};

type BadgeVariant = 'default' | 'muted' | 'warning' | 'destructive';

/** 角色 → Badge variant:超管=红 / 管理员=default / 运营=amber / 用户=muted。 */
export function roleBadgeVariant(role?: Role): BadgeVariant {
  switch (role) {
    case 'super_admin':
      return 'destructive';
    case 'admin':
      return 'default';
    case 'operations':
      return 'warning';
    default:
      return 'muted';
  }
}

/** 角色展示名(未知角色回落到原字符串)。 */
export function roleLabel(role?: string): string {
  return (role && ROLE_LABEL[role as Role]) || '用户';
}

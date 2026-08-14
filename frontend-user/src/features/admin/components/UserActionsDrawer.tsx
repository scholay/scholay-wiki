import { useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { toApiError } from '@/shared/lib/http';
import {
  type AdminUser,
  useDeleteUser,
  useFreezeUser,
  useUnfreezeUser,
  useUpdateUserRole,
  useUserVipStatus,
} from '../api/users';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { PERM, roleBadgeVariant, roleLabel, useHasPermission } from '../permissions';
import { CopyableId } from './CopyableId';
import { UserGrantPanel } from './UserGrantPanel';

export interface UserActionsDrawerProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_OPTIONS: Array<{
  role: Extract<AdminUser['role'], 'admin' | 'operations' | 'user'>;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    role: 'admin',
    description: '拥有除角色分配外的全部后台权限',
    icon: ShieldCheck,
  },
  {
    role: 'operations',
    description: '可做内容和用户运营，不可管理系统、凭证和角色',
    icon: UserCog,
  },
  {
    role: 'user',
    description: '收回全部后台权限',
    icon: UserRound,
  },
];

/**
 * 单用户写操作抽屉。Sheet 根节点始终挂载，不与详情抽屉共享表单状态。
 *
 * `UserActionsContent` 以 user.id 为 key：管理员在抽屉打开时切换用户，冻结原因、
 * 角色操作与会员/经费表单都会重挂，不会把上一个用户的数值带进来。
 */
export function UserActionsDrawer({ user, open, onOpenChange }: UserActionsDrawerProps) {
  const canManageUsers = useHasPermission(PERM.usersManage);
  const canAssignRole = useHasPermission(PERM.usersRoleAssign);

  return (
    <Sheet open={open && !!user} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-xl">
        {user && (
          <UserActionsContent
            key={user.id}
            user={user}
            open={open}
            canManageUsers={canManageUsers}
            canAssignRole={canAssignRole}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function UserActionsContent({
  user,
  open,
  canManageUsers,
  canAssignRole,
  onClose,
}: {
  user: AdminUser;
  open: boolean;
  canManageUsers: boolean;
  canAssignRole: boolean;
  onClose: () => void;
}) {
  const freeze = useFreezeUser();
  const unfreeze = useUnfreezeUser();
  const del = useDeleteUser();
  const updateRole = useUpdateUserRole();
  const vip = useUserVipStatus(open && canManageUsers ? user.id : undefined);
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [freezeReason, setFreezeReason] = useState('');
  const [pendingRole, setPendingRole] = useState<AdminUser['role'] | null>(null);

  const displayName =
    user.username || user.email?.split('@')[0] || user.phone || `User #${user.id}`;
  const accountSummary = user.email || user.phone || '未绑定邮箱或手机号';
  const trimmedReason = freezeReason.trim();
  const freezeReasonValid = trimmedReason.length >= 1 && trimmedReason.length <= 255;
  const targetCanBeFrozen = user.role !== 'admin' && user.role !== 'super_admin';

  const handleFreeze = async () => {
    if (!freezeReasonValid || !targetCanBeFrozen) return;
    const ok = await confirm({
      title: `冻结账号 ${displayName}?`,
      description: (
        <span className="flex flex-col gap-1">
          <span>该用户会立即被强制下线，已签发 token 将被撤销，且无法再登录。</span>
          <span className="text-foreground">冻结原因：{trimmedReason}</span>
        </span>
      ),
      danger: true,
      confirmText: '冻结账号',
    });
    if (!ok) return;

    const result = await apiToast(
      freeze.mutateAsync({ id: user.id, reason: trimmedReason }),
      { success: `已冻结 ${displayName}`, failure: '冻结失败' },
    );
    if (result !== null) onClose();
  };

  const handleUnfreeze = async () => {
    const result = await apiToast(unfreeze.mutateAsync(user.id), {
      success: `已解冻 ${displayName}`,
      failure: '解冻失败',
    });
    if (result !== null) onClose();
  };

  const handleRoleChange = async (newRole: AdminUser['role']) => {
    // 后端不允许改动其他 super_admin，前端同口径直接不进入变更流程。
    if (user.role === 'super_admin' || newRole === 'super_admin' || newRole === user.role) return;
    const target = ROLE_OPTIONS.find((option) => option.role === newRole);
    const ok = await confirm({
      title: `将 ${displayName} 的角色改为「${roleLabel(newRole)}」?`,
      description: target?.description,
      danger: newRole === 'admin',
      confirmText: '更新角色',
    });
    if (!ok) return;

    setPendingRole(newRole);
    try {
      const result = await apiToast(updateRole.mutateAsync({ id: user.id, role: newRole }), {
        success: '角色已更新',
        failure: '角色更新失败',
      });
      if (result !== null) onClose();
    } finally {
      setPendingRole(null);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `删除用户 ${displayName}?`,
      description: '此操作不可撤销——该用户的所有订单、反馈和会话都会被级联删除。',
      danger: true,
      confirmText: '永久删除',
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;

    const result = await apiToast(del.mutateAsync(user.id), {
      success: '已删除用户',
      failure: '删除失败',
    });
    if (result !== null) onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {displayName}
          <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
          {user.status === 2 && <Badge variant="destructive">已冻结</Badge>}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{accountSummary}</span>
          <span aria-hidden>·</span>
          <span>用户 ID</span>
          <CopyableId value={user.id} prefix="#" label="用户 ID" />
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {canManageUsers && (
          <ActionSection title="账号状态" icon={<Lock className="size-4" />}>
            {user.status === 2 ? (
              <div className="flex flex-col gap-2">
                <p className="text-12 text-faint">
                  账号当前已冻结。解冻后用户可以重新登录。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUnfreeze}
                  disabled={unfreeze.isPending}
                >
                  {unfreeze.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Unlock className="size-3.5" />
                  )}
                  解冻账号
                </Button>
              </div>
            ) : targetCanBeFrozen ? (
              <div className="flex flex-col gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`freeze-reason-${user.id}`} className="text-12 text-faint">
                      冻结原因（必填，1–255 字）
                    </Label>
                    <span className="text-12 tabular-nums text-faint">{freezeReason.length}/255</span>
                  </div>
                  <Input
                    id={`freeze-reason-${user.id}`}
                    value={freezeReason}
                    maxLength={255}
                    placeholder="如：批量注册小号刷邀请奖励（工单 No.1024）"
                    onChange={(event) => setFreezeReason(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && freezeReasonValid && !freeze.isPending) {
                        void handleFreeze();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleFreeze}
                  disabled={!freezeReasonValid || freeze.isPending}
                >
                  {freeze.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Lock className="size-3.5" />
                  )}
                  冻结账号
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-faint">
                <AlertTriangle className="mt-1 size-3.5 shrink-0 text-brand-amber" />
                管理员和超级管理员不可冻结，这是后端强制约束。
              </div>
            )}
          </ActionSection>
        )}

        {canAssignRole && (
          <ActionSection title="角色变更" icon={<ShieldCheck className="size-4" />}>
            {user.role === 'super_admin' ? (
              <div className="flex items-start gap-2 rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-faint">
                <AlertTriangle className="mt-1 size-3.5 shrink-0 text-brand-amber" />
                不可修改其他超级管理员的角色。
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-12 text-faint">当前角色：{roleLabel(user.role)}。角色变更会立即改变后台权限。</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ROLE_OPTIONS.filter((option) => option.role !== user.role).map((option) => {
                    const Icon = option.icon;
                    return (
                      <Button
                        key={option.role}
                        type="button"
                        variant="outline"
                        title={option.description}
                        onClick={() => handleRoleChange(option.role)}
                        disabled={updateRole.isPending}
                      >
                        {pendingRole === option.role ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Icon className="size-3.5" />
                        )}
                        设为{roleLabel(option.role)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </ActionSection>
        )}

        {canManageUsers && (
          <ActionSection title="会员与经费" icon={<ShieldCheck className="size-4" />}>
            {vip.isError ? (
              <div className="flex items-start gap-2 rounded-8 border border-border bg-danger-soft px-3 py-2 text-12">
                <AlertTriangle className="mt-1 size-3.5 shrink-0 text-brand-red" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <span className="text-brand-red">
                    会员状态加载失败：{toApiError(vip.error).message || '未知错误'}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void vip.refetch()}>
                    重试
                  </Button>
                </div>
              </div>
            ) : vip.isSuccess && vip.data ? (
              // 写钱表单只能在 VIP 真值到达后挂载；key 保证切换用户后所有输入回到默认值。
              <UserGrantPanel
                key={user.id}
                user={user}
                vip={vip.data}
                displayName={displayName}
              />
            ) : (
              <div className="flex items-center gap-2 rounded-8 border border-border bg-surface-1 px-3 py-3 text-12 text-faint">
                <Loader2 className="size-4 animate-spin" />
                正在加载会员、额度与经费状态…
              </div>
            )}
          </ActionSection>
        )}

        {canManageUsers && (
          <ActionSection title="删除账号" icon={<Trash2 className="size-4" />} danger>
            <p className="text-12 text-faint">
              用户及其订单、反馈和会话将被级联删除，且无法撤销。
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={del.isPending}
              className="mt-2"
            >
              {del.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              永久删除用户
            </Button>
          </ActionSection>
        )}

        {!canManageUsers && !canAssignRole && (
          <div className="rounded-8 border border-border bg-surface-1 px-3 py-3 text-12 text-faint">
            当前账号没有可执行的单用户写操作权限。
          </div>
        )}
      </div>
    </>
  );
}

function ActionSection({
  title,
  icon,
  danger = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-12 border border-border bg-surface-card p-3">
      <h3
        className={`mb-3 flex items-center gap-2 text-12 font-medium ${
          danger ? 'text-brand-red' : 'text-subtle'
        }`}
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

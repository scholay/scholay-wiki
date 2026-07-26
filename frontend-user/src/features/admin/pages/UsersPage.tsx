import { useState } from 'react';
import { Search, MoreHorizontal, Lock, Unlock, Trash2, ShieldCheck, Crown, Eye, Copy, UserCog, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useDebounce, useUrlState, usePatchUrlState } from '@/shared/hooks';
import { useHasPermission, PERM, roleLabel, roleBadgeVariant } from '../permissions';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { UserMetricsPanel } from '../components/UserMetricsPanel';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useUserList,
  useFreezeUser,
  useUnfreezeUser,
  useDeleteUser,
  useBatchDeleteUsers,
  useUpdateUserRole,
  type AdminUser,
  type UserListParams,
} from '../api/users';

// 服务端排序默认值 —— 与后端 GetUserList 默认一致(last_login_at desc)。
const DEFAULT_SORT_BY = 'last_login_at';
const DEFAULT_SORT_ORDER = 'desc';

/** 行内会员等级(effective):vip_tier 为 pro/max 且未过期 → 对应等级,否则 Free。与后端 effectiveTier 同口径。
 *  **必须含 max** —— 早期只判 'pro' 时,max 用户会被错显成 Free(详情页读 /vip 接口正确显示 Max → 列表与详情不一致)。 */
function effectiveTier(u: AdminUser): 'free' | 'pro' | 'max' {
  if (u.vip_tier === 'pro' || u.vip_tier === 'max') {
    const active = !u.vip_expires_at || new Date(u.vip_expires_at).getTime() > Date.now();
    if (active) return u.vip_tier;
  }
  return 'free';
}

export function UsersPage() {
  // URL 是唯一真源:读取走 useUrlState,写入一律走 patch ——
  // 多个 useUrlState setter 在同一同步事件里会互相覆盖(react-router 同步 navigate,
  // 每个 setter 从同一旧 base 计算),只有最后一个生效;patch 合并成一次 navigate 才正确。
  const patch = usePatchUrlState();
  const [keyword] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [role] = useUrlState('role', '');
  const [status] = useUrlState('status', '');
  const [tier] = useUrlState('tier', '');
  const [verified] = useUrlState('email_verified', '');
  const [createdFrom] = useUrlState('created_from', '');
  const [createdTo] = useUrlState('created_to', '');
  const [sortBy] = useUrlState('sort_by', DEFAULT_SORT_BY);
  const [sortOrder] = useUrlState('sort_order', DEFAULT_SORT_ORDER);
  const debounced = useDebounce(keyword, 300);
  const apiToast = useApiToast();
  const confirm = useConfirm();
  // 用户写操作(冻结/删号/批量删除)需 users.manage;角色分配需 users.role.assign(仅超管)。
  // 运营只有 users.view → 看得到列表/详情,但下面这些写操作按钮全部隐藏(后端也会 403 兜底)。
  const canManageUsers = useHasPermission(PERM.usersManage);
  const canAssignRole = useHasPermission(PERM.usersRoleAssign);

  const { data, isLoading } = useUserList({
    page,
    page_size: 20,
    q: debounced || undefined,
    role: role || undefined,
    status: status ? Number(status) : undefined,
    tier: tier || undefined,
    email_verified: verified === '1' || verified === '0' ? (verified as '0' | '1') : undefined,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
    sort_by: sortBy as UserListParams['sort_by'],
    sort_order: sortOrder as UserListParams['sort_order'],
  });

  const freeze = useFreezeUser();
  const unfreeze = useUnfreezeUser();
  const del = useDeleteUser();
  const batchDel = useBatchDeleteUsers();
  const updateRole = useUpdateUserRole();

  // 选中行 keys —— 切页/查询会保留(用户跨页选择常见)
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  // 详情抽屉
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDetail = (u: AdminUser) => {
    setDetailUser(u);
    setDrawerOpen(true);
  };

  const labelOf = (u: AdminUser) => u.email || u.username || u.phone || `#${u.id}`;

  // 任一筛选/搜索生效时显示「重置」
  const hasFilter = !!(role || status || tier || verified || createdFrom || createdTo || keyword);
  const resetFilters = () =>
    patch({
      q: null,
      role: null,
      status: null,
      tier: null,
      email_verified: null,
      created_from: null,
      created_to: null,
      page: null,
    });

  const handleBatchDelete = async (rows: AdminUser[]) => {
    const ok = await confirm({
      title: `批量删除 ${rows.length} 个用户?`,
      description: `${rows.slice(0, 3).map(labelOf).join('、')}${rows.length > 3 ? ` 等共 ${rows.length} 人` : ''}。所有关联订单、反馈、会话将级联删除。`,
      danger: true,
      confirmText: `永久删除 ${rows.length} 人`,
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    await apiToast(batchDel.mutateAsync(rows.map((r) => r.id)), {
      success: `已删除 ${rows.length} 个用户`,
      failure: '批量删除失败',
    });
    setSelected(new Set());
  };

  const handleFreeze = async (u: AdminUser) => {
    const action = u.status === 2 ? unfreeze.mutateAsync(u.id) : freeze.mutateAsync(u.id);
    await apiToast(action, {
      success: u.status === 2 ? `已解冻 ${labelOf(u)}` : `已冻结 ${labelOf(u)}`,
      failure: '操作失败',
    });
  };

  const handleDelete = async (u: AdminUser) => {
    const ok = await confirm({
      title: `删除用户 ${labelOf(u)}?`,
      description: '此操作不可撤销 —— 该用户的所有订单、反馈、会话都会被级联删除。',
      danger: true,
      confirmText: '永久删除',
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(u.id), { success: '已删除', failure: '删除失败' });
  };

  const handleRoleChange = async (u: AdminUser, newRole: AdminUser['role']) => {
    const desc: Partial<Record<AdminUser['role'], string>> = {
      admin: '该用户将拥有除「角色分配」外的全部后台权限。',
      operations: '该用户将成为运营:可进后台处理内容/用户运营 + 只读看板,但碰不到系统/凭证/财务配置与角色分配。',
      user: '将回收该用户的一切后台权限,降为普通用户。',
    };
    const ok = await confirm({
      title: `将 ${labelOf(u)} 的角色改为「${roleLabel(newRole)}」?`,
      description: desc[newRole],
      danger: newRole === 'admin',
      confirmText: '更新角色',
    });
    if (!ok) return;
    await apiToast(updateRole.mutateAsync({ id: u.id, role: newRole }), {
      success: '角色已更新',
      failure: '角色更新失败',
    });
  };

  const copyId = (u: AdminUser) => {
    navigator.clipboard?.writeText(String(u.id));
    toast.success(`已复制用户 ID #${u.id}`);
  };

  const columns: Column<AdminUser>[] = [
    {
      header: '用户',
      cell: (u) => (
        <button
          type="button"
          onClick={() => openDetail(u)}
          className="flex flex-col text-left transition-colors hover:text-brand-red"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-foreground font-medium">
              {u.username || u.email?.split('@')[0] || u.phone || '用户'}
            </span>
            <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">#{u.id}</span>
          </span>
          <span className="text-12 text-faint">{u.email || u.phone || '—'}</span>
        </button>
      ),
    },
    {
      header: '角色',
      cell: (u) => (
        <Badge variant={roleBadgeVariant(u.role)}>{roleLabel(u.role)}</Badge>
      ),
      width: 110,
    },
    {
      header: '会员',
      cell: (u) => {
        const t = effectiveTier(u);
        if (t === 'free') return <span className="text-12 text-faint">Free</span>;
        return (
          <span
            className={`inline-flex items-center gap-1 text-12 font-medium ${
              t === 'max' ? 'text-brand-red' : 'text-brand-amber'
            }`}
          >
            <Crown className="size-3.5" />
            {t === 'max' ? 'Max' : 'Pro'}
            {u.vip_expires_at && (
              <span className="font-normal text-faint">· {u.vip_expires_at.slice(0, 10)}</span>
            )}
          </span>
        );
      },
      width: 160,
      serverSortKey: 'vip_expires_at',
    },
    {
      header: '状态',
      cell: (u) =>
        u.status === 2 ? (
          <Badge variant="destructive">已冻结</Badge>
        ) : (
          <Badge variant="outline" className="text-brand-green border-brand-green">正常</Badge>
        ),
      width: 90,
    },
    {
      header: '注册时间',
      cell: (u) => (
        <span className="text-12 text-muted-foreground">{u.created_at?.slice(0, 16).replace('T', ' ') || '—'}</span>
      ),
      width: 150,
      serverSortKey: 'created_at',
    },
    {
      header: '最后活跃',
      cell: (u) => (
        <span className="text-12 text-muted-foreground">{u.last_active_at?.slice(0, 16).replace('T', ' ') || '—'}</span>
      ),
      width: 150,
      serverSortKey: 'last_active_at',
    },
    {
      header: '最后登录',
      cell: (u) => (
        <span className="text-12 text-muted-foreground">{u.last_login_at?.slice(0, 16).replace('T', ' ') || '—'}</span>
      ),
      width: 150,
      serverSortKey: 'last_login_at',
    },
    {
      header: '',
      width: 60,
      align: 'right',
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openDetail(u)}>
              <Eye className="size-3.5 mr-2" />
              查看详情 / 会员
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyId(u)}>
              <Copy className="size-3.5 mr-2" />
              复制用户 ID
            </DropdownMenuItem>
            {/* 冻结/解冻 —— 用户写操作,需 users.manage(运营看不到) */}
            {canManageUsers && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleFreeze(u)}>
                  {u.status === 2 ? (
                    <>
                      <Unlock className="size-3.5 mr-2" />
                      解冻账号
                    </>
                  ) : (
                    <>
                      <Lock className="size-3.5 mr-2" />
                      冻结账号
                    </>
                  )}
                </DropdownMenuItem>
              </>
            )}
            {/* 角色分配 —— 仅 super_admin(users.role.assign);不能改动其他 super_admin */}
            {canAssignRole && u.role !== 'super_admin' && (
              <>
                <DropdownMenuSeparator />
                {u.role !== 'admin' && (
                  <DropdownMenuItem onSelect={() => handleRoleChange(u, 'admin')}>
                    <ShieldCheck className="size-3.5 mr-2" />
                    设为管理员
                  </DropdownMenuItem>
                )}
                {u.role !== 'operations' && (
                  <DropdownMenuItem onSelect={() => handleRoleChange(u, 'operations')}>
                    <UserCog className="size-3.5 mr-2" />
                    设为运营
                  </DropdownMenuItem>
                )}
                {u.role !== 'user' && (
                  <DropdownMenuItem onSelect={() => handleRoleChange(u, 'user')}>
                    <UserRound className="size-3.5 mr-2" />
                    设为普通用户
                  </DropdownMenuItem>
                )}
              </>
            )}
            {/* 删除账号 —— 用户写操作,需 users.manage(运营看不到) */}
            {canManageUsers && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => handleDelete(u)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-3.5 mr-2" />
                  删除账号
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="用户管理"
      description={`共 ${data?.total ?? 0} 个账号 · 含管理员 · 可筛选 / 管会员 / 冻结 / 删除`}
      actions={
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-faint" />
          <Input
            placeholder="搜索 ID / 用户名 / 邮箱 / 手机号"
            value={keyword}
            onChange={(e) => patch({ q: e.target.value || null, page: null })}
            className="pl-8 h-8 w-full sm:w-64"
          />
        </div>
      }
    >
      <UserMetricsPanel />

      {/* 筛选条 —— 每次写入都连带 page:null 回首页,且合并成一次 navigate */}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-16 border border-border-soft bg-surface-1 p-3">
        <FilterField label="角色">
          <Select
            value={role}
            onChange={(e) => patch({ role: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-28"
          >
            <option value="">全部</option>
            <option value="user">普通用户</option>
            <option value="operations">运营</option>
            <option value="admin">管理员</option>
            <option value="super_admin">超级管理员</option>
          </Select>
        </FilterField>
        <FilterField label="会员">
          <Select
            value={tier}
            onChange={(e) => patch({ tier: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-24"
          >
            <option value="">全部</option>
            <option value="max">Max</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </Select>
        </FilterField>
        <FilterField label="状态">
          <Select
            value={status}
            onChange={(e) => patch({ status: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-24"
          >
            <option value="">全部</option>
            <option value="1">正常</option>
            <option value="2">已冻结</option>
          </Select>
        </FilterField>
        <FilterField label="邮箱验证">
          <Select
            value={verified}
            onChange={(e) => patch({ email_verified: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-24"
          >
            <option value="">全部</option>
            <option value="1">已验证</option>
            <option value="0">未验证</option>
          </Select>
        </FilterField>
        <FilterField label="注册自">
          <Input
            type="date"
            value={createdFrom}
            onChange={(e) => patch({ created_from: e.target.value || null, page: null })}
            className="h-8 w-36"
          />
        </FilterField>
        <FilterField label="注册至">
          <Input
            type="date"
            value={createdTo}
            onChange={(e) => patch({ created_to: e.target.value || null, page: null })}
            className="h-8 w-36"
          />
        </FilterField>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-faint">
            重置
          </Button>
        )}
      </section>

      <DataTable
        columns={columns}
        rows={data?.users}
        loading={isLoading}
        emptyMessage="没有符合条件的用户"
        selection={
          canManageUsers
            ? {
                selectedKeys: selected,
                onSelectionChange: setSelected,
                getKey: (u) => u.id,
              }
            : undefined
        }
        serverSort={{
          sortBy,
          sortOrder: sortOrder as 'asc' | 'desc',
          onChange: (by, order) =>
            patch({
              sort_by: by === DEFAULT_SORT_BY ? null : by,
              sort_order: order === DEFAULT_SORT_ORDER ? null : order,
              page: null,
            }),
        }}
        bulkActions={
          canManageUsers
            ? (rows) => (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={batchDel.isPending}
                  onClick={() => handleBatchDelete(rows)}
                >
                  <Trash2 className="size-3.5" />
                  批量删除
                </Button>
              )
            : undefined
        }
      />

      <Pagination
        total={data?.total ?? 0}
        page={page}
        pageSize={20}
        onPageChange={(p) => patch({ page: p <= 1 ? null : p })}
      />

      <UserDetailDrawer user={detailUser} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </AdminPageLayout>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}

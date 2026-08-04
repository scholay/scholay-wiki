import { useEffect, useState } from 'react';
import { AlertTriangle, Search, MoreHorizontal, Lock, Unlock, Trash2, ShieldCheck, Crown, Eye, Copy, UserCog, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useDebounce, useUrlState, usePatchUrlState } from '@/shared/hooks';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { useHasPermission, PERM, roleLabel, roleBadgeVariant } from '../permissions';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TimeCell } from '../components/TimeCell';
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

/** 后端 handler_admin_ops.go:48 硬拒绝冻结 admin / super_admin —— 前端同口径隐藏入口,
 *  别显示一个按下去必然 400 的按钮(operations 是可以冻的,后端只挡这两个角色)。 */
function canFreeze(u: AdminUser): boolean {
  return u.role !== 'admin' && u.role !== 'super_admin';
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

  const listQuery = useUserList({
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
  const { data, isLoading } = listQuery;

  const freeze = useFreezeUser();
  const unfreeze = useUnfreezeUser();
  const del = useDeleteUser();
  const batchDel = useBatchDeleteUsers();
  const updateRole = useUpdateUserRole();

  // 选中行 keys。
  // 🔴 **刻意不跨页保留**:DataTable 的批量条显示的是 `selectedKeys.size`(可能跨页),
  // 而传给 bulkActions 的 selectedRows 只从**当前页**过滤 —— 第 1 页选 5 个 + 第 2 页选 3 个时,
  // 顶部写「已选 8 项」、确认框写「批量删除 3 个用户?」、实际删 3 个,另外 5 个被静默丢弃。
  // 一个不可逆操作上两个数字打架,比"多点两次"危险得多。所以换页/换筛选一律清空选择。
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [page, debounced, role, status, tier, verified, createdFrom, createdTo, sortBy, sortOrder]);

  // 冻结原因收集(后端 reason 必填,见 useFreezeUser 的注释)
  const [freezeTarget, setFreezeTarget] = useState<AdminUser | null>(null);

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

  // 冻结 / 解冻拆两支:冻结必须先收原因(后端 required),解冻是恢复性操作直接执行。
  const handleUnfreeze = async (u: AdminUser) => {
    await apiToast(unfreeze.mutateAsync(u.id), {
      success: `已解冻 ${labelOf(u)}`,
      failure: '解冻失败',
    });
  };

  const submitFreeze = async (reason: string) => {
    const u = freezeTarget;
    if (!u) return;
    const ok = await apiToast(freeze.mutateAsync({ id: u.id, reason }), {
      success: `已冻结 ${labelOf(u)}`,
      failure: '冻结失败',
    });
    if (ok !== null) setFreezeTarget(null);
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

  // 走 copyToClipboard(带 execCommand 兜底)并**按真实结果**提示 ——
  // 线上后台是明文 HTTP,`navigator.clipboard` 是 undefined,旧写法的 `?.` 让它变成静默 no-op,
  // 绿色 toast 照弹但粘出来是空的。
  const copyId = async (u: AdminUser) => {
    const ok = await copyToClipboard(String(u.id));
    if (ok) toast.success(`已复制用户 ID #${u.id}`);
    else toast.error('复制失败,请手动选中复制');
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
    // 三列时间统一走 TimeCell:主显相对时间(「3 天前」),精确时刻挂 title。
    // 这三列存在的唯一理由就是回答"刚刚还是上个月",扫一列 `2026-08-01 09:12` 是答不出来的。
    {
      header: '注册时间',
      cell: (u) => <TimeCell value={u.created_at} className="text-12" />,
      width: 130,
      serverSortKey: 'created_at',
    },
    {
      header: '最后活跃',
      cell: (u) => <TimeCell value={u.last_active_at} className="text-12" />,
      width: 130,
      serverSortKey: 'last_active_at',
    },
    {
      header: '最后登录',
      cell: (u) => <TimeCell value={u.last_login_at} className="text-12" />,
      width: 130,
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
            {/* 冻结/解冻 —— 用户写操作,需 users.manage(运营看不到);
                admin / super_admin 后端硬拒(canFreeze),不显示必失败的按钮 */}
            {canManageUsers && (u.status === 2 || canFreeze(u)) && (
              <>
                <DropdownMenuSeparator />
                {u.status === 2 ? (
                  <DropdownMenuItem onSelect={() => handleUnfreeze(u)}>
                    <Unlock className="size-3.5 mr-2" />
                    解冻账号
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setFreezeTarget(u)}>
                    <Lock className="size-3.5 mr-2" />
                    冻结账号…
                  </DropdownMenuItem>
                )}
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
      // 🔴 接口挂了绝不能显示「共 0 个账号」—— 那是个会被当成经营结论的错数字。降级为「—」。
      description={`共 ${data ? data.total.toLocaleString() : '—'} 个账号 · 含管理员 · 可筛选 / 管会员 / 冻结 / 删除`}
      onRefresh={() => listQuery.refetch()}
      refreshing={listQuery.isFetching}
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
        // error 必须透传:不传的话请求失败 rows=undefined 会落进空态,
        // 后台就"斩钉截铁"地显示「没有符合条件的用户」—— 排查封号/工单时会直接判断错。
        error={listQuery.error}
        onRetry={() => listQuery.refetch()}
        emptyMessage="没有符合条件的用户"
        emptyDescription={hasFilter ? '当前筛选条件下没有命中任何账号。' : undefined}
        emptyAction={
          hasFilter ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              清除筛选
            </Button>
          ) : undefined
        }
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

      {/* 常驻挂载(open 由 target 决定)—— 绝不用 `{target && <Dialog open/>}`,
          那是"挂载条件 == open",Radix 的 body pointer-events 锁会泄漏成全站点击失灵。 */}
      <FreezeReasonDialog
        user={freezeTarget}
        pending={freeze.isPending}
        onCancel={() => setFreezeTarget(null)}
        onSubmit={submitFreeze}
      />
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

/**
 * 冻结原因弹窗 —— 后端 `FreezeUserRequest.Reason` 是 `required,min=1,max=255`,
 * 不填就是 400。原因落库到 `users.frozen_reason`,详情抽屉里能看到(用户申诉时的唯一依据),
 * 所以这里不是走个形式,写清楚"为什么封"是有下游消费者的。
 */
function FreezeReasonDialog({
  user,
  pending,
  onCancel,
  onSubmit,
}: {
  user: AdminUser | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const uid = user?.id;
  useEffect(() => {
    setReason('');
  }, [uid]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 255;
  const name = user ? user.username || user.email || user.phone || `#${user.id}` : '';

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-brand-red" />
            冻结账号 {name}?
          </DialogTitle>
          <DialogDescription>
            该用户会立即被强制下线(已签发 token 当场吊销)且无法再登录。冻结原因会记入账号档案,
            用户申诉时后台可查。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="freeze-reason" className="text-12 text-muted-foreground">
            冻结原因(必填,最多 255 字)
          </Label>
          {/* placeholder 里别写 `#` + 三位十六进制(如工单号 #123):
              设计护栏的「硬编码 hex」正则会把它当成颜色,构建期直接红 */}
          <Input
            id="freeze-reason"
            value={reason}
            autoFocus
            maxLength={255}
            placeholder="如:批量注册小号刷邀请奖励(工单 No.1024)"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && !pending) onSubmit(trimmed);
            }}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!valid || pending}
            onClick={() => onSubmit(trimmed)}
          >
            冻结账号
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

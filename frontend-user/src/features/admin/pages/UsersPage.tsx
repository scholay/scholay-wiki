import { useEffect, useState } from 'react';
import { Search, Trash2, Crown, Eye, UserCog } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { useDebounce, useUrlState, usePatchUrlState } from '@/shared/hooks';
import {
  useHasPermission,
  PERM,
  roleLabel,
  roleBadgeVariant,
} from '../permissions';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import {
  LAST_ACTIVE_LEGACY_HINT,
  TimeCell,
} from '../components/TimeCell';
import { UserMetricsPanel } from '../components/UserMetricsPanel';
import { UserCell } from '../components/UserCell';
import { useAdminUserDetail } from '../components/AdminUserDetailProvider';
import { UserActionsDrawer } from '../components/UserActionsDrawer';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useUserList,
  useBatchDeleteUsers,
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
    const active =
      !u.vip_expires_at || new Date(u.vip_expires_at).getTime() > Date.now();
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
  const { openUserDetail } = useAdminUserDetail();

  const listQuery = useUserList({
    page,
    page_size: 20,
    q: debounced || undefined,
    role: role || undefined,
    status: status ? Number(status) : undefined,
    tier: tier || undefined,
    email_verified:
      verified === '1' || verified === '0'
        ? (verified as '0' | '1')
        : undefined,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
    sort_by: sortBy as UserListParams['sort_by'],
    sort_order: sortOrder as UserListParams['sort_order'],
  });
  const { data, isLoading } = listQuery;

  const batchDel = useBatchDeleteUsers();

  // 选中行 keys。
  // 🔴 **刻意不跨页保留**:DataTable 的批量条显示的是 `selectedKeys.size`(可能跨页),
  // 而传给 bulkActions 的 selectedRows 只从**当前页**过滤 —— 第 1 页选 5 个 + 第 2 页选 3 个时,
  // 顶部写「已选 8 项」、确认框写「批量删除 3 个用户?」、实际删 3 个,另外 5 个被静默丢弃。
  // 一个不可逆操作上两个数字打架,比"多点两次"危险得多。所以换页/换筛选一律清空选择。
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [
    page,
    debounced,
    role,
    status,
    tier,
    verified,
    createdFrom,
    createdTo,
    sortBy,
    sortOrder,
  ]);

  // 只读详情由 AdminShell 的全局单例推屏承载；本页只保留写操作推屏。
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const openDetail = (user: AdminUser) => openUserDetail(user);
  const openActions = (user: AdminUser) => setActionUser(user);
  // 写操作失效列表 query 后，优先使用当前页的新快照。
  const drawerUser = actionUser
    ? (data?.users.find((candidate) => candidate.id === actionUser.id) ??
      actionUser)
    : null;

  const labelOf = (u: AdminUser) =>
    u.email || u.username || u.phone || `#${u.id}`;

  // 任一筛选/搜索生效时显示「重置」
  const hasFilter = !!(
    role ||
    status ||
    tier ||
    verified ||
    createdFrom ||
    createdTo ||
    keyword
  );
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

  const columns: Column<AdminUser>[] = [
    {
      header: '用户',
      cell: (u) => (
        <UserCell
          id={u.id}
          name={u.username}
          email={u.email}
          phone={u.phone}
          showContact
        />
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
        if (t === 'free')
          return <span className="text-12 text-faint">Free</span>;
        return (
          <span
            className={`inline-flex items-center gap-1 text-12 font-medium ${
              t === 'max' ? 'text-brand-red' : 'text-brand-amber'
            }`}
          >
            <Crown className="size-3.5" />
            {t === 'max' ? 'Max' : 'Pro'}
            {u.vip_expires_at && (
              <span className="font-normal text-faint">
                · {u.vip_expires_at.slice(0, 10)}
              </span>
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
          <Badge
            variant="outline"
            className="text-brand-green border-brand-green"
          >
            正常
          </Badge>
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
      header: <span title={LAST_ACTIVE_LEGACY_HINT}>最后活跃</span>,
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
      header: '操作',
      width: 170,
      align: 'right',
      cell: (user) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => openDetail(user)}
          >
            <Eye className="size-3.5" />
            详情
          </Button>
          {(canManageUsers || canAssignRole) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => openActions(user)}
            >
              <UserCog className="size-3.5" />
              操作
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="用户管理"
      // 🔴 接口挂了绝不能显示「共 0 个账号」—— 那是个会被当成经营结论的错数字。降级为「—」。
      description={`共 ${data ? data.total.toLocaleString() : '—'} 个账号 · 详情只读 · 用户操作独立管理`}
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
            onChange={(e) =>
              patch({ role: e.target.value || null, page: null })
            }
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
            onChange={(e) =>
              patch({ tier: e.target.value || null, page: null })
            }
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
            onChange={(e) =>
              patch({ status: e.target.value || null, page: null })
            }
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
            onChange={(e) =>
              patch({ email_verified: e.target.value || null, page: null })
            }
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
            onChange={(e) =>
              patch({ created_from: e.target.value || null, page: null })
            }
            className="h-8 w-36"
          />
        </FilterField>
        <FilterField label="注册至">
          <Input
            type="date"
            value={createdTo}
            onChange={(e) =>
              patch({ created_to: e.target.value || null, page: null })
            }
            className="h-8 w-36"
          />
        </FilterField>
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 text-faint"
          >
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
        emptyDescription={
          hasFilter ? '当前筛选条件下没有命中任何账号。' : undefined
        }
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

      <UserActionsDrawer
        user={drawerUser}
        open={!!actionUser}
        onOpenChange={(nextOpen) => !nextOpen && setActionUser(null)}
      />
    </AdminPageLayout>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}

import { Search, MoreHorizontal, Lock, Unlock, Trash2, ShieldCheck } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useDebounce } from '@/shared/hooks';
import { useAuthStore } from '@/stores/auth.store';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { UserMetricsPanel } from '../components/UserMetricsPanel';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useUrlState } from '@/shared/hooks';
import { useState } from 'react';
import {
  useUserList,
  useFreezeUser,
  useUnfreezeUser,
  useDeleteUser,
  useBatchDeleteUsers,
  useUpdateUserRole,
  type AdminUser,
} from '../api/users';

export function UsersPage() {
  const [keyword, setKeyword] = useUrlState('q', '');
  const [page, setPage] = useUrlState('page', 1, Number);
  const debounced = useDebounce(keyword, 300);
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const isSuper = useAuthStore((s) => s.user?.role === 'super_admin');

  const { data, isLoading } = useUserList({
    page,
    page_size: 20,
    q: debounced || undefined,
  });

  const freeze = useFreezeUser();
  const unfreeze = useUnfreezeUser();
  const del = useDeleteUser();
  const batchDel = useBatchDeleteUsers();
  const updateRole = useUpdateUserRole();

  // 选中行 keys —— 切页/查询会保留(用户跨页选择常见)
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const labelOf = (u: AdminUser) => u.email || u.username || u.phone || `#${u.id}`;

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

  const handleRoleChange = async (u: AdminUser, role: AdminUser['role']) => {
    const ok = await confirm({
      title: `将 ${labelOf(u)} 的角色改为 ${role}?`,
      description: role === 'admin' ? '该用户将拥有全部管理员权限。' : undefined,
      danger: role === 'admin',
      confirmText: '更新角色',
    });
    if (!ok) return;
    await apiToast(updateRole.mutateAsync({ id: u.id, role }), {
      success: '角色已更新',
      failure: '角色更新失败',
    });
  };

  const columns: Column<AdminUser>[] = [
    {
      header: '用户',
      cell: (u) => (
        <div className="flex flex-col">
          <span className="text-foreground font-bold">
            {u.username || u.email?.split('@')[0] || u.phone || `User #${u.id}`}
          </span>
          <span className="text-xs text-faint">{u.email || u.phone || '—'}</span>
        </div>
      ),
      sortKey: (u) => u.email || u.username || '',
    },
    {
      header: '角色',
      cell: (u) => (
        <Badge variant={u.role === 'super_admin' ? 'destructive' : u.role === 'admin' ? 'default' : 'muted'}>
          {u.role === 'super_admin' ? '超级管理员' : u.role === 'admin' ? '管理员' : '用户'}
        </Badge>
      ),
      width: 110,
      sortKey: (u) => u.role,
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
      sortKey: (u) => u.status,
    },
    {
      header: '注册时间',
      cell: (u) => <span className="text-xs text-muted-foreground">{u.created_at?.slice(0, 10)}</span>,
      width: 110,
      sortKey: (u) => u.created_at || '',
    },
    {
      header: '最后登录',
      cell: (u) => (
        <span className="text-xs text-muted-foreground">{u.last_login_at?.slice(0, 16).replace('T', ' ') || '—'}</span>
      ),
      width: 150,
      sortKey: (u) => u.last_login_at || '',
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
            {/* super_admin 才能调角色 —— 与后端 SuperAdminAuthMiddleware 一致,UI 提前拦截避免 403 */}
            {isSuper && (
              <>
                <DropdownMenuSeparator />
                {u.role !== 'admin' && (
                  <DropdownMenuItem onSelect={() => handleRoleChange(u, 'admin')}>
                    <ShieldCheck className="size-3.5 mr-2" />
                    提升为管理员
                  </DropdownMenuItem>
                )}
                {u.role === 'admin' && (
                  <DropdownMenuItem onSelect={() => handleRoleChange(u, 'user')}>
                    <ShieldCheck className="size-3.5 mr-2" />
                    降为普通用户
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleDelete(u)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5 mr-2" />
              删除账号
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="用户管理"
      description={`共 ${data?.total ?? 0} 个账号 · 可冻结、解冻、删除`}
      actions={
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-faint" />
          <Input
            placeholder="搜索邮箱 / 用户名"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            className="pl-8 h-8 w-64"
          />
        </div>
      }
    >
      <UserMetricsPanel />

      <DataTable
        columns={columns}
        rows={data?.users}
        loading={isLoading}
        selection={{
          selectedKeys: selected,
          onSelectionChange: setSelected,
          getKey: (u) => u.id,
        }}
        bulkActions={(rows) => (
          <Button
            size="sm"
            variant="destructive"
            disabled={batchDel.isPending}
            onClick={() => handleBatchDelete(rows)}
          >
            <Trash2 className="size-3.5" />
            批量删除
          </Button>
        )}
      />

      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />
    </AdminPageLayout>
  );
}

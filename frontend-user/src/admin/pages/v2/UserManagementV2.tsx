/**
 * UserManagement v2 — shadcn/ui + Tailwind 重写版
 *
 * 设计原则:
 *   1. 信息架构清晰: 统计 / 工具栏 / 表格 / 详情 分层
 *   2. URL params 同步搜索/筛选/分页 — 切走再回来不丢状态
 *   3. 服务端 search/filter (q/status/role) — 大数据下也准确
 *   4. 批量选择 + 服务端批量删除 (单失败不阻断)
 *   5. 三态统一: Skeleton / 友好空状态 / Toast 错误
 *   6. 角色 UI 由后端 permissions 驱动 (不硬编码 role 字符串)
 *   7. 危险操作必须双重 Dialog 确认
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  MoreHorizontal,
  Trash2,
  Eye,
  ShieldCheck,
  ShieldOff,
  Users,
  UserPlus,
  Activity,
  RefreshCw,
  Lock,
  Unlock,
  Tag as TagIcon,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Skeleton } from '../../components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { DangerConfirmDialog } from '../../components/ui/danger-confirm-dialog';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

import { adminAPI } from '../../services/api';
import { UserDetailSheet } from '../../components/v2/UserDetailSheet';

interface UserRow {
  id: number;
  username?: string;
  email?: string;
  phone?: string;
  status?: number;
  role?: string;
  last_login_at?: string;
  created_at?: string;
}

interface ProfileRow {
  id: number;
  username: string;
  role?: string;
  permissions?: string[];
  is_super_admin?: boolean;
}

interface BatchDeleteResult {
  success_count: number;
  failed_count: number;
  failed?: Array<{ id: number; reason: string }>;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatDate(value?: string): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '—';
  }
}

function StatusBadge({ status }: { status?: number }) {
  if (status === 1) return <Badge variant="success">活跃</Badge>;
  if (status === 0) return <Badge variant="secondary">未激活</Badge>;
  if (status === 2) return <Badge variant="warning">已冻结</Badge>;
  return <Badge variant="destructive">禁用</Badge>;
}

function RoleBadge({ role }: { role?: string }) {
  if (role === 'super_admin') return <Badge>超级管理员</Badge>;
  if (role === 'admin') return <Badge variant="secondary">管理员</Badge>;
  return <Badge variant="outline">用户</Badge>;
}

export default function UserManagementV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // ---- URL params 同步状态 ----
  const page = Number(searchParams.get('page') || 1);
  const pageSize = Number(searchParams.get('size') || 20);
  const sortBy = searchParams.get('sortBy') || 'last_login_at';
  const sortOrder = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
  const keyword = searchParams.get('q') || '';
  const filterStatus = searchParams.get('status') || 'all';
  const filterRole = searchParams.get('role') || 'all';
  const filterTagId = searchParams.get('tag') || 'all';

  // 输入框本地 state(防抖后写 URL,避免每个字符都打一次接口)
  const [keywordInput, setKeywordInput] = useState(keyword);
  useEffect(() => {
    setKeywordInput(keyword);
  }, [keyword]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (keywordInput === keyword) return;
      const next = new URLSearchParams(searchParams);
      if (keywordInput) next.set('q', keywordInput);
      else next.delete('q');
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordInput]);

  function patchParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  // ---- 数据获取 ----
  const profileQuery = useQuery({
    queryKey: ['admin', 'profile'],
    queryFn: async () => {
      const r = await adminAPI.getProfile();
      return r.data?.data as ProfileRow | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
  const perms = profileQuery.data?.permissions ?? [];
  const canDelete = perms.includes('users.delete');
  const canAssignRole = perms.includes('users.role.assign');

  const statsQuery = useQuery({
    queryKey: ['admin', 'userStats'],
    queryFn: async () => {
      const r = await adminAPI.getUserStatistics();
      return r.data?.data as Record<string, number> | undefined;
    },
    staleTime: 30_000,
  });

  // 标签字典(用于筛选 + 批量打标签)
  const tagsQuery = useQuery({
    queryKey: ['admin', 'user-tags'],
    queryFn: async () => {
      const r = await adminAPI.listUserTags();
      const data = r.data?.data;
      return (Array.isArray(data) ? data : data?.items || []) as Array<{
        id: number;
        name: string;
        color: string;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const usersQuery = useQuery({
    queryKey: [
      'admin',
      'users',
      { page, pageSize, sortBy, sortOrder, q: keyword, status: filterStatus, role: filterRole, tag: filterTagId },
    ],
    queryFn: async () => {
      const r = await adminAPI.getUserList({
        page,
        pageSize,
        sortBy,
        sortOrder,
        q: keyword || undefined,
        status: filterStatus === 'all' ? undefined : filterStatus,
        role: filterRole === 'all' ? undefined : filterRole,
        tagId: filterTagId === 'all' ? undefined : Number(filterTagId),
      });
      const data = r.data?.data || {};
      return {
        items: (data.users || data.items || []) as UserRow[],
        total: (data.total ?? 0) as number,
      };
    },
    placeholderData: keepPreviousData,
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---- 批量选择 ----
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const lastPageKey = useRef(`${page}|${pageSize}|${keyword}|${filterStatus}|${filterRole}`);
  useEffect(() => {
    const k = `${page}|${pageSize}|${keyword}|${filterStatus}|${filterRole}`;
    if (lastPageKey.current !== k) {
      setSelectedIds(new Set());
      lastPageKey.current = k;
    }
  }, [page, pageSize, keyword, filterStatus, filterRole]);

  // 可选行 = 不是自己 (任何用户都能打标签;批量删除时再二次过滤)
  const selectableOnPage = items.filter((u) => profileQuery.data?.id !== u.id);
  const allOnPageSelected =
    selectableOnPage.length > 0 && selectableOnPage.every((u) => selectedIds.has(u.id));
  const someOnPageSelected = selectableOnPage.some((u) => selectedIds.has(u.id));

  function toggleAll() {
    const next = new Set(selectedIds);
    if (allOnPageSelected) selectableOnPage.forEach((u) => next.delete(u.id));
    else selectableOnPage.forEach((u) => next.add(u.id));
    setSelectedIds(next);
  }
  function toggleOne(id: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  // ---- 删除 ----
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'single' | 'batch';
    user?: UserRow;
    count?: number;
  } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]): Promise<BatchDeleteResult> => {
      if (ids.length === 1) {
        await adminAPI.deleteUser(ids[0]);
        return { success_count: 1, failed_count: 0 };
      }
      const r = await adminAPI.batchDeleteUsers(ids);
      return (r.data?.data || { success_count: 0, failed_count: 0 }) as BatchDeleteResult;
    },
    onSuccess: (result, ids) => {
      const total = ids.length;
      if (result.failed_count === 0) {
        toast.success(`已删除 ${result.success_count} 个用户`);
      } else if (result.success_count === 0) {
        toast.error(`全部失败 (${total}):${result.failed?.[0]?.reason || ''}`);
      } else {
        toast.warning(
          `部分成功:${result.success_count}/${total} 删除,${result.failed_count} 个失败`,
        );
      }
      setDeleteTarget(null);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'userStats'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || '删除失败');
    },
  });

  // ---- 角色变更 ----
  const [roleTarget, setRoleTarget] = useState<{
    user: UserRow;
    nextRole: 'admin' | 'user';
  } | null>(null);

  const roleMutation = useMutation({
    mutationFn: async (input: { id: number; role: 'admin' | 'user' }) => {
      await adminAPI.updateUserRole(input.id, input.role);
    },
    onSuccess: (_, input) => {
      toast.success(input.role === 'admin' ? '已设为管理员' : '已取消管理员');
      setRoleTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || '操作失败');
    },
  });

  // ---- 冻结 / 解冻 ----
  const [freezeTarget, setFreezeTarget] = useState<UserRow | null>(null);
  const [freezeReason, setFreezeReason] = useState('');

  const freezeMutation = useMutation({
    mutationFn: async (input: { id: number; reason: string }) => {
      await adminAPI.freezeUser(input.id, input.reason);
    },
    onSuccess: () => {
      toast.success('已冻结,该账号会被强制下线');
      setFreezeTarget(null);
      setFreezeReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '操作失败'),
  });

  const unfreezeMutation = useMutation({
    mutationFn: async (id: number) => {
      await adminAPI.unfreezeUser(id);
    },
    onSuccess: () => {
      toast.success('已解冻');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '操作失败'),
  });

  // ---- 批量打/取消标签 ----
  const [batchTagDialog, setBatchTagDialog] = useState<{
    action: 'assign' | 'unassign';
  } | null>(null);
  const [batchTagId, setBatchTagId] = useState<number | null>(null);
  const batchTagMutation = useMutation({
    mutationFn: async (input: { tagId: number; action: 'assign' | 'unassign' }) => {
      await adminAPI.assignUserTags({
        user_ids: Array.from(selectedIds),
        tag_id: input.tagId,
        action: input.action,
      });
    },
    onSuccess: (_, input) => {
      toast.success(input.action === 'assign' ? `已为 ${selectedIds.size} 位用户打标签` : '已取消标签');
      setBatchTagDialog(null);
      setBatchTagId(null);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-tags'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '操作失败'),
  });

  return (
    <div className="space-y-6 p-6">
      {/* 顶部 Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看用户列表、调整权限、删除账号
            {profileQuery.data?.is_super_admin && (
              <Badge variant="outline" className="ml-2">
                超级管理员
              </Badge>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            usersQuery.refetch();
            statsQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="在线用户"
          value={statsQuery.data?.online_users ?? 0}
          icon={<Activity className="h-4 w-4 text-emerald-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="今日新增"
          value={statsQuery.data?.today_registrations ?? 0}
          icon={<UserPlus className="h-4 w-4 text-blue-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="本周新增"
          value={statsQuery.data?.week_registrations ?? 0}
          icon={<UserPlus className="h-4 w-4 text-violet-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="本月新增"
          value={statsQuery.data?.month_registrations ?? 0}
          icon={<Users className="h-4 w-4 text-amber-500" />}
          loading={statsQuery.isLoading}
        />
      </div>

      {/* 主面板 */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>用户列表</CardTitle>
              <CardDescription>共 {total} 条记录</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索 用户名 / 邮箱 / 手机"
                  className="w-64 pl-8"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => patchParams({ status: v, page: '1' })}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="1">活跃</SelectItem>
                  <SelectItem value="0">未激活</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRole} onValueChange={(v) => patchParams({ role: v, page: '1' })}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="user">用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="super_admin">超级管理员</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTagId} onValueChange={(v) => patchParams({ tag: v, page: '1' })}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="标签" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部标签</SelectItem>
                  {(tagsQuery.data || []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 批量操作条 */}
          {selectedIds.size > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-md border bg-primary/5 px-4 py-2 text-sm">
              <span>已选中 {selectedIds.size} 项</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                  取消选择
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchTagDialog({ action: 'assign' })}
                >
                  <TagIcon className="h-4 w-4" />
                  打标签
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchTagDialog({ action: 'unassign' })}
                >
                  取消标签
                </Button>
                {canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: 'batch', count: selectedIds.size })}
                  >
                    <Trash2 className="h-4 w-4" />
                    批量删除
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      allOnPageSelected
                        ? true
                        : someOnPageSelected
                        ? ('indeterminate' as any)
                        : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label="全选当前页"
                  />
                </TableHead>
                <TableHead>用户</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() =>
                    patchParams({
                      sortBy: 'created_at',
                      order: sortBy === 'created_at' && sortOrder === 'desc' ? 'asc' : 'desc',
                    })
                  }
                >
                  注册时间 {sortBy === 'created_at' && (sortOrder === 'desc' ? '↓' : '↑')}
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() =>
                    patchParams({
                      sortBy: 'last_login_at',
                      order:
                        sortBy === 'last_login_at' && sortOrder === 'desc' ? 'asc' : 'desc',
                    })
                  }
                >
                  最后登录{' '}
                  {sortBy === 'last_login_at' && (sortOrder === 'desc' ? '↓' : '↑')}
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {keyword || filterStatus !== 'all' || filterRole !== 'all'
                      ? '没有符合条件的用户'
                      : '暂无用户数据'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((u) => {
                  const isSelf = profileQuery.data?.id === u.id;
                  const targetRole = u.role || 'user';
                  const showPromote = canAssignRole && targetRole === 'user';
                  const showDemote = canAssignRole && targetRole === 'admin';
                  const allowDelete = canDelete && isUserDeletable(u, profileQuery.data?.id);
                  const allowSelect = !isSelf;
                  return (
                    <TableRow
                      key={u.id}
                      data-state={selectedIds.has(u.id) ? 'selected' : undefined}
                    >
                      <TableCell>
                        {allowSelect ? (
                          <Checkbox
                            checked={selectedIds.has(u.id)}
                            onCheckedChange={(v) => toggleOne(u.id, !!v)}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {u.username || u.email || `#${u.id}`}
                            {isSelf && (
                              <Badge variant="outline" className="ml-2">
                                我
                              </Badge>
                            )}
                          </span>
                          {u.email && (
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.last_login_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="操作">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setDetailUserId(u.id)}>
                              <Eye />
                              查看详情
                            </DropdownMenuItem>
                            {/* 冻结 / 解冻 — 仅普通 user(管理员/超管不能冻结) */}
                            {(u.role || 'user') === 'user' && u.status !== 2 && (
                              <DropdownMenuItem onSelect={() => setFreezeTarget(u)}>
                                <Lock className="text-amber-600" />
                                冻结账号
                              </DropdownMenuItem>
                            )}
                            {(u.role || 'user') === 'user' && u.status === 2 && (
                              <DropdownMenuItem
                                onSelect={() => unfreezeMutation.mutate(u.id)}
                              >
                                <Unlock className="text-emerald-600" />
                                解冻账号
                              </DropdownMenuItem>
                            )}
                            {showPromote && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setRoleTarget({ user: u, nextRole: 'admin' })
                                }
                              >
                                <ShieldCheck className="text-emerald-600" />
                                设为管理员
                              </DropdownMenuItem>
                            )}
                            {showDemote && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setRoleTarget({ user: u, nextRole: 'user' })
                                }
                              >
                                <ShieldOff className="text-amber-600" />
                                取消管理员
                              </DropdownMenuItem>
                            )}
                            {allowDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() =>
                                    setDeleteTarget({ type: 'single', user: u })
                                  }
                                >
                                  <Trash2 />
                                  删除用户
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* 分页器 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => patchParams({ size: v, page: '1' })}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>条</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              第 {page} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || usersQuery.isFetching}
              onClick={() => patchParams({ page: String(page - 1) })}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || usersQuery.isFetching}
              onClick={() => patchParams({ page: String(page + 1) })}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {/* 单个删除 — 普通确认 */}
      <ConfirmDialog
        open={!!deleteTarget && deleteTarget.type === 'single'}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除该用户?"
        description={
          deleteTarget?.user
            ? `将删除 "${deleteTarget.user.username || deleteTarget.user.email}"。该操作不可撤销,关联会话/订阅/用量等数据将一并清理。`
            : ''
        }
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget?.user) deleteMutation.mutate([deleteTarget.user.id]);
        }}
      />

      {/* 批量删除 — 强确认 */}
      <DangerConfirmDialog
        open={!!deleteTarget && deleteTarget.type === 'batch'}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`批量删除 ${deleteTarget?.count ?? 0} 个用户`}
        description={
          <>
            将<strong className="text-destructive">永久删除</strong> {deleteTarget?.count} 个用户的账号、会话、订阅、用量记录,
            操作不可撤销。请谨慎确认勾选范围。
          </>
        }
        confirmWord="DELETE"
        confirmText="确认批量删除"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(Array.from(selectedIds))}
      />

      {/* 角色变更 Dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleTarget?.nextRole === 'admin' ? '设为管理员?' : '取消管理员权限?'}
            </DialogTitle>
            <DialogDescription>
              用户 "{roleTarget?.user.username || roleTarget?.user.email}"{' '}
              {roleTarget?.nextRole === 'admin'
                ? '将获得后台管理权限(除角色分配外)。'
                : '将被取消管理员权限,降级为普通用户。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              取消
            </Button>
            <Button
              disabled={roleMutation.isPending}
              onClick={() => {
                if (roleTarget) {
                  roleMutation.mutate({
                    id: roleTarget.user.id,
                    role: roleTarget.nextRole,
                  });
                }
              }}
            >
              {roleMutation.isPending ? '处理中…' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 冻结账号 Dialog */}
      <Dialog
        open={!!freezeTarget}
        onOpenChange={(o) => !o && (setFreezeTarget(null), setFreezeReason(''))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>冻结账号</DialogTitle>
            <DialogDescription>
              将冻结 "{freezeTarget?.username || freezeTarget?.email}" 的账号,
              该用户立即被强制下线,无法再登录。<br />
              <span className="text-emerald-700">解冻是可恢复的,不会删除任何数据。</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>冻结原因 *</Label>
            <Input
              placeholder="例:多次违规发送营销内容"
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">原因会写入审计日志,管理员可查</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFreezeTarget(null);
                setFreezeReason('');
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!freezeReason.trim() || freezeMutation.isPending}
              onClick={() =>
                freezeTarget &&
                freezeMutation.mutate({ id: freezeTarget.id, reason: freezeReason.trim() })
              }
            >
              {freezeMutation.isPending ? '冻结中…' : '确认冻结'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量打/取消标签 */}
      <Dialog
        open={!!batchTagDialog}
        onOpenChange={(o) => {
          if (!o) {
            setBatchTagDialog(null);
            setBatchTagId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {batchTagDialog?.action === 'assign' ? '批量打标签' : '批量取消标签'}
            </DialogTitle>
            <DialogDescription>
              对选中的 <strong>{selectedIds.size}</strong> 位用户
              {batchTagDialog?.action === 'assign' ? ' 添加 ' : ' 移除 '}
              一个标签
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>选择标签 *</Label>
            <Select
              value={batchTagId ? String(batchTagId) : ''}
              onValueChange={(v) => setBatchTagId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="点击选择" />
              </SelectTrigger>
              <SelectContent>
                {(tagsQuery.data || []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.color as any}>{t.name}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              没有合适的标签?去
              <a className="ml-1 text-primary hover:underline" href="/admin/user-tags">
                标签管理
              </a>
              创建
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchTagDialog(null)}>
              取消
            </Button>
            <Button
              disabled={!batchTagId || batchTagMutation.isPending}
              onClick={() =>
                batchTagId &&
                batchTagDialog &&
                batchTagMutation.mutate({ tagId: batchTagId, action: batchTagDialog.action })
              }
            >
              {batchTagMutation.isPending
                ? '处理中…'
                : batchTagDialog?.action === 'assign'
                ? '确认打标签'
                : '确认取消标签'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 用户详情抽屉 */}
      <UserDetailSheet userId={detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}

function isUserDeletable(u: UserRow, selfId?: number): boolean {
  if (selfId && u.id === selfId) return false;
  const r = u.role || 'user';
  return r !== 'admin' && r !== 'super_admin';
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          )}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}

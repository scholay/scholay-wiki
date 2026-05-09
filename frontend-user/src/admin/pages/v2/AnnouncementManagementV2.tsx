/**
 * AnnouncementManagement v2 — 全站公告 / Banner / 弹窗
 *
 * 用法:
 *   - 维护通知:type=maintenance_note + severity=warning,配合维护模式开关
 *   - 节日活动:type=banner + 设置 starts_at / ends_at,自动上下线
 *   - 强制弹窗:type=popup + dismissable=0
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, Power, Megaphone } from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

interface Announcement {
  id: number;
  type: 'banner' | 'popup' | 'maintenance_note';
  title: string;
  content: string;
  link_url?: string;
  link_text?: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
  target_audience: 'all' | 'logged_in' | 'paid';
  dismissable: number;
  starts_at?: string;
  ends_at?: string;
  is_active: number;
  priority: number;
  created_at: string;
}

interface FormState extends Partial<Announcement> {
  editing?: boolean;
}

function emptyForm(): FormState {
  return {
    type: 'banner',
    title: '',
    content: '',
    link_url: '',
    link_text: '',
    severity: 'info',
    target_audience: 'all',
    dismissable: 1,
    starts_at: '',
    ends_at: '',
    is_active: 1,
    priority: 0,
  };
}

const SEVERITY_VARIANTS: Record<string, any> = {
  info: 'default',
  warning: 'warning',
  danger: 'destructive',
  success: 'success',
};

const TYPE_LABELS: Record<string, string> = {
  banner: '顶部横幅',
  popup: '弹窗',
  maintenance_note: '维护通知',
};

export default function AnnouncementManagementV2() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: async () => {
      const r = await adminAPI.listAnnouncements({ page: 1, page_size: 100 });
      return ((r.data?.data?.items || []) as Announcement[]);
    },
    placeholderData: keepPreviousData,
  });

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const data = {
        type: input.type,
        title: input.title,
        content: input.content,
        link_url: input.link_url || '',
        link_text: input.link_text || '',
        severity: input.severity || 'info',
        target_audience: input.target_audience || 'all',
        dismissable: input.dismissable ?? 1,
        is_active: input.is_active ?? 1,
        priority: input.priority ?? 0,
        starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
        ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
      };
      if (input.editing && input.id) {
        await adminAPI.updateAnnouncement(input.id, data);
      } else {
        await adminAPI.createAnnouncement(data);
      }
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已发布');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '操作失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (a: Announcement) => {
      await adminAPI.updateAnnouncement(a.id, { ...a, is_active: a.is_active ? 0 : 1 });
    },
    onSuccess: () => {
      toast.success('已切换');
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: () => toast.error('操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deleteAnnouncement(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: () => toast.error('删除失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const items = listQuery.data ?? [];

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    if (!form.title?.trim() || !form.content?.trim()) {
      toast.error('标题和内容必填');
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <PageLayout
      title="公告 / Banner"
      description="全站公告 · 节日横幅 · 维护通知 · 弹窗,可定时上下线"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" />
            新建公告
          </Button>
        </>
      }
    >
      <SectionCard
        title="公告列表"
        description={`共 ${items.length} 条`}
        bodyPadded={false}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">类型</TableHead>
              <TableHead>标题 / 内容</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-44">生效时间</TableHead>
              <TableHead className="w-20">受众</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={<Megaphone />}
                    title="暂无公告"
                    description="点击右上角新建,可设置定时上下线"
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[a.type] || a.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Badge variant={SEVERITY_VARIANTS[a.severity] || 'default'}>
                        {a.severity}
                      </Badge>
                      {a.title}
                    </div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {a.content}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.is_active ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.starts_at ? fmt(a.starts_at) : '立即'} → {a.ends_at ? fmt(a.ends_at) : '不下线'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{audienceLabel(a.target_audience)}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>操作</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setForm({ ...a, editing: true })}>
                          <Pencil />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleMutation.mutate(a)}>
                          <Power />
                          {a.is_active ? '停用' : '启用'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(a)}
                        >
                          <Trash2 />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 编辑/新建 Dialog */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.editing ? '编辑公告' : '新建公告'}</DialogTitle>
            <DialogDescription>设置展示时间后,公告会自动上下线</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={submit} className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>类型</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banner">顶部横幅</SelectItem>
                      <SelectItem value="popup">弹窗</SelectItem>
                      <SelectItem value="maintenance_note">维护通知</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>严重度</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">info (蓝)</SelectItem>
                      <SelectItem value="success">success (绿)</SelectItem>
                      <SelectItem value="warning">warning (黄)</SelectItem>
                      <SelectItem value="danger">danger (红)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>受众</Label>
                  <Select value={form.target_audience} onValueChange={(v) => setForm({ ...form, target_audience: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有人</SelectItem>
                      <SelectItem value="logged_in">登录用户</SelectItem>
                      <SelectItem value="paid">付费用户</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>标题</Label>
                <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>内容 (Markdown)</Label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.content || ''}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>跳转链接 (可选)</Label>
                  <Input value={form.link_url || ''} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>链接文字</Label>
                  <Input value={form.link_text || ''} onChange={(e) => setForm({ ...form, link_text: e.target.value })} placeholder="查看详情" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>开始时间(留空=立即)</Label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at?.slice(0, 16) || ''}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>结束时间(留空=不下线)</Label>
                  <Input
                    type="datetime-local"
                    value={form.ends_at?.slice(0, 16) || ''}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>优先级</Label>
                  <Input
                    type="number"
                    value={form.priority ?? 0}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">数大优先</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm">
                  <Switch
                    checked={!!form.dismissable}
                    onCheckedChange={(v) => setForm({ ...form, dismissable: v ? 1 : 0 })}
                  />
                  允许用户关闭
                </label>
                <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm">
                  <Switch
                    checked={!!form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v ? 1 : 0 })}
                  />
                  启用
                </label>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? '保存中…' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该公告?"
        description={`将删除 "${deleteTarget?.title}",删除后不可恢复(老用户记录的"已读"也会丢)。`}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}

function fmt(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function audienceLabel(a: string) {
  switch (a) {
    case 'all':
      return '所有人';
    case 'logged_in':
      return '已登录';
    case 'paid':
      return '付费';
    default:
      return a;
  }
}

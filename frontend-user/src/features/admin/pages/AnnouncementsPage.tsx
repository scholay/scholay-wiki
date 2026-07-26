import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  type Announcement,
  type AnnouncementSeverity,
  type AnnouncementType,
  type AnnouncementAudience,
} from '../api/announcements';

type EditMode = { kind: 'create' } | { kind: 'edit'; row: Announcement } | null;

const SEVERITY_LABEL: Record<AnnouncementSeverity, { text: string; variant: 'default' | 'warning' | 'destructive' }> = {
  info: { text: '提示', variant: 'default' },
  warning: { text: '警告', variant: 'warning' },
  critical: { text: '严重', variant: 'destructive' },
};

export function AnnouncementsPage() {
  const { data, isLoading } = useAnnouncements();
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const del = useDeleteAnnouncement();
  const [mode, setMode] = useState<EditMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleDelete = async (row: Announcement) => {
    const ok = await confirm({
      title: `删除公告「${row.title}」?`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<Announcement>[] = [
    { header: '标题', cell: (r) => <span className="font-bold text-foreground">{r.title}</span> },
    {
      header: '等级',
      width: 80,
      cell: (r) => <Badge variant={SEVERITY_LABEL[r.severity].variant}>{SEVERITY_LABEL[r.severity].text}</Badge>,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) =>
        r.is_active === 1 ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">已发布</Badge>
        ) : (
          <Badge variant="outline">草稿</Badge>
        ),
    },
    {
      header: '时段',
      width: 200,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.starts_at?.slice(0, 10) || '—'} → {r.ends_at?.slice(0, 10) || '长期'}
        </span>
      ),
    },
    {
      header: '',
      width: 110,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setMode({ kind: 'edit', row: r })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(r)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="公告"
      description={`共 ${data?.length ?? 0} 条 · 发布站内公告 / 全局横幅`}
      actions={
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新建公告
        </Button>
      }
    >
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <AnnouncementDialog
        mode={mode}
        onClose={() => setMode(null)}
        onSubmit={async (form) => {
          const ok =
            mode?.kind === 'create'
              ? await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' })
              : mode?.kind === 'edit'
              ? await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' })
              : null;
          if (ok !== null) setMode(null);
        }}
      />
    </AdminPageLayout>
  );
}

function AnnouncementDialog({
  mode,
  onClose,
  onSubmit,
}: {
  mode: EditMode;
  onClose: () => void;
  onSubmit: (form: Omit<Announcement, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => void;
}) {
  const isEdit = mode?.kind === 'edit';
  const initial = mode?.kind === 'edit' ? mode.row : undefined;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      {mode && (
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑公告' : '新建公告'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              title: String(fd.get('title') || ''),
              content: String(fd.get('content') || ''),
              type: (fd.get('type') as AnnouncementType) || 'banner',
              severity: (fd.get('severity') as AnnouncementSeverity) || 'info',
              target_audience: (fd.get('target_audience') as AnnouncementAudience) || 'all',
              link_url: String(fd.get('link_url') || '') || undefined,
              link_text: String(fd.get('link_text') || '') || undefined,
              dismissable: fd.get('dismissable') === 'on' ? 1 : 0,
              is_active: fd.get('is_active') === 'on' ? 1 : 0,
              priority: Number(fd.get('priority') || 0),
              starts_at: String(fd.get('starts_at') || '') || undefined,
              ends_at: String(fd.get('ends_at') || '') || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">标题</Label>
            <Input id="title" name="title" defaultValue={initial?.title} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="severity">严重程度</Label>
              <select
                id="severity"
                name="severity"
                defaultValue={initial?.severity || 'info'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="info">提示</option>
                <option value="warning">警告</option>
                <option value="critical">严重</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">类型</Label>
              <select
                id="type"
                name="type"
                defaultValue={initial?.type || 'banner'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="banner">横幅</option>
                <option value="modal">弹窗</option>
                <option value="toast">Toast</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target_audience">目标</Label>
              <select
                id="target_audience"
                name="target_audience"
                defaultValue={initial?.target_audience || 'all'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">全部</option>
                <option value="logged_in">已登录</option>
                <option value="guests">访客</option>
                <option value="admins">管理员</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="starts_at">开始</Label>
              <Input id="starts_at" name="starts_at" type="date" defaultValue={initial?.starts_at?.slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ends_at">结束</Label>
              <Input id="ends_at" name="ends_at" type="date" defaultValue={initial?.ends_at?.slice(0, 10)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">内容</Label>
            <textarea
              id="content"
              name="content"
              defaultValue={initial?.content}
              required
              rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="link_url">链接 URL(可选)</Label>
              <Input id="link_url" name="link_url" defaultValue={initial?.link_url} placeholder="/announcements/123" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link_text">链接文案</Label>
              <Input id="link_text" name="link_text" defaultValue={initial?.link_text} placeholder="查看详情" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 h-9">
              <input id="is_active" name="is_active" type="checkbox" defaultChecked={(initial?.is_active ?? 1) === 1} className="size-4" />
              <Label htmlFor="is_active" className="text-sm">立即发布</Label>
            </div>
            <div className="flex items-center gap-2 h-9">
              <input id="dismissable" name="dismissable" type="checkbox" defaultChecked={(initial?.dismissable ?? 1) === 1} className="size-4" />
              <Label htmlFor="dismissable" className="text-sm">用户可关闭</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-xs">优先级</Label>
              <Input id="priority" name="priority" type="number" defaultValue={initial?.priority ?? 0} className="h-8" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  );
}

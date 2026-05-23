import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import {
  useMessageTemplates,
  useCreateMessageTemplate,
  useUpdateMessageTemplate,
  type MessageTemplate,
} from '../api/messages';

type EditMode = { kind: 'create' } | { kind: 'edit'; row: MessageTemplate } | null;

export function MessageTemplatesPage() {
  const { data, isLoading } = useMessageTemplates();
  const create = useCreateMessageTemplate();
  const update = useUpdateMessageTemplate();
  const [mode, setMode] = useState<EditMode>(null);
  const apiToast = useApiToast();

  const columns: Column<MessageTemplate>[] = [
    { header: '名称', cell: (r) => <span className="font-bold text-foreground">{r.name}</span> },
    { header: '分类', width: 110, cell: (r) => <Badge variant="muted">{r.category}</Badge> },
    { header: '标题', cell: (r) => <span className="text-subtle">{r.title}</span> },
    {
      header: '更新时间',
      width: 140,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.updated_at?.slice(0, 16).replace('T', ' ')}</span>,
    },
    {
      header: '',
      width: 60,
      align: 'right',
      cell: (r) => (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setMode({ kind: 'edit', row: r })}>
          <Pencil className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="消息模板"
      description={`共 ${data?.length ?? 0} 条 · 站内消息、短信、邮件复用模板`}
      actions={
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新建模板
        </Button>
      }
    >
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'edit' ? '编辑模板' : '新建模板'}</DialogTitle>
          </DialogHeader>
          {mode && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const form = {
                  name: String(fd.get('name') || ''),
                  code: String(fd.get('code') || ''),
                  category: String(fd.get('category') || 'system') as MessageTemplate['category'],
                  title: String(fd.get('title') || ''),
                  content: String(fd.get('content') || ''),
                  is_active: true,
                };
                const ok =
                  mode.kind === 'create'
                    ? await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' })
                    : await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' });
                if (ok !== null) setMode(null);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">名称</Label>
                  <Input id="name" name="name" defaultValue={mode.kind === 'edit' ? mode.row.name : ''} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code(唯一标识)</Label>
                  <Input id="code" name="code" defaultValue={mode.kind === 'edit' ? mode.row.code : ''} required readOnly={mode.kind === 'edit'} placeholder="welcome_email" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="category">分类</Label>
                  <select
                    id="category"
                    name="category"
                    defaultValue={mode.kind === 'edit' ? mode.row.category : 'system'}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="system">系统</option>
                    <option value="notification">通知</option>
                    <option value="announcement">公告</option>
                    <option value="marketing">营销</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">标题</Label>
                <Input id="title" name="title" defaultValue={mode.kind === 'edit' ? mode.row.title : ''} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="content">内容(支持 {`{{var}}`} 占位)</Label>
                <textarea
                  id="content"
                  name="content"
                  rows={8}
                  defaultValue={mode.kind === 'edit' ? mode.row.content : ''}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMode(null)}>取消</Button>
                <Button type="submit">{mode.kind === 'edit' ? '保存' : '创建'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}

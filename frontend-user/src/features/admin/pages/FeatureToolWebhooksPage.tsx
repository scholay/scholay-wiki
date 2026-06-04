import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Send, ListChecks } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useApiToast } from '@/shared/hooks';
import { useConfirm } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import {
  useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useTestWebhook,
  useWebhookDeliveries, type Webhook,
} from '../api/feature-tools';

const ALL_EVENTS = ['created', 'updated', 'deleted'] as const;
const EVENT_LABEL: Record<string, string> = { created: '新增', updated: '修改', deleted: '删除' };

type EditMode = { kind: 'create' } | { kind: 'edit'; row: Webhook } | null;

export function FeatureToolWebhooksPage() {
  const { data, isLoading } = useWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const test = useTestWebhook();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<EditMode>(null);
  const [deliveriesId, setDeliveriesId] = useState<number | null>(null);

  const handleTest = async (row: Webhook) => {
    const res = await apiToast(test.mutateAsync(row.id), { success: '已投递测试事件', failure: '投递失败' });
    if (res) {
      // 结果细节也提示一下
    }
  };

  const handleDelete = async (row: Webhook) => {
    const ok = await confirm({ title: `删除 webhook「${row.name}」?`, danger: true, confirmText: '删除' });
    if (!ok) return;
    await apiToast(del.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<Webhook>[] = [
    { header: '名称', cell: (r) => <span className="font-bold text-foreground">{r.name}</span> },
    { header: 'URL', cell: (r) => <span className="block max-w-[18rem] truncate text-xs text-muted-foreground">{r.url}</span> },
    {
      header: '事件', width: 140,
      cell: (r) => (
        <div className="flex gap-1">
          {(r.events?.length ? r.events : ALL_EVENTS).map((e) => (
            <span key={e} className="rounded-sm bg-surface-2 px-1 text-2xs text-subtle">{EVENT_LABEL[e] ?? e}</span>
          ))}
        </div>
      ),
    },
    { header: '启用', width: 56, cell: (r) => (r.enabled ? <Badge variant="success">是</Badge> : <Badge variant="outline">否</Badge>) },
    {
      header: '最近', width: 130,
      cell: (r) => r.last_status ? (
        <span className={`text-2xs ${r.last_status === 'success' ? 'text-brand-green' : 'text-brand-red'}`}>
          {r.last_status === 'success' ? '成功' : '失败'} · {r.last_delivered_at?.slice(5, 16).replace('T', ' ')}
        </span>
      ) : <span className="text-2xs text-faint">—</span>,
    },
    {
      header: '', width: 130, align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" title="发送测试" onClick={() => handleTest(r)}><Send className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7" title="投递记录" onClick={() => setDeliveriesId(r.id)}><ListChecks className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setMode({ kind: 'edit', row: r })}><Pencil className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(r)}><Trash2 className="size-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="Webhook 同步"
      description="工具 增/改/删 时推送给下游 (discourse 等) 同步 · HMAC-SHA256 签名"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/tools"><ArrowLeft className="size-3.5" />返回列表</Link></Button>
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}><Plus className="size-3.5" />新建 webhook</Button>
        </div>
      }
    >
      <DataTable columns={columns} rows={data} loading={isLoading} emptyMessage="还没有 webhook 订阅" />

      <WebhookDialog
        mode={mode}
        onClose={() => setMode(null)}
        onSubmit={async (form) => {
          const ok = mode?.kind === 'create'
            ? await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' })
            : mode?.kind === 'edit'
              ? await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' })
              : null;
          if (ok !== null) setMode(null);
        }}
      />
      <DeliveriesDialog id={deliveriesId} onClose={() => setDeliveriesId(null)} />
    </AdminPageLayout>
  );
}

function WebhookDialog({ mode, onClose, onSubmit }: { mode: EditMode; onClose: () => void; onSubmit: (form: Partial<Webhook>) => void }) {
  if (!mode) return null;
  const isEdit = mode.kind === 'edit';
  const init = isEdit ? mode.row : undefined;
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? '编辑 webhook' : '新建 webhook'}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const events = ALL_EVENTS.filter((ev) => fd.get(`ev_${ev}`) === 'on');
            onSubmit({
              name: String(fd.get('name') || ''),
              url: String(fd.get('url') || ''),
              secret: String(fd.get('secret') || ''),
              events,
              enabled: fd.get('enabled') === 'on',
            });
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5"><Label className="text-xs">名称</Label><Input name="name" defaultValue={init?.name} required /></div>
          <div className="space-y-1.5"><Label className="text-xs">URL</Label><Input name="url" defaultValue={init?.url} placeholder="https://enterscholar.com/hooks/tools" required /></div>
          <div className="space-y-1.5"><Label className="text-xs">签名密钥 (可选, HMAC-SHA256)</Label><Input name="secret" defaultValue={init?.secret} placeholder="留空则不签名" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">订阅事件 (全不选 = 全部)</Label>
            <div className="flex gap-4">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name={`ev_${ev}`} defaultChecked={init ? (init.events?.length ? init.events.includes(ev) : true) : true} className="size-4" />
                  {EVENT_LABEL[ev]}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={init ? init.enabled : true} className="size-4" /> 启用
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = useWebhookDeliveries(id ?? undefined);
  if (!id) return null;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>投递记录</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
          {(data ?? []).length === 0 && <p className="text-sm text-faint">还没有投递记录</p>}
          {(data ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border-soft px-2.5 py-1.5 text-xs">
              <span className="flex items-center gap-2">
                <Badge variant={d.status === 'success' ? 'success' : 'destructive'}>{d.status === 'success' ? '成功' : '失败'}</Badge>
                <span className="text-subtle">{d.event}</span>
                {d.http_status ? <span className="text-faint">HTTP {d.http_status}</span> : null}
              </span>
              <span className="text-2xs text-faint">{d.created_at?.slice(0, 19).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

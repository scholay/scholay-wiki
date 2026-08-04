import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Pencil, Trash2, Send, ListChecks, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SecretInput } from '@/shared/ui/secret-input';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useApiToast } from '@/shared/hooks';
import { useConfirm, EmptyState, LoadingState, ResourceError } from '@/shared/components';
import { toApiError } from '@/shared/lib/http';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { TimeCell } from '../components/TimeCell';
import {
  useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useTestWebhook,
  useWebhookDeliveries, type Webhook,
} from '../api/feature-tools';

const ALL_EVENTS = ['created', 'updated', 'deleted'] as const;
const EVENT_LABEL: Record<string, string> = { created: '新增', updated: '修改', deleted: '删除' };

type EditMode = { kind: 'create' } | { kind: 'edit'; row: Webhook } | null;

/** 「发送测试」的本地结果 —— 常驻显示在对应行,不随 toast 一起消失 */
type TestOutcome = { ok: boolean; httpStatus: number; detail: string; at: string };

export function FeatureToolWebhooksPage() {
  const { data, isLoading, isFetching, error, refetch } = useWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const test = useTestWebhook();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<EditMode>(null);
  const [deliveriesId, setDeliveriesId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestOutcome>>({});

  /**
   * 🔴 这个按钮唯一的存在意义是回答「下游到底收没收到」,而后端只有**传输层**失败
   * (DNS / 超时 / SSRF 白名单拦截)才回错误码 —— 下游返回 401/404/500 时后端照样是
   * HTTP 200 + `http_status=500`。所以这里**不能**用 apiToast 的成功分支,必须自己按
   * http_status 分流,并且把下游响应体留在页面上(toast 三秒就没了,排查要的正是这段)。
   */
  const handleTest = async (row: Webhook) => {
    setTestingId(row.id);
    try {
      const res = await test.mutateAsync(row.id);
      const ok = res.http_status >= 200 && res.http_status < 300;
      const snippet = (res.response || '').slice(0, 200);
      setTestResults((m) => ({
        ...m,
        [row.id]: { ok, httpStatus: res.http_status, detail: snippet, at: new Date().toISOString() },
      }));
      if (ok) toast.success(`下游已接收 · HTTP ${res.http_status}`);
      else toast.error(`下游返回 HTTP ${res.http_status}${snippet ? `:${snippet}` : ''}`);
    } catch (err) {
      // 传输层失败 —— 后端把原因放在 message 里(连不上 / 超时 / 目标地址不在白名单)
      const msg = toApiError(err).message || '投递失败';
      setTestResults((m) => ({
        ...m,
        [row.id]: { ok: false, httpStatus: 0, detail: msg, at: new Date().toISOString() },
      }));
      apiToast.show(err, '投递失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (row: Webhook) => {
    const ok = await confirm({ title: `删除 webhook「${row.name}」?`, danger: true, confirmText: '删除' });
    if (!ok) return;
    await apiToast(del.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<Webhook>[] = [
    { header: '名称', cell: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { header: 'URL', cell: (r) => <span className="block max-w-[18rem] truncate text-12 text-muted-foreground" title={r.url}>{r.url}</span> },
    {
      header: '事件', width: 140,
      cell: (r) => (
        <div className="flex gap-1">
          {(r.events?.length ? r.events : ALL_EVENTS).map((e) => (
            <span key={e} className="rounded-4 bg-surface-2 px-1 text-12 text-subtle">{EVENT_LABEL[e] ?? e}</span>
          ))}
        </div>
      ),
    },
    { header: '启用', width: 56, cell: (r) => (r.enabled ? <Badge variant="success">是</Badge> : <Badge variant="outline">否</Badge>) },
    {
      header: '最近', width: 240,
      cell: (r) => {
        const t = testResults[r.id];
        return (
          <div className="flex flex-col gap-1">
            {r.last_status ? (
              <span className={`text-12 ${r.last_status === 'success' ? 'text-brand-green' : 'text-brand-red'}`}>
                {r.last_status === 'success' ? '成功' : '失败'} ·{' '}
                <TimeCell value={r.last_delivered_at} className="text-inherit" />
              </span>
            ) : (
              <span className="text-12 text-faint">—</span>
            )}
            {/* 失败原因此前全链路不可见:后台的极限是「失败」两个字,想知道是签名不对
                还是白名单拦了只能翻 docker logs。这里直接把 last_error 摆出来。 */}
            {r.last_error && (
              /* max-w 与本文件 URL 列同款 —— 表格是 auto layout,不夹一个上限的话
                 一条长错误串会把整列撑爆 */
              <span className="block max-w-[14rem] truncate text-12 text-brand-red" title={r.last_error}>
                {r.last_error}
              </span>
            )}
            {t && (
              <span
                className={`block max-w-[14rem] truncate text-12 ${t.ok ? 'text-brand-green' : 'text-brand-red'}`}
                title={`测试 ${t.httpStatus ? `HTTP ${t.httpStatus}` : '未送达'}:${t.detail || '(无响应体)'}`}
              >
                测试 {t.httpStatus ? `HTTP ${t.httpStatus}` : '未送达'}
                {t.detail ? ` · ${t.detail}` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: '', width: 130, align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost" size="icon" className="size-7" title="发送测试"
            disabled={testingId === r.id}
            onClick={() => handleTest(r)}
          >
            {testingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="投递记录" onClick={() => setDeliveriesId(r.id)}><ListChecks className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7" title="编辑" onClick={() => setMode({ kind: 'edit', row: r })}><Pencil className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" title="删除" onClick={() => handleDelete(r)}><Trash2 className="size-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="Webhook 同步"
      description="工具 增/改/删 时推送给下游 (discourse 等) 同步 · HMAC-SHA256 签名"
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/tools"><ArrowLeft className="size-3.5" />返回列表</Link></Button>
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}><Plus className="size-3.5" />新建 webhook</Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="还没有 webhook 订阅"
        emptyDescription="下游(discourse 等)需要同步工具增删改时,在这里新建一个订阅。"
        emptyAction={<Button size="sm" onClick={() => setMode({ kind: 'create' })}><Plus className="size-3.5" />新建 webhook</Button>}
      />

      <WebhookDialog
        mode={mode}
        pending={create.isPending || update.isPending}
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

function WebhookDialog({
  mode,
  pending,
  onClose,
  onSubmit,
}: {
  mode: EditMode;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: Partial<Webhook>) => void;
}) {
  const isEdit = mode?.kind === 'edit';
  const init = mode?.kind === 'edit' ? mode.row : undefined;
  // 后端 model.go 的 Secret 字段是 `json:"secret,omitempty"` —— 原样回传不脱敏,
  // 所以默认遮罩,要看再点眼睛(后台常是投屏 / 结对场景)。
  const [revealSecret, setRevealSecret] = useState(false);
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      {mode && (
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? '编辑 webhook' : '新建 webhook'}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
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
          <div className="space-y-1.5"><Label className="text-12">名称</Label><Input name="name" defaultValue={init?.name} required /></div>
          <div className="space-y-1.5"><Label className="text-12">URL</Label><Input name="url" defaultValue={init?.url} placeholder="https://enterscholar.com/hooks/tools" required /></div>
          <div className="space-y-1.5">
            <Label className="text-12">签名密钥 (可选, HMAC-SHA256)</Label>
            <SecretInput
              name="secret"
              defaultValue={init?.secret}
              placeholder="留空则不签名"
              revealed={revealSecret}
              onToggleReveal={() => setRevealSecret((v) => !v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-12">订阅事件 (全不选 = 全部)</Label>
            <div className="flex gap-4">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-12">
                  <input type="checkbox" name={`ev_${ev}`} defaultChecked={init ? (init.events?.length ? init.events.includes(ev) : true) : true} className="size-4" />
                  {EVENT_LABEL[ev]}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-12">
            <input type="checkbox" name="enabled" defaultChecked={init ? init.enabled : true} className="size-4" /> 启用
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {isEdit ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  );
}

function DeliveriesDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  // 三态必须分开:改造前空态判据是 `(data ?? []).length === 0` ——
  // 请求在飞时先斩钉截铁写「还没有投递记录」,失败则永久停在这句假空态。
  // 「没投递过」和「投递过但全失败」是完全相反的结论。
  const { data, isLoading, isError, error, refetch } = useWebhookDeliveries(id ?? undefined);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id != null && (
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>投递记录</DialogTitle></DialogHeader>
        <div className="max-h-[70dvh] space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <LoadingState dense />
          ) : isError ? (
            <ResourceError
              error={error}
              resourceName="投递记录"
              onRetry={() => void refetch()}
              autoRedirect={false}
              className="h-auto bg-transparent py-8"
            />
          ) : (data ?? []).length === 0 ? (
            <EmptyState dense title="还没有投递记录" description="这个 webhook 尚未推送过任何事件。" />
          ) : (
            (data ?? []).map((d) => (
              <div key={d.id} className="flex flex-col items-stretch gap-1 rounded-8 border border-border-soft px-2.5 py-1.5 text-12">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge variant={d.status === 'success' ? 'success' : 'destructive'}>{d.status === 'success' ? '成功' : '失败'}</Badge>
                    <span className="truncate text-subtle">{d.event}</span>
                    {d.http_status ? <span className="shrink-0 text-faint">HTTP {d.http_status}</span> : null}
                    {d.attempt > 1 && <span className="shrink-0 text-brand-amber">第 {d.attempt} 次</span>}
                  </span>
                  <TimeCell value={d.created_at} className="shrink-0" />
                </div>
                {/* 失败原因 / 下游响应体 —— 没有这一行,后台能告诉你的极限就是「失败」两个字 */}
                {(d.error || d.response_body) && (
                  <p className={`mt-1 break-all rounded-4 bg-surface-1 px-2 py-1 font-mono text-12 ${d.error ? 'text-brand-red' : 'text-muted-foreground'}`}>
                    {d.error || d.response_body}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
      )}
    </Dialog>
  );
}

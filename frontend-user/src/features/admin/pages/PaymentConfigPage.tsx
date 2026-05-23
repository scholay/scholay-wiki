import { useState, type ReactNode } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useAlipayConfigs, useCreateAlipayConfig, useUpdateAlipayConfig, useDeleteAlipayConfig, useActivateAlipayConfig,
  useWechatPayConfigs, useCreateWechatPayConfig, useUpdateWechatPayConfig, useDeleteWechatPayConfig, useActivateWechatPayConfig,
  type AlipayConfig, type WeChatPayConfig,
} from '../api/payment';

export function PaymentConfigPage() {
  return (
    <AdminPageLayout
      title="支付配置"
      description="支付宝 + 微信支付 · 多商户切换"
    >
      <Tabs defaultValue="alipay">
        <TabsList>
          <TabsTrigger value="alipay">支付宝</TabsTrigger>
          <TabsTrigger value="wechat">微信支付</TabsTrigger>
        </TabsList>
        <TabsContent value="alipay" className="mt-4">
          <AlipayPanel />
        </TabsContent>
        <TabsContent value="wechat" className="mt-4">
          <WechatPanel />
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}

// ============================================================================
// Alipay
// ============================================================================

type AlipayMode = { kind: 'create' } | { kind: 'edit'; row: AlipayConfig } | null;

function AlipayPanel() {
  const { data, isLoading } = useAlipayConfigs();
  const create = useCreateAlipayConfig();
  const update = useUpdateAlipayConfig();
  const del = useDeleteAlipayConfig();
  const activate = useActivateAlipayConfig();
  const [mode, setMode] = useState<AlipayMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleActivate = async (r: AlipayConfig) => {
    if (r.is_active) return;
    const ok = await confirm({
      title: `切换活动支付宝商户?`,
      description: `App ID:${r.app_id}\n其他配置会自动停用,所有后续订单走该商户。`,
      danger: true,
      confirmText: '切换',
    });
    if (!ok) return;
    await apiToast(activate.mutateAsync(r.id), { success: '已切换', failure: '切换失败' });
  };

  const handleDelete = async (r: AlipayConfig) => {
    const ok = await confirm({
      title: `删除支付宝配置「${r.app_id}」?`,
      description: r.is_active ? '⚠️ 这是当前激活配置,删除后用户无法用支付宝下单!' : undefined,
      danger: true,
      confirmText: '删除',
      typeToConfirm: r.is_active ? 'DELETE' : undefined,
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(r.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<AlipayConfig>[] = [
    {
      header: 'App ID',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground font-mono">{r.app_id}</span>
          <span className="text-2xs text-faint truncate max-w-[300px]">{r.gateway_url}</span>
        </div>
      ),
    },
    {
      header: '环境',
      width: 80,
      cell: (r) => r.is_sandbox ? <Badge variant="warning">沙箱</Badge> : <Badge variant="muted">生产</Badge>,
    },
    ActiveCell(handleActivate),
    {
      header: '创建时间',
      width: 120,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at?.slice(0, 10)}</span>,
    },
    EditDeleteCell((r) => setMode({ kind: 'edit', row: r }), handleDelete),
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新增支付宝配置
        </Button>
      </div>
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'edit' ? '编辑支付宝配置' : '新增支付宝配置'}</DialogTitle>
          </DialogHeader>
          {mode && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const form: Omit<AlipayConfig, 'id' | 'created_at' | 'updated_at'> = {
                  app_id: String(fd.get('app_id') || ''),
                  private_key: String(fd.get('private_key') || ''),
                  alipay_public_key: String(fd.get('alipay_public_key') || ''),
                  gateway_url: String(fd.get('gateway_url') || ''),
                  notify_url: String(fd.get('notify_url') || ''),
                  return_url: String(fd.get('return_url') || ''),
                  is_sandbox: fd.get('is_sandbox') === 'on',
                  is_active: mode.kind === 'edit' ? mode.row.is_active : false,
                };
                const ok = mode.kind === 'create'
                  ? await apiToast(create.mutateAsync(form), { success: '已新增', failure: '新增失败' })
                  : await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' });
                if (ok !== null) setMode(null);
              }}
              className="space-y-3"
            >
              <Field label="App ID">
                <Input name="app_id" defaultValue={mode.kind === 'edit' ? mode.row.app_id : ''} required />
              </Field>
              <Field label="Gateway URL">
                <Input
                  name="gateway_url"
                  defaultValue={mode.kind === 'edit' ? mode.row.gateway_url : 'https://openapi.alipay.com/gateway.do'}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Notify URL">
                  <Input name="notify_url" defaultValue={mode.kind === 'edit' ? mode.row.notify_url : ''} required />
                </Field>
                <Field label="Return URL">
                  <Input name="return_url" defaultValue={mode.kind === 'edit' ? mode.row.return_url : ''} required />
                </Field>
              </div>
              <Field label="商户私钥(Private Key)">
                <textarea
                  name="private_key"
                  rows={4}
                  defaultValue={mode.kind === 'edit' ? mode.row.private_key : ''}
                  required={mode.kind === 'create'}
                  placeholder={mode.kind === 'edit' ? '留空表示不修改' : ''}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="支付宝公钥(Alipay Public Key)">
                <textarea
                  name="alipay_public_key"
                  rows={3}
                  defaultValue={mode.kind === 'edit' ? mode.row.alipay_public_key : ''}
                  required={mode.kind === 'create'}
                  placeholder={mode.kind === 'edit' ? '留空表示不修改' : ''}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <div className="flex items-center gap-2">
                <input id="alipay-sandbox" name="is_sandbox" type="checkbox"
                  defaultChecked={mode.kind === 'edit' ? mode.row.is_sandbox : false} className="size-4" />
                <Label htmlFor="alipay-sandbox" className="text-sm">沙箱环境</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMode(null)}>取消</Button>
                <Button type="submit">{mode.kind === 'edit' ? '保存' : '新增'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// WeChat Pay
// ============================================================================

type WechatMode = { kind: 'create' } | { kind: 'edit'; row: WeChatPayConfig } | null;

function WechatPanel() {
  const { data, isLoading } = useWechatPayConfigs();
  const create = useCreateWechatPayConfig();
  const update = useUpdateWechatPayConfig();
  const del = useDeleteWechatPayConfig();
  const activate = useActivateWechatPayConfig();
  const [mode, setMode] = useState<WechatMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleActivate = async (r: WeChatPayConfig) => {
    if (r.is_active) return;
    const ok = await confirm({
      title: `切换活动微信支付商户?`,
      description: `MchID:${r.mch_id}\n其他配置会自动停用,所有后续订单走该商户。`,
      danger: true,
      confirmText: '切换',
    });
    if (!ok) return;
    await apiToast(activate.mutateAsync(r.id), { success: '已切换', failure: '切换失败' });
  };

  const handleDelete = async (r: WeChatPayConfig) => {
    const ok = await confirm({
      title: `删除微信支付配置「${r.mch_id}」?`,
      description: r.is_active ? '⚠️ 这是当前激活配置,删除后用户无法用微信支付下单!' : undefined,
      danger: true,
      confirmText: '删除',
      typeToConfirm: r.is_active ? 'DELETE' : undefined,
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(r.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<WeChatPayConfig>[] = [
    {
      header: '商户号 / App ID',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground font-mono">{r.mch_id}</span>
          <span className="text-2xs text-faint">App ID {r.app_id}</span>
        </div>
      ),
    },
    {
      header: '环境',
      width: 80,
      cell: (r) => r.is_sandbox ? <Badge variant="warning">沙箱</Badge> : <Badge variant="muted">生产</Badge>,
    },
    ActiveCell(handleActivate),
    {
      header: '创建时间',
      width: 120,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at?.slice(0, 10)}</span>,
    },
    EditDeleteCell((r) => setMode({ kind: 'edit', row: r }), handleDelete),
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新增微信支付配置
        </Button>
      </div>
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'edit' ? '编辑微信支付配置' : '新增微信支付配置'}</DialogTitle>
          </DialogHeader>
          {mode && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const form: Omit<WeChatPayConfig, 'id' | 'created_at' | 'updated_at'> = {
                  mch_id: String(fd.get('mch_id') || ''),
                  app_id: String(fd.get('app_id') || ''),
                  api_v3_key: String(fd.get('api_v3_key') || ''),
                  serial_no: String(fd.get('serial_no') || ''),
                  private_key: String(fd.get('private_key') || ''),
                  notify_url: String(fd.get('notify_url') || ''),
                  is_sandbox: fd.get('is_sandbox') === 'on',
                  is_active: mode.kind === 'edit' ? mode.row.is_active : false,
                };
                const ok = mode.kind === 'create'
                  ? await apiToast(create.mutateAsync(form), { success: '已新增', failure: '新增失败' })
                  : await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' });
                if (ok !== null) setMode(null);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="商户号(MchID)">
                  <Input name="mch_id" defaultValue={mode.kind === 'edit' ? mode.row.mch_id : ''} required />
                </Field>
                <Field label="App ID">
                  <Input name="app_id" defaultValue={mode.kind === 'edit' ? mode.row.app_id : ''} required />
                </Field>
                <Field label="证书序列号(Serial No)">
                  <Input name="serial_no" defaultValue={mode.kind === 'edit' ? mode.row.serial_no : ''} required />
                </Field>
                <Field label="Notify URL">
                  <Input name="notify_url" defaultValue={mode.kind === 'edit' ? mode.row.notify_url : ''} required />
                </Field>
              </div>
              <Field label="APIv3 Key">
                <Input
                  name="api_v3_key"
                  type="password"
                  defaultValue={mode.kind === 'edit' ? mode.row.api_v3_key : ''}
                  required={mode.kind === 'create'}
                  placeholder={mode.kind === 'edit' ? '留空表示不修改' : ''}
                />
              </Field>
              <Field label="商户 API 私钥">
                <textarea
                  name="private_key"
                  rows={5}
                  defaultValue={mode.kind === 'edit' ? mode.row.private_key : ''}
                  required={mode.kind === 'create'}
                  placeholder={mode.kind === 'edit' ? '留空表示不修改' : '-----BEGIN PRIVATE KEY-----'}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <div className="flex items-center gap-2">
                <input id="wechat-sandbox" name="is_sandbox" type="checkbox"
                  defaultChecked={mode.kind === 'edit' ? mode.row.is_sandbox : false} className="size-4" />
                <Label htmlFor="wechat-sandbox" className="text-sm">沙箱环境</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMode(null)}>取消</Button>
                <Button type="submit">{mode.kind === 'edit' ? '保存' : '新增'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 共享列工厂(两个 provider 都要"切换激活"和"编辑/删除"列)
// ============================================================================

function ActiveCell<T extends { is_active: boolean; id: number }>(
  onActivate: (r: T) => void
): Column<T> {
  return {
    header: '活动',
    width: 130,
    cell: (r) => (
      <button
        type="button"
        onClick={() => onActivate(r)}
        disabled={r.is_active}
        className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-foreground disabled:opacity-100 disabled:text-brand-green disabled:font-bold"
      >
        {r.is_active ? (
          <>
            <CheckCircle2 className="size-3.5" />
            当前活动
          </>
        ) : (
          <>
            <Circle className="size-3.5" />
            切换为活动
          </>
        )}
      </button>
    ),
  };
}

function EditDeleteCell<T>(
  onEdit: (r: T) => void,
  onDelete: (r: T) => void
): Column<T> {
  return {
    header: '',
    width: 90,
    align: 'right',
    cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(r)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => onDelete(r)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    ),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

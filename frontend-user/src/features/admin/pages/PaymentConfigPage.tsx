import { useEffect, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
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
import { TimeCell } from '../components/TimeCell';
import { CopyableId } from '../components/CopyableId';
import {
  ActiveCell, EditDeleteCell, Field, PaymentLiveBanner, SecretTextareaField,
} from '../components/PaymentConfigParts';
import { WechatPayPanel } from '../components/WechatPayPanel';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useAlipayConfigs, useCreateAlipayConfig, useUpdateAlipayConfig, useDeleteAlipayConfig, useActivateAlipayConfig,
  alipayGatewayFor,
  type AlipayConfig, type AlipayConfigInput,
} from '../api/payment';

export function PaymentConfigPage() {
  const qc = useQueryClient();
  // 两个 tab 各自持有自己的 list query,刷新入口在页面级 —— 统一失效整个 payment 前缀,
  // 切到哪个 tab 都能用同一个按钮拿最新状态(全局 refetchOnWindowFocus 是关的)。
  const fetching = useIsFetching({ queryKey: ['admin', 'payment'] }) > 0;

  return (
    <AdminPageLayout
      title="支付配置"
      description="支付宝 + 微信支付 · 多商户切换"
      onRefresh={() => void qc.invalidateQueries({ queryKey: ['admin', 'payment'] })}
      refreshing={fetching}
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
          <WechatPayPanel />
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
  // 默认脱敏; 点私钥/公钥旁小眼睛 → reveal=true → 重新拉取明文 (show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const q = useAlipayConfigs({ showSensitive: reveal });
  const { data } = q;
  const create = useCreateAlipayConfig();
  const update = useUpdateAlipayConfig();
  const del = useDeleteAlipayConfig();
  const activate = useActivateAlipayConfig();
  const [mode, setMode] = useState<AlipayMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  // 编辑态: 从最新 list 里按 id 取出当前行 (reveal 切换会重拉 list, 拿到明文/脱敏)。
  const editId = mode?.kind === 'edit' ? mode.row.id : null;
  const liveRow = editId != null ? data?.find((r) => r.id === editId) : undefined;

  // 两个 textarea 密文受控, 随该行的字段值变化同步 (不依赖整个 data, 避免无关重拉冲掉输入)。
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  useEffect(() => {
    setPrivateKey(liveRow?.private_key ?? '');
  }, [liveRow?.private_key]);
  useEffect(() => {
    setPublicKey(liveRow?.alipay_public_key ?? '');
  }, [liveRow?.alipay_public_key]);

  // 沙箱开关受控 —— Gateway URL 是它的**派生只读回显**(后端就是这么算的),
  // 两者必须由同一个 state 驱动,否则会出现「框里写着生产网关、保存后变成沙箱」的反话。
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    if (!mode) return;
    setSandbox(mode.kind === 'edit' ? mode.row.is_sandbox : false);
  }, [mode]);

  // 用户端支付宝入口的判据只有 is_active(vip.Service.PaymentMethods:alipay_configs where is_active)。
  const activeRow = data?.find((r) => r.is_active);

  const handleActivate = async (r: AlipayConfig) => {
    if (r.is_active) return;
    const ok = await confirm({
      title: '切换活动支付宝商户?',
      // description 是 ReactNode —— 直接给 JSX 换行。`\n` 在 DialogDescription 里不会换行
      // (没有 whitespace-pre-line),商户号与后果说明会糊成一行。
      description: (
        <>
          App ID:{r.app_id}
          <br />
          其他配置会自动停用,所有后续订单走该商户。
          {r.is_sandbox && (
            <>
              <br />
              ⚠️ 这是沙箱配置,切过去后线上支付宝下单会全部失败。
            </>
          )}
        </>
      ),
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
          <CopyableId
            value={r.app_id}
            label="App ID"
            className="font-bold text-foreground font-mono"
          />
          {/* 后端下发的真实网关(由 is_sandbox 派生,前端改不了) */}
          <span className="text-12 text-faint truncate max-w-[300px]">{r.gateway_url}</span>
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
      cell: (r) => <TimeCell value={r.created_at} className="text-12 text-muted-foreground" />,
    },
    EditDeleteCell((r) => setMode({ kind: 'edit', row: r }), handleDelete),
  ];

  const submitting = create.isPending || update.isPending;
  // 编辑当前活动配置 + 勾着沙箱 = 保存后线上网关被改写。红字要在勾选的**那一刻**出现。
  const sandboxHazard = mode?.kind === 'edit' && mode.row.is_active && sandbox;

  return (
    <div>
      {/* 「用户端现在到底能不能用支付宝」—— 一张表 + 一堆徽章是答不出这个问题的。
          一行都没有时不渲染:空态本身已经写着同一句话。 */}
      {!q.isLoading && !q.error && !!data?.length && (
        activeRow ? (
          <PaymentLiveBanner
            status={activeRow.is_sandbox ? 'warn' : 'ok'}
            title={
              activeRow.is_sandbox
                ? '当前活动的支付宝配置是沙箱环境 —— 用户端有支付宝入口,但下单会走 alipaydev 沙箱网关'
                : '支付宝已生效 —— 用户端会显示支付宝入口'
            }
            detail={`App ID ${activeRow.app_id} · ${activeRow.gateway_url}`}
          />
        ) : (
          <PaymentLiveBanner
            status="down"
            title="当前没有生效的支付宝配置,用户端不会出现支付宝入口"
            detail="在下面的列表里把一条配置「切换为活动」即可生效(判据:is_active)。"
          />
        )
      )}

      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新增支付宝配置
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyMessage="尚未配置支付宝商户 —— 用户端不会出现支付宝入口"
        emptyDescription="录入 App ID、商户私钥与支付宝公钥后,再把其中一条切换为活动配置。"
        emptyAction={
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
            <Plus className="size-3.5" />
            新增支付宝配置
          </Button>
        }
      />

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'edit' ? '编辑支付宝配置' : '新增支付宝配置'}</DialogTitle>
          </DialogHeader>
          {mode && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                // FormData 必须在任何 await 之前取 —— 事件派发结束后 e.currentTarget 会被置空。
                const fd = new FormData(e.currentTarget);

                // 勾沙箱 = 让后端把网关重写成 alipaydev.com。对**当前活动配置**做这件事,
                // 线上支付宝下单会立刻全部失败,而界面上只有一个 12px 的复选框标签 ——
                // 同页的删除 / 切换活动都有二次确认,这里同样要有。
                if (mode.kind === 'edit' && mode.row.is_active && !mode.row.is_sandbox && sandbox) {
                  const ok = await confirm({
                    title: '把当前活动配置切到沙箱环境?',
                    description: (
                      <>
                        保存后网关会被后端改写成 {alipayGatewayFor(true)}。
                        <br />
                        这是线上正在用的支付宝配置,改完用户的支付宝下单会立刻全部失败。
                      </>
                    ),
                    danger: true,
                    confirmText: '仍然切到沙箱',
                  });
                  if (!ok) return;
                }

                const form: AlipayConfigInput = {
                  app_id: String(fd.get('app_id') || ''),
                  private_key: String(fd.get('private_key') || ''),
                  alipay_public_key: String(fd.get('alipay_public_key') || ''),
                  // gateway_url 刻意不提交 —— 后端请求体里没有这个字段,由 is_sandbox 派生。
                  notify_url: String(fd.get('notify_url') || ''),
                  return_url: String(fd.get('return_url') || ''),
                  is_sandbox: sandbox,
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
              <Field
                label="Gateway URL"
                hint="只读 —— 后端按下方「沙箱环境」开关在两个固定常量之间派生,不接受自定义网关。"
              >
                <Input
                  value={alipayGatewayFor(sandbox)}
                  readOnly
                  tabIndex={-1}
                  aria-readonly
                  className="bg-surface-1 font-mono text-muted-foreground"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Notify URL">
                  <Input name="notify_url" defaultValue={mode.kind === 'edit' ? mode.row.notify_url : ''} required />
                </Field>
                <Field label="Return URL">
                  <Input name="return_url" defaultValue={mode.kind === 'edit' ? mode.row.return_url : ''} required />
                </Field>
              </div>
              <SecretTextareaField
                label="商户私钥(Private Key)"
                name="private_key"
                rows={4}
                value={privateKey}
                onChange={setPrivateKey}
                revealed={reveal}
                onToggleReveal={() => setReveal((v) => !v)}
                required={mode.kind === 'create'}
                placeholder={mode.kind === 'edit' ? '留空表示不修改' : ''}
              />
              <SecretTextareaField
                label="支付宝公钥(Alipay Public Key)"
                name="alipay_public_key"
                rows={3}
                value={publicKey}
                onChange={setPublicKey}
                revealed={reveal}
                onToggleReveal={() => setReveal((v) => !v)}
                required={mode.kind === 'create'}
                placeholder={mode.kind === 'edit' ? '留空表示不修改' : ''}
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    id="alipay-sandbox"
                    type="checkbox"
                    checked={sandbox}
                    onChange={(e) => setSandbox(e.target.checked)}
                    className="size-4"
                  />
                  <Label htmlFor="alipay-sandbox" className="text-12">沙箱环境</Label>
                </div>
                {sandboxHazard && (
                  <p className="text-12 text-brand-red">
                    ⚠️ 这是当前活动配置。保存后网关会被改写成 {alipayGatewayFor(true)},
                    线上用户的支付宝下单会立刻全部失败。
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMode(null)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {mode.kind === 'edit' ? '保存' : '新增'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

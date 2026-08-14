import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { DataTable, type Column } from './DataTable';
import { TimeCell } from './TimeCell';
import { CopyableId } from './CopyableId';
import { ActiveCell, DisabledHint, EditDeleteCell, PaymentLiveBanner } from './PaymentConfigParts';
import { WechatPayConfigDialog, WECHAT_PAY_MODES, type WechatMode } from './WechatPayConfigDialog';
import {
  WechatPayTestResultPanel, WechatPayValidationBadge, WECHAT_KEY_MODE_LABEL,
} from './WechatPayTestResultPanel';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useWechatPayConfigs, useCreateWechatPayConfig, useUpdateWechatPayConfig,
  useDeleteWechatPayConfig, useActivateWechatPayConfig, useTestWechatPayConfig,
  type WeChatPayConfig, type WeChatPayConfigInput, type WechatPayTestResult,
} from '../api/payment';

/**
 * 微信支付商户配置面板。
 *
 * 后端有三条硬约束,UI 必须如实反映(否则管理员会在"看起来成功了"之后收到 400):
 *   1. 新建 / 改动凭证 → validation_status 打回 untested + is_active 强制 false。
 *   2. 激活要求 validation_status === 'valid',否则后端直接拒绝。
 *   3. 「测试配置」永远回 HTTP 200 —— 诊断在响应体里,不能靠 apiToast 的失败分支。
 */

const ACTIVATE_BLOCKED = '请先点「测试配置」并通过后再启用';

/** 「测试配置」端点自身允许打微信 25s,前端超时给到 60s(api/payment.ts) */
const TEST_BUSY_HINT = '正在测试另一条配置(最长约 60 秒),完成后可点';

const PAY_MODE_LABEL: Record<string, string> = Object.fromEntries(
  WECHAT_PAY_MODES.map((m) => [m.value, m.label.replace(/\s*\(.+\)$/, '')]),
);

export function WechatPayPanel() {
  // 默认脱敏; 点密钥旁小眼睛 → reveal=true → 重拉明文 (show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const q = useWechatPayConfigs({ showSensitive: reveal });
  const { data } = q;
  const create = useCreateWechatPayConfig();
  const update = useUpdateWechatPayConfig();
  const del = useDeleteWechatPayConfig();
  const activate = useActivateWechatPayConfig();
  const test = useTestWechatPayConfig();
  const [mode, setMode] = useState<WechatMode>(null);
  // 两个结果落点:列表行触发 → 独立弹窗;编辑弹窗内触发 → 内联在表单底部。
  // 刻意不复用同一个 Dialog —— 嵌套 Radix modal 是全站点击失灵的已知成因。
  const [rowTest, setRowTest] = useState<{ label: string; result: WechatPayTestResult } | null>(null);
  const [dialogTest, setDialogTest] = useState<WechatPayTestResult | null>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  // 编辑态: 从最新 list 里按 id 取出当前行 (reveal 切换 / 测试后失效都会重拉)。
  const editId = mode?.kind === 'edit' ? mode.row.id : null;
  const liveRow = editId != null ? data?.find((r) => r.id === editId) : undefined;

  /**
   * 关闭编辑弹窗时**必须**把 reveal 复位。
   *
   * 🔴 reveal 进了 list 的 queryKey:一旦为 true,此后该列表的**每一次** refetch 都带
   * `?show_sensitive=true` —— 而触发点很多(测试成功后 invalidate、增删改激活的 invalidate、
   * 页头新加的刷新按钮)。于是管理员只是"看一眼 APIv3 密钥"就关了弹窗,商户 API 私钥 PEM /
   * APIv3 密钥 / 微信支付公钥的明文会被反复拉进浏览器内存和 devtools network 面板,
   * 界面上还没有任何提示。这几样凭证泄露等于商户号被接管。
   * (三方账号页对同一模式的处理方式相同,两边保持一致。)
   */
  const closeDialog = () => {
    setMode(null);
    setReveal(false);
  };

  const openDialog = (next: WechatMode) => {
    setRowTest(null);
    setDialogTest(null);
    setReveal(false); // 每次重新打开都从脱敏态起步,不继承上一次的明文模式
    setMode(next);
  };

  const runTest = async (id: number, into: 'row' | 'dialog', label = '') => {
    try {
      const result = await test.mutateAsync(id);
      if (into === 'dialog') setDialogTest(result);
      else setRowTest({ label, result });
    } catch (err) {
      // 走到这里只可能是网络错 / 5xx —— 校验失败本身是 200 + 结构化诊断。
      apiToast.show(err, '测试请求失败,请稍后重试');
    }
  };

  const handleActivate = async (r: WeChatPayConfig) => {
    if (r.is_active || r.validation_status !== 'valid') return;
    const ok = await confirm({
      title: '切换活动微信支付商户?',
      // description 是 ReactNode —— 用 JSX 换行。`\n` 在 DialogDescription 里不会换行
      // (没有 whitespace-pre-line),商户号与后果说明会糊成一行。
      description: (
        <>
          商户号:{r.mch_id}
          <br />
          其他配置会自动停用,所有后续订单走该商户。
        </>
      ),
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

  // 保存成功的 toast 刻意不是「已保存」就完 —— 后端会把配置打回 untested + 下线,
  // 不说清楚下一步,管理员会以为保存即生效,然后在「启用」上吃一个 400。
  // 失败分支交给 apiToast:它优先用后端 message(「APIv3 密钥必须是 32 个字符,当前 24 个」
  // 这类可直接给管理员看的具体原因),failure 只是兜底。
  const handleSubmit = async (input: WeChatPayConfigInput) => {
    if (!mode) return false;
    const saved = mode.kind === 'create'
      ? await apiToast(create.mutateAsync(input), {
          success: '配置已保存,请点「测试配置」验证后再启用',
          failure: '新增失败',
        })
      : await apiToast(update.mutateAsync({ id: mode.row.id, data: input }), {
          success: '配置已保存,请点「测试配置」验证后再启用',
          failure: '更新失败',
        });
    return saved !== null;
  };

  const columns: Column<WeChatPayConfig>[] = [
    {
      header: '商户号 / AppID',
      cell: (r) => (
        // 排查一笔支付要把商户号 / AppID 贴进商户平台,两行挤在一个 flex-col 里
        // 手选很容易连带框错 —— 各自给一键复制。
        <div className="flex min-w-0 flex-col">
          <CopyableId value={r.mch_id} label="商户号" className="font-mono font-bold text-foreground" />
          <CopyableId value={r.app_id} label="AppID" prefix={<span className="text-faint">AppID</span>} className="text-12 text-faint" />
        </div>
      ),
    },
    {
      header: '验签模式',
      width: 110,
      cell: (r) => (
        <span className="text-12 text-subtle">
          {WECHAT_KEY_MODE_LABEL[r.key_mode] ?? r.key_mode}
        </span>
      ),
    },
    {
      header: '支付方式',
      width: 180,
      // 一种场景都没勾是**硬故障态**(未勾选的场景下单会被后端拒绝)。
      // 渲染成空单元格恰恰把最该被看见的状态藏了。
      cell: (r) =>
        (r.pay_modes ?? []).length === 0 ? (
          <span className="text-12 text-brand-red">未配置支付方式</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.pay_modes.map((m) => (
              <Badge key={m} variant="outline">{PAY_MODE_LABEL[m] ?? m}</Badge>
            ))}
          </div>
        ),
    },
    {
      // 240 而不是 160:invalid 时后端把可读原因下发在 last_validation_message
      // (APIv3 密钥长度 / 序列号与证书不配对 / 回调地址不通…),不显示就只能逐行点开
      // 编辑弹窗滚到底才知道到底哪一步错了。
      header: '校验状态',
      width: 240,
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <WechatPayValidationBadge status={r.validation_status} />
          {r.last_validated_at ? (
            <TimeCell value={r.last_validated_at} prefix="上次测试 " />
          ) : (
            <span className="text-12 text-faint">从未测试</span>
          )}
          {r.validation_status === 'invalid' && r.last_validation_message && (
            <p className="line-clamp-2 text-12 text-brand-red" title={r.last_validation_message}>
              {r.last_validation_message}
            </p>
          )}
        </div>
      ),
    },
    ActiveCell<WeChatPayConfig>(
      handleActivate,
      (r) => (r.validation_status === 'valid' ? null : ACTIVATE_BLOCKED),
    ),
    {
      header: '',
      width: 110,
      cell: (r) => {
        const running = test.isPending && test.variables === r.id;
        return (
          <DisabledHint hint={test.isPending && !running ? TEST_BUSY_HINT : null}>
            <Button
              size="sm"
              variant="outline"
              disabled={test.isPending}
              onClick={() => runTest(r.id, 'row', r.mch_id)}
            >
              {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {running ? '测试中…' : '测试配置'}
            </Button>
          </DisabledHint>
        );
      },
    },
    EditDeleteCell<WeChatPayConfig>((r) => openDialog({ kind: 'edit', row: r }), handleDelete),
  ];

  // 用户端微信支付入口的判据 = is_active **且** validation_status='valid'
  // (vip.Service.PaymentMethods)。只看列表徽章推不出这一条。
  const liveConfig = data?.find((r) => r.is_active && r.validation_status === 'valid');
  const activeButUnverified = data?.find((r) => r.is_active && r.validation_status !== 'valid');

  return (
    <div>
      {/* 「用户端现在到底能不能用微信支付」—— 三行配置全在、每行都有徽章,
          完全可能对应「一个微信支付按钮都没有」。
          一行都没有时不渲染:空态本身已经写着同一句话,重复两遍反而更吵。 */}
      {!q.isLoading && !q.error && !!data?.length && (
        liveConfig ? (
          <PaymentLiveBanner
            status="ok"
            title="微信支付已生效 —— 用户端会显示微信支付入口"
            detail={`商户号 ${liveConfig.mch_id} · ${WECHAT_KEY_MODE_LABEL[liveConfig.key_mode] ?? liveConfig.key_mode}`}
          />
        ) : (
          <PaymentLiveBanner
            status="down"
            title="当前没有生效的微信支付配置,用户端不会出现微信支付入口"
            detail={
              activeButUnverified
                ? `商户号 ${activeButUnverified.mch_id} 虽是活动配置,但校验状态不是「已验证」—— 后端要求 is_active 且 validation_status='valid' 才对用户下发入口,请点该行的「测试配置」。`
                : '需要一条同时满足「当前活动」和「已验证」的配置(判据:is_active 且 validation_status=valid)。'
            }
          />
        )
      )}

      {/* 测试期间全表按钮都会变灰,最长 60 秒 —— 不说清楚,管理员的直觉是
          「页面卡死了」然后刷新,把还没落库的诊断结果丢掉。 */}
      {test.isPending && (
        <div className="mb-3 flex items-start gap-2 rounded-12 border border-border bg-surface-1 px-3 py-2 text-12 text-subtle">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          正在做离线自检并真打一次微信验签接口,最长约 60 秒(不产生真实交易)。
          期间「测试配置」按钮会暂时不可点,请不要刷新页面 —— 结果要等接口返回才会落库。
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => openDialog({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新增微信支付配置
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyMessage="尚未配置微信支付商户 —— 用户端不会出现微信支付入口"
        emptyDescription="录入商户号、序列号与 APIv3 密钥后,先「测试配置」通过,再切换为活动配置。"
        emptyAction={
          <Button size="sm" onClick={() => openDialog({ kind: 'create' })}>
            <Plus className="size-3.5" />
            新增微信支付配置
          </Button>
        }
      />

      <WechatPayConfigDialog
        mode={mode}
        row={liveRow}
        reveal={reveal}
        onToggleReveal={() => setReveal((v) => !v)}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        submitting={create.isPending || update.isPending}
        onTest={() => { if (editId != null) void runTest(editId, 'dialog'); }}
        testing={test.isPending}
        testResult={dialogTest}
      />

      {/* 列表行触发的测试结果 —— Dialog 本体常驻,只切 open。 */}
      <Dialog open={!!rowTest} onOpenChange={(o) => !o && setRowTest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>测试结果{rowTest?.label ? ` · ${rowTest.label}` : ''}</DialogTitle>
          </DialogHeader>
          {rowTest && <WechatPayTestResultPanel result={rowTest.result} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRowTest(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

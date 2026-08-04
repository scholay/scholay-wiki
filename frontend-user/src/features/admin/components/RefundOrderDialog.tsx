import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { LoadingState } from '@/shared/components/LoadingState';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { TimeCell } from './TimeCell';
import { CopyableId } from './CopyableId';
import { useApiToast } from '../hooks/useApiToast';
import {
  useOrderRefunds, useRefundOrder, ORDER_TYPE_LABEL, PAY_METHOD_LABEL,
  type AdminOrder,
} from '../api/orders';

/**
 * 订单退款登记弹窗。
 *
 * 🔴 **它不会去调支付网关**。当前口径(owner 2026-08-04 拍板)是:
 * 管理员先去支付宝/微信商户后台把钱退掉,回到这里登记 —— 系统负责记账、回收权益、
 * 通知用户、留痕。弹窗必须把这一点写在最显眼处,否则管理员会以为点一下钱就退出去了,
 * 结果是「系统里显示已退款、用户账上会员没了、钱其实一分没退」。
 *
 * 设计要点:
 *   - 先展示**将要发生什么**(退多少钱 / 收多少经费 / 会员会不会没),再让点确认;
 *   - 退款金额可改(支持部分退款),但被剩余可退金额钳住;
 *   - 会员撤销是**开关**而不是自动:全额退默认开、部分退默认关。
 *     理由:owner 的口径是「订阅退款整体撤销会员」,但那个口径对部分退款说不通 ——
 *     退 ¥10 就把整个会员清零,与经费「按比例回收」自相矛盾,而且不可逆。
 *   - 确认要打字(订单号),防止在 20 行表格里点错相邻行。
 */
export function RefundOrderDialog({
  order,
  open,
  onClose,
}: {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
}) {
  const refund = useRefundOrder();
  const apiToast = useApiToast();
  const historyQ = useOrderRefunds(open && order ? order.order_no : null);

  const paid = order?.final_amount ?? 0;
  const alreadyRefunded = order?.refunded_amount ?? 0;
  // 整数分计算 —— 钱的路径上不用浮点比大小(与后端 yuanToCents 同口径)
  const remainCents = Math.max(0, Math.round(paid * 100) - Math.round(alreadyRefunded * 100));
  const remain = remainCents / 100;

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [gatewayNo, setGatewayNo] = useState('');
  const [revokeMembership, setRevokeMembership] = useState(false);
  const [typed, setTyped] = useState('');
  // 幂等键:每次**打开**弹窗生成一次,同一次弹窗内的重试(提交失败后再点)沿用同一个。
  // 后端靠它把「响应丢了、管理员又点一次」挡成幂等回放,而不是退第二次钱。
  const [idemKey, setIdemKey] = useState('');

  // 每次打开都从「全额退」的默认态起步,不继承上一笔的输入。
  useEffect(() => {
    if (!open || !order) return;
    setAmount(remain.toFixed(2));
    setReason('');
    setGatewayNo('');
    setTyped('');
    setIdemKey(crypto.randomUUID());
    // 订阅单且本次是全额退 → 默认勾上撤销会员(owner 口径);部分退默认不勾。
    setRevokeMembership(order.order_type === 'subscription' && remainCents === Math.round(paid * 100));
    // remain/paid 由 order 派生,单独列进依赖只会制造重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.order_no]);

  const amountNum = Number(amount);
  const amountCents = Number.isFinite(amountNum) ? Math.round(amountNum * 100) : NaN;
  const amountValid = Number.isFinite(amountCents) && amountCents > 0 && amountCents <= remainCents;
  const isFullRefund = amountValid && amountCents === remainCents;

  // 按本次退款比例预估要回收的经费 —— 与后端 refund.go 同一个算式(整数分按比例)。
  // 只是预估:真正扣多少取决于用户当下余额(不足时扣到 0 为止,差额平台承担)。
  const expectedCredits = useMemo(() => {
    if (!order || order.order_type !== 'recharge' || !order.credits_granted) return 0;
    const paidCents = Math.round(paid * 100);
    if (!amountValid || paidCents <= 0) return 0;
    return Math.floor((order.credits_granted * amountCents) / paidCents);
  }, [order, paid, amountCents, amountValid]);

  const canSubmit =
    amountValid && reason.trim().length > 0 && typed === order?.order_no && !refund.isPending;

  const submit = async () => {
    if (!order || !canSubmit) return;
    const res = await apiToast(
      refund.mutateAsync({
        orderNo: order.order_no,
        amount: amountNum,
        reason: reason.trim(),
        gateway_refund_no: gatewayNo.trim() || undefined,
        revoke_membership: revokeMembership,
        idempotency_key: idemKey,
      }),
      { success: '退款已登记', failure: '退款登记失败' }
    );
    if (res === null) return; // 失败:弹窗不关,输入留着可改可重试
    onClose();
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* key=订单号:换一张单打开时让整棵表单重新挂载。
          否则 setRefundTarget(B)+setRefundOpen(true) 同批生效,标题已经是 B 的单号,
          而金额/原因/渠道单号仍持有 A 的值(重置在 passive effect 里,要等 paint 后才跑)——
          Radix 开场动画期间这段旧内容是可见的,管理员可能没注意到「退款原因」还是上一单的文本,
          而 reason 会原样落库进对账与审计。 */}
      <DialogContent key={order.order_no} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>退款登记 · {order.order_no}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[65dvh] overflow-y-auto">
          {/* 🔴 头号提示:这里不退钱。放在最顶上,不折叠、不缩字号。 */}
          <div className="flex gap-2 rounded-12 border border-border bg-warning-soft p-3 text-12">
            <AlertTriangle className="size-4 shrink-0 text-brand-amber" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">本操作不会向支付渠道发起退款</p>
              <p className="mt-0.5 text-muted-foreground">
                请先在{PAY_METHOD_LABEL[order.payment_method] ?? order.payment_method}商户后台把钱退给用户,
                再回到这里登记。本操作只做:记账、回收权益、通知用户、留痕。
              </p>
            </div>
          </div>

          {/* 订单事实 —— 退款前要核对的都摆出来 */}
          <div className="rounded-12 border border-border bg-surface-1 p-3 text-12">
            <KV label="用户">
              {order.username || order.email || `#${order.user_id}`}
            </KV>
            <KV label="类型">
              {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
              {order.plan_name ? ` · ${order.plan_name}` : ''}
            </KV>
            <KV label="实付">
              <span className="tabular-nums font-medium text-foreground">¥{paid.toFixed(2)}</span>
            </KV>
            {alreadyRefunded > 0 && (
              <KV label="已退">
                <span className="tabular-nums text-brand-red">¥{alreadyRefunded.toFixed(2)}</span>
                <span className="ml-1 text-faint">剩余可退 ¥{remain.toFixed(2)}</span>
              </KV>
            )}
            <KV label="网关交易号">
              {order.transaction_no ? (
                <CopyableId value={order.transaction_no} label="交易号" className="text-12" />
              ) : (
                // 没有交易号 = 商户后台里找不到这笔交易(典型是测试支付单)
                <span className="text-brand-red">无 —— 该单在渠道侧没有真实交易</span>
              )}
            </KV>
          </div>

          {/* 金额 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-amount">退款金额(元)</Label>
            <Input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remain}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular-nums"
            />
            <div className="flex items-center gap-2 text-12 text-faint">
              <span>剩余可退 ¥{remain.toFixed(2)}</span>
              {!isFullRefund && amountValid && <Badge variant="warning">部分退款</Badge>}
              {!amountValid && amount !== '' && (
                <span className="text-brand-red">金额须在 0.01 – {remain.toFixed(2)} 之间</span>
              )}
            </div>
          </div>

          {/* 权益回收预览 —— 「点下去会发生什么」必须先看见 */}
          <div className="rounded-12 border border-border p-3">
            <p className="mb-2 text-12 font-medium text-foreground">将要回收的权益</p>
            {order.order_type === 'recharge' ? (
              <p className="text-12 text-muted-foreground">
                回收经费{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {expectedCredits.toLocaleString()}
                </span>
                {order.credits_granted > 0 && (
                  <span className="text-faint">
                    {' '}
                    / 本单共发放 {order.credits_granted.toLocaleString()}
                  </span>
                )}
                {/* 「扣到 0 为止」是 owner 定的口径,必须提前讲明,否则事后看到差额会以为是 bug */}
                <span className="mt-1 block text-faint">
                  用户余额不足时按实际余额扣、不扣成负数,差额由平台承担并记入退款单。
                </span>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2.5">
                  <Switch
                    checked={revokeMembership}
                    onCheckedChange={setRevokeMembership}
                    aria-label="同时撤销会员"
                  />
                  <span className="text-12">
                    <span className="font-medium text-foreground">同时撤销会员</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      会把该用户打回免费档并清空到期日。
                      <span className="text-brand-red">
                        注意:会员到期日是一个累加值,系统没有记录「这一单加了多少天」——
                        撤销会连带砍掉该用户其他已付费的续期。
                      </span>
                    </span>
                  </span>
                </label>
                {!isFullRefund && revokeMembership && (
                  <p className="rounded-8 bg-danger-soft px-2 py-1 text-12 text-brand-red">
                    这是一笔部分退款,却要撤销
                    <strong className="font-medium">全部</strong>
                    会员 —— 确认这是你想要的。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 原因(必填,内部) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">退款原因(必填)</Label>
            <Textarea
              id="refund-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如:用户误购,已在微信商户后台原路退回"
              maxLength={255}
            />
            <span className="text-12 text-faint">仅内部可见,不会出现在给用户的通知里。</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-gwno">渠道退款单号(选填)</Label>
            <Input
              id="refund-gwno"
              value={gatewayNo}
              onChange={(e) => setGatewayNo(e.target.value)}
              placeholder="商户后台那笔退款的单号,便于日后对账"
              maxLength={64}
            />
          </div>

          {/* 已有退款记录 —— 部分退款场景下必须能看到前几笔 */}
          {historyQ.isLoading ? (
            <LoadingState dense label="读取退款记录…" />
          ) : historyQ.isError ? (
            <p className="text-12 text-brand-red">
              退款记录加载失败:{toApiError(historyQ.error).message} —— 无法确认此前是否已退过,请重试后再操作。
            </p>
          ) : (historyQ.data?.length ?? 0) > 0 ? (
            <div className="rounded-12 border border-border">
              <p className="border-b border-border-soft px-3 py-2 text-12 font-medium text-foreground">
                此前的退款({historyQ.data!.length} 笔)
              </p>
              <ul className="divide-y divide-border-soft">
                {historyQ.data!.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-12">
                    <span className="tabular-nums font-medium text-foreground">¥{r.amount.toFixed(2)}</span>
                    <TimeCell value={r.created_at} />
                    {r.credits_reclaimed > 0 && (
                      <span className="text-faint">收回 {r.credits_reclaimed} 经费</span>
                    )}
                    {r.credits_shortfall > 0 && (
                      <span className="text-brand-amber" title="用户已消费,平台承担差额">
                        差 {r.credits_shortfall}
                      </span>
                    )}
                    {r.membership_revoked && <Badge variant="destructive">已撤会员</Badge>}
                    <span className="ml-auto truncate text-faint" title={r.reason}>
                      {r.operator_name || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 高摩擦确认:打字输入订单号。20 行的表格里点错相邻行是真会发生的。 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-confirm">
              输入订单号 <span className="font-mono text-foreground">{order.order_no}</span> 以确认
            </Label>
            <Input
              id="refund-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={order.order_no}
              className={cn('font-mono', typed && typed !== order.order_no && 'border-brand-red')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={refund.isPending}>
            取消
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {refund.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            确认登记退款 ¥{amountValid ? (amountCents / 100).toFixed(2) : '—'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-20 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-subtle">{children}</span>
    </div>
  );
}

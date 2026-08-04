import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { useOrders, useTransactions, type Order } from '../../api/membership';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

// 0098 起流水金额可带小数(payg 日聚合行)。整数原样;小数最多 4 位去尾零
// (toLocaleString 默认最多 3 位小数且四舍五入,会把微量扣减抹成 0)。
const fmtCredit = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : String(parseFloat(v.toFixed(4))));

// 退款状态文案。与管理台 features/admin/api/orders.ts 的 REFUND_STATUS_LABEL 同口径 ——
// 跨 feature import 是禁止的(见 frontend-user/CLAUDE.md §一),故此处平行定义;改文案两侧一起改。
const REFUND_STATUS_LABEL: Record<string, string> = {
  partial: '部分退款',
  full: '已退款',
};

/**
 * 移动端资产明细 —— 经费流水 + 订单记录两个 tab(数据复用 membership hooks 只读展示)。
 */
export function MobileBillingPage() {
  return (
    <MeSubpageShell title="资产明细">
      <BillingBody />
    </MeSubpageShell>
  );
}

function BillingBody() {
  const [tab, setTab] = useState<'txns' | 'orders'>('txns');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-2 p-3 pb-0">
        {(
          [
            ['txns', '经费流水'],
            ['orders', '订单记录'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-12 transition-colors',
              tab === key
                ? 'border-foreground bg-foreground font-medium text-on-brand'
                : 'border-border bg-surface-card text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'txns' ? <TxnList /> : <OrderList />}
      </div>
    </div>
  );
}

function TxnList() {
  const txnsQ = useTransactions({ page: 1, page_size: 50 });
  if (txnsQ.isLoading) return <Spinner />;
  const items = txnsQ.data?.items ?? [];
  if (items.length === 0) return <Empty text="还没有经费流水" />;

  return (
    <ul className="overflow-hidden rounded-16 border border-border bg-surface-card">
      {items.map((t, i) => (
        <li
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 ${i === items.length - 1 ? '' : 'border-b border-border-soft'}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-12 text-foreground">{t.note || t.type}</p>
            <p className="text-12 text-faint">
              {new Date(t.created_at).toLocaleString('zh-CN')}
            </p>
          </div>
          <span
            className={cn(
              'text-14 font-medium',
              t.amount >= 0 ? 'text-brand-green' : 'text-brand-red'
            )}
          >
            {t.amount >= 0 ? '+' : ''}
            {fmtCredit(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OrderList() {
  const ordersQ = useOrders();
  if (ordersQ.isLoading) return <Spinner />;
  const items = ordersQ.data ?? [];
  if (items.length === 0) return <Empty text="还没有订单记录" />;

  return (
    <ul className="overflow-hidden rounded-16 border border-border bg-surface-card">
      {items.map((o, i) => (
        <OrderItem key={o.order_no} o={o} last={i === items.length - 1} />
      ))}
    </ul>
  );
}

/**
 * 单条订单。
 *
 * 🔴 退款**不改 orders.status**(后端仍是 'paid'),`refund_status` 是叠加在「已支付」之上的
 * 第二枚状态:这笔钱确实收到过,退款是发生在其后的另一件事。所以这里金额照常展示、不划掉、
 * 不把订单从列表里藏掉,只多一枚徽章 + 一行「已退/实付」小字。
 *
 * 🔴 徽章口径对齐的是**用户端 PC**(features/settings/components/billing-history-panels.tsx)
 * 而不是管理台:variant='muted'。管理台那套 destructive/warning 是**运维视角的严重度分级**,
 * 用户自己的账单不是告警面板 —— 退款对用户是中性事件,不该是红色告警。
 * 同一个用户同一笔订单,在电脑上是灰色中性标、在手机上是红色告警标,是明确的不一致。
 * 移动端没有 hover,故把 PC 放在 title 里的「已退 ¥x / 实付 ¥y」摊成可见的一行。
 */
function OrderItem({ o, last }: { o: Order; last: boolean }) {
  const refundStatus = o.refund_status ?? '';
  const refunded = o.refunded_amount ?? 0;

  return (
    <li className={`space-y-1 px-4 py-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-12 font-medium text-foreground">
            {o.plan_name || (o.order_type === 'recharge' ? '经费充值' : '会员订阅')}
          </span>
          {refundStatus ? (
            <Badge variant="muted" className="shrink-0">
              {REFUND_STATUS_LABEL[refundStatus] ?? refundStatus}
            </Badge>
          ) : null}
        </span>
        <span className="shrink-0 text-14 font-medium text-foreground">
          {/* final_amount 单位是元(与 PC billing-panels OrderRow 同口径),不要再 /100 */}
          ¥{o.final_amount.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-12 text-faint">
        <span className="truncate">{o.order_no}</span>
        <span className="shrink-0">{o.created_at ? new Date(o.created_at).toLocaleDateString('zh-CN') : ''}</span>
      </div>
      {refundStatus ? (
        <p className="text-12 text-faint">
          已退 <strong className="font-medium text-brand-red">¥{refunded.toFixed(2)}</strong>
          {' / 实付 '}¥{o.final_amount.toFixed(2)}
        </p>
      ) : null}
    </li>
  );
}

function Spinner() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-faint" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-16 text-center text-12 text-faint">{text}</p>;
}

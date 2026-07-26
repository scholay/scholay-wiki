import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useOrders, useTransactions } from '../../api/membership';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

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
              'rounded-pill border px-3.5 py-1.5 text-sm transition-colors',
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
            <p className="truncate text-sm text-foreground">{t.note || t.type}</p>
            <p className="text-xs text-faint">
              {new Date(t.created_at).toLocaleString('zh-CN')}
            </p>
          </div>
          <span
            className={cn(
              'text-md font-semibold',
              t.amount >= 0 ? 'text-brand-green' : 'text-brand-red'
            )}
          >
            {t.amount >= 0 ? '+' : ''}
            {t.amount.toLocaleString('en-US')}
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
        <li
          key={o.order_no}
          className={`space-y-1 px-4 py-3 ${i === items.length - 1 ? '' : 'border-b border-border-soft'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {o.plan_name || (o.order_type === 'recharge' ? '经费充值' : '会员订阅')}
            </span>
            <span className="text-md font-semibold text-foreground">
              ¥{(o.final_amount / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-faint">
            <span>{o.order_no}</span>
            <span>{o.created_at ? new Date(o.created_at).toLocaleDateString('zh-CN') : ''}</span>
          </div>
        </li>
      ))}
    </ul>
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
  return <p className="py-16 text-center text-sm text-faint">{text}</p>;
}

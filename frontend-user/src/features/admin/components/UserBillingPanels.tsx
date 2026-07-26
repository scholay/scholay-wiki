// 用户详情抽屉的「财务下钻」区块 —— 订单 / 经费流水(充值·消费·赠送) / 兑换记录。
// 与用户设置页(billing-panels)字段对齐;数据经 admin 专用端点懒加载(抽屉打开才取)。
// 单独成文件:UserDetailDrawer 保持精简(单文件 ≤ 300 行约束)。
import { Loader2, ShoppingCart, ArrowLeftRight, Ticket } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import {
  useAdminUserOrders,
  useAdminUserTransactions,
  useAdminUserRedemptions,
  type AdminOrder,
  type AdminCreditTransaction,
  type AdminRedemption,
} from '../api/users';

const PAGE = 20;

// credit_transactions.type → 中文。覆盖后端写入的全部来源。
const TX_LABEL: Record<string, string> = {
  recharge: '充值',
  grant_subscription: '订阅赠送',
  gift: '兑换赠送',
  reset_consume: '重置消耗',
  expire: '过期清零',
  refund: '退款',
  admin_adjust: '管理员调整',
  task: '任务奖励',
};

const ORDER_TYPE_LABEL: Record<string, string> = { recharge: '充值', subscription: '订阅' };
const ORDER_STATUS: Record<string, { label: string; variant: 'default' | 'muted' | 'destructive' | 'outline' }> = {
  paid: { label: '已支付', variant: 'default' },
  pending: { label: '待支付', variant: 'muted' },
  expired: { label: '已过期', variant: 'muted' },
  refunded: { label: '已退款', variant: 'destructive' },
  failed: { label: '失败', variant: 'destructive' },
};

function SectionShell({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-faint">{icon}</span>
        <h4 className="text-2xs font-bold text-faint">{title}</h4>
        {count != null && count > 0 && <span className="text-2xs text-faint">· {count}</span>}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return <Loader2 className="size-4 animate-spin text-faint" />;
}
function Empty({ text }: { text: string }) {
  return <span className="text-xs text-faint">{text}</span>;
}

function fmtTime(s?: string | null): string {
  return s ? s.slice(0, 16).replace('T', ' ') : '—';
}

/** 订单 */
function OrdersSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserOrders(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  return (
    <SectionShell title="订单" icon={<ShoppingCart className="size-3.5" />} count={q.data?.total}>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="暂无订单" />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {rows.map((o: AdminOrder) => {
            const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: 'muted' as const };
            return (
              <li key={o.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="text-subtle">{ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}</span>
                    {o.plan_name && <span className="truncate text-faint">{o.plan_name}</span>}
                  </span>
                  <span className="font-mono text-2xs text-faint">{o.order_no}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums text-foreground">¥{o.final_amount.toFixed(2)}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </span>
                  <span className="text-2xs text-faint">{fmtTime(o.payment_time ?? o.created_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}

/** 经费流水(充值 / 消费 / 赠送 / 重置 / 过期…)—— credit_transactions 全类型 */
function TransactionsSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserTransactions(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  return (
    <SectionShell title="经费流水(充值 / 消费)" icon={<ArrowLeftRight className="size-3.5" />} count={q.data?.total}>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="暂无流水" />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {rows.map((t: AdminCreditTransaction) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <div className="flex min-w-0 flex-col">
                <span className="text-subtle">{TX_LABEL[t.type] ?? t.type}</span>
                {t.note && <span className="truncate text-2xs text-faint">{t.note}</span>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className={cn('tabular-nums font-medium', t.amount >= 0 ? 'text-brand-green' : 'text-brand-red')}>
                  {t.amount >= 0 ? '+' : ''}
                  {t.amount}
                </span>
                <span className="text-2xs text-faint">余 {t.perm_after + t.temp_after} · {fmtTime(t.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/** 经费兑换(兑换码) */
function RedemptionsSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserRedemptions(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  const grant = (r: AdminRedemption) =>
    r.grant_kind === 'tier'
      ? `会员 ${r.grant_tier}${r.grant_days ? ` · ${r.grant_days}天` : ''}`
      : `经费 ${r.grant_credits}（${r.credit_kind === 'perm' ? '永久' : '临时'}）`;
  return (
    <SectionShell title="经费兑换" icon={<Ticket className="size-3.5" />} count={q.data?.total}>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="暂无兑换记录" />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {rows.map((r: AdminRedemption, i: number) => (
            <li key={`${r.code}-${i}`} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <div className="flex min-w-0 flex-col">
                <span className="text-subtle">{grant(r)}</span>
                <span className="font-mono text-2xs text-faint">{r.code}</span>
              </div>
              <span className="shrink-0 text-2xs text-faint">{fmtTime(r.redeemed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/** 用户详情抽屉的财务下钻三件套(订单 / 经费流水 / 兑换),全部懒加载。 */
export function UserBillingSections({ userId, open }: { userId: number; open: boolean }) {
  return (
    <>
      <OrdersSection userId={userId} open={open} />
      <TransactionsSection userId={userId} open={open} />
      <RedemptionsSection userId={userId} open={open} />
    </>
  );
}

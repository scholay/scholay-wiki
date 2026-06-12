import { useEffect, useState } from 'react';
import { Wallet, ShoppingCart, Gift, PieChart } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { UserCell } from '../components/UserCell';
import { RevenueChart } from '../components/orders/RevenueChart';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import {
  useAdminOrders,
  useAdminOrderStats,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAY_METHOD_LABEL,
  type AdminOrder,
} from '../api/orders';

/**
 * 订单与营收(后台)—— 收费侧统一管理区的主页。
 * 数据真源:orders 表(vip 充值/订阅,支付回调履约,金额「元」)。
 * 布局:KPI(窗口营收/构成/订单状态/兑换码核销)→ 每日营收堆叠柱(充值/订阅)
 *      → 筛选(时间/状态/类型/用户)→ 订单明细表(分页)。
 * 同组导航:会员兑换码(/admin/vip-codes)· 计费配置(/admin/billing-config)。
 */

const DAY_PRESETS = [7, 30, 90];
const PAGE_SIZE = 20;

const yuan = (n?: number) =>
  typeof n === 'number' ? `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';

export function OrdersPage() {
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  // 筛选变化 → 回第 1 页(防停在不存在的页码)。
  useEffect(() => {
    setPage(1);
  }, [days, status, type, keyword]);

  const { data: stats, isLoading: statsLoading } = useAdminOrderStats(days);
  const { data: list, isLoading: listLoading } = useAdminOrders({
    days,
    status: status || undefined,
    type: type || undefined,
    keyword: keyword || undefined,
    page,
    page_size: PAGE_SIZE,
  });

  const t = stats?.totals;

  const columns: Column<AdminOrder>[] = [
    {
      header: '时间',
      width: 150,
      cell: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {r.created_at?.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      header: '用户',
      width: 180,
      cell: (r) => <UserCell id={r.user_id} name={r.username} email={r.email} />,
    },
    {
      header: '订单',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium text-subtle">{r.plan_name || ORDER_TYPE_LABEL[r.order_type]}</span>
          <span className="text-2xs text-faint tabular-nums">{r.order_no}</span>
        </div>
      ),
    },
    {
      header: '类型',
      width: 70,
      cell: (r) => (
        <Badge variant={r.order_type === 'subscription' ? 'default' : 'outline'}>
          {ORDER_TYPE_LABEL[r.order_type] ?? r.order_type}
        </Badge>
      ),
    },
    {
      header: '金额',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-xs font-medium text-foreground">{yuan(r.final_amount)}</span>,
    },
    {
      header: '经费',
      width: 80,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-xs text-subtle">{r.credits_granted.toLocaleString()}</span>,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) => (
        <Badge
          variant={r.status === 'paid' ? 'default' : r.status === 'pending' ? 'warning' : 'muted'}
        >
          {ORDER_STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      header: '支付',
      width: 130,
      cell: (r) =>
        r.status === 'paid' ? (
          <div className="flex flex-col">
            <span className="text-xs text-subtle">{PAY_METHOD_LABEL[r.payment_method] ?? r.payment_method}</span>
            <span className="text-2xs text-faint tabular-nums">
              {r.payment_time?.slice(0, 19).replace('T', ' ')}
            </span>
          </div>
        ) : (
          <span className="text-xs text-faint">—</span>
        ),
    },
  ];

  return (
    <AdminPageLayout
      title="订单与营收"
      description="充值 / 订阅订单与营收统计 · 同组:会员兑换码 · 计费配置"
    >
      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)
        ) : (
          <>
            <StatCard
              icon={<Wallet />}
              label={`${days} 日营收`}
              value={yuan(t?.revenue)}
              hint={`今日 ${yuan(t?.revenue_today)}`}
            />
            <StatCard
              icon={<PieChart />}
              label="营收构成"
              value={yuan(t?.recharge_revenue)}
              hint={`充值 ↑ · 订阅 ${yuan(t?.subscription_revenue)}`}
            />
            <StatCard
              icon={<ShoppingCart />}
              label="已支付订单"
              value={(t?.paid_count ?? 0).toLocaleString()}
              hint={`待支付 ${(t?.pending_count ?? 0).toLocaleString()} · 已过期 ${(t?.expired_count ?? 0).toLocaleString()}`}
            />
            <StatCard
              icon={<Gift />}
              label="兑换码核销"
              value={(t?.redeemed_codes ?? 0).toLocaleString()}
              hint="窗口内核销次数"
            />
          </>
        )}
      </section>

      {/* 每日营收(充值/订阅堆叠) */}
      <RevenueChart daily={stats?.daily ?? []} />

      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChips
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={DAY_PRESETS.map((d) => ({ value: String(d), label: `近${d}天` }))}
        />
        <span className="h-4 w-px bg-border-separator" />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: '全部状态' },
            { value: 'paid', label: '已支付' },
            { value: 'pending', label: '待支付' },
            { value: 'expired', label: '已过期' },
          ]}
        />
        <span className="h-4 w-px bg-border-separator" />
        <FilterChips
          value={type}
          onChange={setType}
          options={[
            { value: '', label: '全部类型' },
            { value: 'recharge', label: '充值' },
            { value: 'subscription', label: '订阅' },
          ]}
        />
        <form
          className="ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setKeyword(kwInput.trim());
          }}
        >
          <Input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onBlur={() => setKeyword(kwInput.trim())}
            placeholder="用户 ID / 用户名 / 邮箱 / 手机号"
            className="h-8 w-60"
          />
        </form>
      </section>

      {/* 订单明细 */}
      <DataTable
        columns={columns}
        rows={list?.items ?? []}
        loading={listLoading}
        emptyMessage="窗口内没有订单"
        rowKey={(r) => r.id}
      />
      <Pagination total={list?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </AdminPageLayout>
  );
}

/** 一组互斥筛选 chip(与 Token 看板的模式切换同款视觉)。 */
function FilterChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
            o.value === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

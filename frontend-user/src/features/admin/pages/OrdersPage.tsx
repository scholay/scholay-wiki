import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  Wallet, ShoppingCart, Gift, PieChart, AlertTriangle, MoreHorizontal, Undo2, type LucideIcon,
} from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { UserCell } from '../components/UserCell';
import { TimeCell } from '../components/TimeCell';
import { CopyableId } from '../components/CopyableId';
import { RevenueChart } from '../components/orders/RevenueChart';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { RefundOrderDialog } from '../components/RefundOrderDialog';
import { useHasPermission, PERM } from '../permissions';
import {
  useAdminOrders,
  useAdminOrderStats,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAY_METHOD_LABEL,
  REFUND_STATUS_LABEL,
  type AdminOrder,
} from '../api/orders';

/**
 * 订单与营收(后台)—— 收费侧统一管理区的主页。
 * 数据真源:orders 表(vip 充值/订阅,支付回调履约,金额「元」)。
 * 布局:营收失败横幅 → KPI(窗口营收/构成/订单状态/兑换码核销)→ 每日营收堆叠面积
 *      → 筛选(时间/状态/类型/用户)→ 订单明细表(分页)。
 * 同组导航:会员兑换码(/admin/vip-codes)· 计费配置(/admin/billing-config)。
 *
 * 🔴 筛选态(days/status/type/kw/page)全部落 URL —— 这是唯一的实时收入看板,
 * 「近 90 天所有 pending 的订阅单」这种视图要能直接把链接甩给同事,刷新也不能丢。
 */

const PAGE_SIZE = 20;
const DEFAULT_DAYS = 30;

const yuan = (n?: number) =>
  typeof n === 'number' ? `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';
// 🔴 不回落成 0:接口挂时显示「已支付订单 0」比显示「—」危险得多(会被当成真实经营结论)。
const num = (n?: number) => (n == null ? '—' : n.toLocaleString());
/** 净额 = 毛额 - 退款额。任一口径缺失就整格显示「—」,不拿 0 顶替(与 yuan/num 同一条铁律)。 */
const netYuan = (gross?: number, refunded?: number) =>
  typeof gross === 'number' ? yuan(gross - (refunded ?? 0)) : '—';

const toInt = (fallback: number) => (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function OrdersPage() {
  // 筛选 + 分页全部走 URL(useUrlState 读、usePatchUrlState 写)。
  // 写用 patch 是必须的:同一个事件里连着调多个 useUrlState setter 会互相覆盖(见 hook 注释),
  // 而「改筛选 → 回第 1 页」正好每次都要同时写两个 key。
  const [days] = useUrlState('days', DEFAULT_DAYS, toInt(DEFAULT_DAYS));
  const [status] = useUrlState('status', '');
  const [type] = useUrlState('type', '');
  const [keyword] = useUrlState('kw', '');
  const [page, setPage] = useUrlState('page', 1, toInt(1));
  const patch = usePatchUrlState();

  // 退款 —— 权限点单列(finance.refund),运营看得到订单但退不了款。
  // 弹窗常驻挂载、只切 open:条件卸载 Radix Dialog 会来不及清理 body 上的
  // pointer-events:none,整页点不动(本仓库踩过)。
  const canRefund = useHasPermission(PERM.financeRefund);
  const [refundTarget, setRefundTarget] = useState<AdminOrder | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const openRefund = (r: AdminOrder) => {
    setRefundTarget(r);
    setRefundOpen(true);
  };

  // 搜索框的未提交输入(提交/失焦才写进 URL,避免每敲一个字符 navigate 一次)
  const [kwInput, setKwInput] = useState(keyword);
  // URL 侧的 keyword 被外部改动(浏览器后退 / 点「清除筛选」)时把输入框拉回来 ——
  // 否则输入框里留着旧词,下次失焦会把它**重新提交**回去,清了等于没清。
  useEffect(() => {
    setKwInput(keyword);
  }, [keyword]);

  const setDays = (d: number) => patch({ days: d === DEFAULT_DAYS ? null : d, page: null });
  const setStatus = (v: string) => patch({ status: v || null, page: null });
  const setType = (v: string) => patch({ type: v || null, page: null });
  const commitKeyword = (v: string) => {
    if (v === keyword) return;
    patch({ kw: v || null, page: null });
  };

  const statsQ = useAdminOrderStats(days);
  const listQ = useAdminOrders({
    days,
    status: status || undefined,
    type: type || undefined,
    keyword: keyword || undefined,
    page,
    page_size: PAGE_SIZE,
  });

  const stats = statsQ.data;
  const list = listQ.data;
  // 失败时把 totals 整个置空 —— 下游 yuan()/num() 一律吐「—」,不会出现「今日营收 ¥0」这种断言。
  const t = statsQ.isError ? undefined : stats?.totals;
  const dayLabel = `近${days}天`;

  const hasFilter = !!(status || type || keyword) || days !== DEFAULT_DAYS;
  const clearFilters = () => patch({ status: null, type: null, kw: null, days: null, page: null });

  const columns: Column<AdminOrder>[] = [
    {
      header: '时间',
      width: 150,
      cell: (r) => <TimeCell value={r.created_at} className="text-12" />,
    },
    {
      header: '用户',
      width: 180,
      cell: (r) => <UserCell id={r.user_id} name={r.username} email={r.email} />,
    },
    {
      // 网关交易号是**实际退钱与对账的唯一抓手**:本系统的退款是「先去商户后台退钱、
      // 回来在本页行操作里做退款登记(记账 + 回收权益 + 通知用户)」,系统本身不调网关。
      // 所以这个号必须看得见、复制得走 —— 管理员拿它去微信/支付宝商户后台操作那一步。
      header: '订单',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-12 font-medium text-subtle">{r.plan_name || ORDER_TYPE_LABEL[r.order_type]}</span>
          <CopyableId value={r.order_no} label="订单号" className="text-12 text-faint" />
          {r.transaction_no && (
            <span
              className="inline-flex min-w-0 items-center gap-1 text-12 text-faint"
              title="网关交易号(退款对账用)—— 拿它去微信/支付宝商户后台操作退款"
            >
              <span className="shrink-0">交易号</span>
              <CopyableId value={r.transaction_no} label="网关交易号" />
            </span>
          )}
        </div>
      ),
    },
    {
      header: '类型',
      width: 96,
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          <Badge variant={r.order_type === 'subscription' ? 'default' : 'outline'}>
            {ORDER_TYPE_LABEL[r.order_type] ?? r.order_type}
          </Badge>
          {/* 年度订阅单显式彰显(0079),不与月度混同;升级单是周期内补差(不冠周期,与通知/订单名口径一致),排除 */}
          {r.order_type === 'subscription' && r.billing_cycle === 'yearly' && r.sub_action !== 'upgrade' && (
            <span className="rounded-pill bg-brand-amber/10 px-1.5 py-0.5 text-12 font-medium text-brand-amber">年度</span>
          )}
        </span>
      ),
    },
    {
      header: '金额',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-12 font-medium text-foreground">{yuan(r.final_amount)}</span>,
    },
    {
      // 与用户抽屉「经费流水」区块同款口径提示(0095 汇率重锚前后金额刻度不同)。
      header: (
        <span title="按量付费消耗不逐笔入流水;2026-07-29 汇率重锚(60→100 经费/¥)前的历史行是旧刻度">
          经费
        </span>
      ),
      width: 80,
      align: 'right',
      cell: (r) => (
        <span
          className="tabular-nums text-12 text-subtle"
          title={`${r.credits_granted.toLocaleString()} 经费 ≈ ¥${(r.credits_granted / 100).toFixed(2)}(100 经费 = ¥1)`}
        >
          {r.credits_granted.toLocaleString()}
        </span>
      ),
    },
    {
      header: '状态',
      width: 110,
      // 退款**不改 status**(仍是「已支付」),所以退款徽章是叠加的第二枚而不是替换。
      // 这正是设计意图:这笔钱确实收到过,退款是发生在其后的另一件事。
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Badge
            variant={r.status === 'paid' ? 'default' : r.status === 'pending' ? 'warning' : 'muted'}
          >
            {ORDER_STATUS_LABEL[r.status] ?? r.status}
          </Badge>
          {r.refund_status && (
            <Badge
              variant={r.refund_status === 'full' ? 'destructive' : 'warning'}
              title={`已退 ¥${(r.refunded_amount ?? 0).toFixed(2)} / 实付 ¥${r.final_amount.toFixed(2)}`}
            >
              {REFUND_STATUS_LABEL[r.refund_status] ?? r.refund_status}
              {r.refund_status === 'partial' && ` ¥${(r.refunded_amount ?? 0).toFixed(2)}`}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: '支付',
      width: 130,
      cell: (r) =>
        r.status === 'paid' ? (
          <div className="flex flex-col">
            <span className="text-12 text-subtle">{PAY_METHOD_LABEL[r.payment_method] ?? r.payment_method}</span>
            <TimeCell value={r.payment_time} className="text-12" />
          </div>
        ) : (
          <span className="text-12 text-faint">—</span>
        ),
    },
    // 行操作 —— 仅有 finance.refund 权限时才渲染整列。
    // ⚠️ 藏按钮不是安全边界:后端 financeRefund 路由组的 RequirePermission 才是。
    ...(canRefund
      ? [
          {
            header: '',
            width: 60,
            align: 'right' as const,
            cell: (r: AdminOrder) => {
              // 只有真正收到过钱、且还没退完的单才谈得上退款。
              const refundable = r.status === 'paid' && (r.refunded_amount ?? 0) < r.final_amount;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="更多操作">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!refundable}
                      onSelect={() => refundable && openRefund(r)}
                    >
                      <Undo2 className="size-3.5" />
                      {r.refund_status === 'full' ? '已全额退款' : '退款登记…'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <AdminPageLayout
      title="订单与营收"
      description="充值 / 订阅订单与营收统计 · 同组:会员兑换码 · 计费配置"
      onRefresh={() => {
        void statsQ.refetch();
        void listQ.refetch();
      }}
      refreshing={statsQ.isFetching || listQ.isFetching}
    >
      {/* 🔴 营收接口失败横幅 —— 后端 queryRev 自己就注释着「营收看板『掉 0』与『真没收入』不可分辨」。
          没有这条横幅时,KPI/图/表三处会同时肯定地宣称"今天零收入"。 */}
      {statsQ.isError && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-12 border border-border bg-danger-soft px-3 py-2 text-12 text-brand-red">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0">
            营收数据加载失败 —— 下方数字不可信,不要据此判断"今天没有收入"。
            <span className="ml-1 text-subtle">{toApiError(statsQ.error).message}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 px-2 text-12"
            onClick={() => void statsQ.refetch()}
            disabled={statsQ.isFetching}
          >
            重试
          </Button>
        </div>
      )}

      {/* KPI —— 每张卡展示 今日 / 近N天 / 全部 三口径 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsQ.isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 rounded-16" />)
        ) : (
          <>
            {/* 营收展示**毛额 / 退款 / 净额**三列。
                退款刻意不去改历史订单的 status —— 那会让过去某一天的营收柱子当场变矮
                且没有任何维度能解释差额。所以退款在这里作为独立一项呈现,
                净额 = 毛额 - 退款额,三个数都摆出来,管理员随时能对上账。 */}
            <PeriodStatCard
              icon={Wallet}
              label="营收(毛/退/净)"
              // 跨两格:3 个金额挤在 lg 的 1/4 宽度里,¥1,234,567.89 会被 truncate 静默截断
              className="lg:col-span-2"
              cols={['毛额', '退款', '净额']}
              rows={[
                {
                  period: '今日',
                  values: [yuan(t?.revenue_today), yuan(t?.refunded_today), netYuan(t?.revenue_today, t?.refunded_today)],
                },
                {
                  period: dayLabel,
                  values: [yuan(t?.revenue), yuan(t?.refunded), netYuan(t?.revenue, t?.refunded)],
                },
                {
                  period: '全部',
                  values: [yuan(t?.revenue_all), yuan(t?.refunded_all), netYuan(t?.revenue_all, t?.refunded_all)],
                },
              ]}
              footer={
                (t?.refund_all ?? 0) > 0
                  ? `累计退款 ${num(t?.refund_all)} 笔 · 退款按发生日归属,不改原订单营收`
                  : undefined
              }
            />
            <PeriodStatCard
              icon={PieChart}
              label="营收构成"
              cols={['充值', '订阅']}
              rows={[
                { period: '今日', values: [yuan(t?.recharge_today), yuan(t?.subscription_today)] },
                { period: dayLabel, values: [yuan(t?.recharge_revenue), yuan(t?.subscription_revenue)] },
                { period: '全部', values: [yuan(t?.recharge_all), yuan(t?.subscription_all)] },
              ]}
            />
            <PeriodStatCard
              icon={ShoppingCart}
              label="已支付订单"
              rows={[
                { period: '今日', values: [num(t?.paid_today)] },
                { period: dayLabel, values: [num(t?.paid_count)] },
                { period: '全部', values: [num(t?.paid_all)] },
              ]}
              footer={`窗口内 待支付 ${num(t?.pending_count)} · 已过期 ${num(t?.expired_count)}`}
            />
            <PeriodStatCard
              icon={Gift}
              label="兑换码核销"
              rows={[
                { period: '今日', values: [num(t?.redeemed_today)] },
                { period: dayLabel, values: [num(t?.redeemed_codes)] },
                { period: '全部', values: [num(t?.redeemed_all)] },
              ]}
            />
          </>
        )}
      </section>

      {/* 每日营收趋势(充值/订阅堆叠面积)—— 时间筛选 7/30/90 + 区间总计都在图头部,
          days 是整页统一状态,同时驱动上方 KPI 与下方订单表。 */}
      <RevenueChart
        daily={statsQ.isError ? [] : (stats?.daily ?? [])}
        days={days}
        onDaysChange={setDays}
        error={statsQ.error}
        totalRevenue={t?.revenue}
        totalRecharge={t?.recharge_revenue}
        totalSubscription={t?.subscription_revenue}
        totalOrders={t?.paid_count}
      />

      {/* 筛选(时间筛选已移到营收图头部,这里只留状态/类型/搜索) */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
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
          className="w-full sm:ml-auto sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            commitKeyword(kwInput.trim());
          }}
        >
          <Input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onBlur={() => commitKeyword(kwInput.trim())}
            // 后端 AdminList 的 UserSearchClause 只传 users.id/username/email/phone —— 订单号搜不到。
            // 在后端补 order_no/transaction_no 之前,placeholder 必须如实说明,别让人拿着订单号白搜。
            placeholder="用户 ID / 用户名 / 邮箱 / 手机号(暂不支持订单号)"
            title="后端仅按用户维度检索;订单号 / 交易号暂不可搜"
            className="h-8 w-full sm:w-72"
          />
        </form>
      </section>

      {/* 订单明细 —— error 必须透传:不传的话请求失败会和"窗口内真的没有订单"长得一模一样 */}
      <DataTable
        columns={columns}
        rows={list?.items}
        loading={listQ.isLoading}
        error={listQ.error}
        onRetry={() => void listQ.refetch()}
        emptyMessage={hasFilter ? '当前筛选下没有订单' : '窗口内没有订单'}
        emptyDescription={hasFilter ? '换个时间窗口或清除状态 / 类型 / 搜索条件再试。' : undefined}
        emptyAction={
          hasFilter ? (
            <Button size="sm" variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          ) : undefined
        }
        rowKey={(r) => r.id}
      />
      <RefundOrderDialog
        order={refundTarget}
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
      />

      <Pagination total={list?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </AdminPageLayout>
  );
}

/**
 * 三口径 KPI 卡 —— 今日 / 近N天 / 全部 三行。
 * 单指标(订单/核销)传 rows 每行 1 个 value;多列卡传 cols(如 ['毛额','退款','净额'])每行等长 values。
 *
 * 🔴 列数必须**跟随 cols 长度**。这里曾经写死成 `multi ? 'grid-cols-[auto_1fr_1fr]' : ...`
 * 二值分叉,即最多 auto + 2 个数值列 —— 当时唯一的多列调用方「营收构成」正好是 2 列所以没暴露。
 * 后来营收卡传了 3 列(毛/退/净),每逻辑行有 4 个 grid item 塞进 3 列,表头与数据整体错位:
 * 「净额」跑到数据行位置、今日毛额出现在「近30天」标签下 —— 而这是全站唯一的实时收入看板首屏第一张卡,
 * tsc / lint / 设计护栏一个都拦不住。
 * Tailwind 无法动态拼 arbitrary class,用 style 传 gridTemplateColumns 是这里的合规做法。
 */
function PeriodStatCard({
  icon: Icon,
  label,
  cols,
  rows,
  footer,
  className,
}: {
  icon: LucideIcon;
  label: string;
  cols?: string[];
  rows: Array<{ period: string; values: ReactNode[] }>;
  footer?: ReactNode;
  className?: string;
}) {
  const multi = !!cols && cols.length > 1;
  // 数值列数以 cols 为准;没有 cols 时看第一行有几个值(单指标卡就是 1)
  const valueCols = cols?.length ?? rows[0]?.values.length ?? 1;
  return (
    <div
      className={cn(
        'rounded-16 border border-border bg-surface-card p-4 flex flex-col gap-2',
        className
      )}
    >
      <div className="flex items-center justify-between text-faint">
        <span className="text-12">{label}</span>
        <Icon className="size-4" />
      </div>
      <div
        className="grid items-center gap-x-3 gap-y-1"
        style={{ gridTemplateColumns: `auto repeat(${valueCols}, minmax(0, 1fr))` }}
      >
        {multi && (
          <>
            <span />
            {cols!.map((c) => (
              <span key={c} className="text-12 text-faint text-right">
                {c}
              </span>
            ))}
          </>
        )}
        {rows.map((r) => (
          <Fragment key={r.period}>
            <span className="text-12 text-faint">{r.period}</span>
            {r.values.map((v, i) => (
              <span
                key={i}
                className={cn(
                  'tabular-nums text-right font-medium text-foreground truncate text-12'
                )}
              >
                {v}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
      {footer && <div className="text-12 text-faint">{footer}</div>}
    </div>
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
            'h-7 rounded-8 px-2.5 text-12 font-medium transition-colors',
            o.value === value
              ? 'bg-foreground text-on-dark'
              : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

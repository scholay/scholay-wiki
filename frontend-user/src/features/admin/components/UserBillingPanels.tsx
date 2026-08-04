// 用户详情抽屉的「财务下钻」区块 —— 订单 / 经费流水(充值·消费·赠送) / 兑换记录。
// 与用户设置页(billing-panels)字段对齐;数据经 admin 专用端点懒加载(抽屉打开才取)。
// 单独成文件:UserDetailDrawer 保持精简(单文件 ≤ 300 行约束)。
import { AlertTriangle, Loader2, ShoppingCart, ArrowLeftRight, Ticket } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { formatGrantDuration } from '@/shared/lib/grant-unit';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CopyableId } from './CopyableId';
import { TimeCell } from './TimeCell';
// 退款状态标签从订单页那份取,避免同一套文案在后台出现两种叫法(同 feature 内 import,不跨 feature)。
import { REFUND_STATUS_LABEL } from '../api/orders';
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
  payg_daily: '按量付费(日累计)', // 0098:每用户每天一行,upsert 累加
  invite_reward: '邀请奖励', // 邀请好友注册奖励(ref_id=被邀者 user_id)
};

// 0098 起金额可带小数(payg 日聚合行)。整数原样;小数最多 4 位去尾零。
const fmtCredit = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : String(parseFloat(v.toFixed(4))));

const ORDER_TYPE_LABEL: Record<string, string> = { recharge: '充值', subscription: '订阅' };
// orders.status 的全集 —— 后端(internal/vip/order.go)只写 pending / paid / expired 三种。
//
// 🔴 这里此前还有 `refunded` 与 `failed` 两条,**都是永远命中不了的死映射**,已删:
//   · 退款(0107)刻意**不改 status**(仍是 'paid'),改走 refund_status —— 见 AdminOrder 字段注释;
//     留着 `refunded: 已退款` 会让下一个人以为「退款订单要在这里变色」,进而在错误的层面查问题。
//   · `failed` 后端从未写入过(下单即 pending,支付失败就一直挂着直到超时转 expired)。
// 未知 status 走下面的 fallback(原样显示 + muted),所以删掉不会出现空白徽章。
const ORDER_STATUS: Record<string, { label: string; variant: 'default' | 'muted' }> = {
  paid: { label: '已支付', variant: 'default' },
  pending: { label: '待支付', variant: 'muted' },
  expired: { label: '已过期', variant: 'muted' },
};

/** 三块共用的 query 形状 —— 只取渲染分支需要的字段(用 unknown 收 error,交给 toApiError)。 */
interface SectionQuery {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  data?: { total: number } | undefined;
}

/**
 * 财务区块外壳 —— **加载 / 失败 / 空 / 有数据 四态收在这里一处**。
 *
 * 🔴 为什么必须由外壳统一分叉:改造前三块各写各的
 * `isLoading ? <Loading/> : rows.length === 0 ? <Empty/> : <列表/>`,完全没有 isError 分支,
 * 而 rows 来自 `q.data?.items ?? []` —— 接口 500 时 rows 是 `[]`,于是后台**斩钉截铁**地显示
 * 「暂无订单 / 暂无流水 / 暂无兑换记录」。用户投诉"我付了钱没到账"时,运维据此得出的结论是
 * 「这人根本没下过单」,方向从第一步就错了。收进外壳是为了下次加第四块时漏不掉。
 *
 * 另一处口径修正:请求固定 `page_size=20` 但标题的 count 显示的是 `total` ——
 * 「订单 · 47」下面只列 20 条,既没分页也没说明,运维会以为看到的就是全部。
 * 现在标题写「最近 20 / 共 47」,把"这是截断视图"说出来。
 */
function SectionShell({
  title,
  icon,
  query,
  shown,
  emptyText,
  hint,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  query: SectionQuery;
  /** 当前实际渲染出来的条数 */
  shown: number;
  emptyText: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const total = query.data?.total;
  const truncated = total != null && total > shown;

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-faint">{icon}</span>
        <h4 className="text-12 font-medium text-faint">{title}</h4>
        {!query.isError && total != null && total > 0 && (
          <span className="text-12 text-faint">
            · {truncated ? `最近 ${shown} / 共 ${total.toLocaleString()}` : total.toLocaleString()}
          </span>
        )}
      </div>
      {hint}
      {query.isError ? (
        <SectionError error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <Loader2 className="size-4 animate-spin text-faint" />
      ) : shown === 0 ? (
        <span className="text-12 text-faint">{emptyText}</span>
      ) : (
        children
      )}
      {truncated && !query.isError && (
        <p className="mt-1.5 text-12 text-faint">
          仅显示最近 {shown} 条(共 {total.toLocaleString()} 条),更早的记录请到对应的订单 / 流水页按用户筛选。
        </p>
      )}
    </section>
  );
}

/** 区块级失败态 —— 保留后端给的具体原因(别吞),给一个重试按钮。 */
function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const msg = toApiError(error).message || '加载失败';
  return (
    <div className="flex items-start gap-1.5 rounded-8 border border-border bg-danger-soft px-2.5 py-2 text-12">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brand-red" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-brand-red">加载失败:{msg}</span>
        <span className="text-faint">这里不代表"没有记录" —— 请重试后再下结论。</span>
        <Button variant="outline" size="sm" onClick={onRetry} className="self-start">
          重试
        </Button>
      </div>
    </div>
  );
}

/** 订单 */
function OrdersSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserOrders(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  return (
    <SectionShell
      title="订单"
      icon={<ShoppingCart className="size-3.5" />}
      query={q}
      shown={rows.length}
      emptyText="暂无订单"
    >
      <ul className="flex flex-col divide-y divide-border-soft">
        {rows.map((o: AdminOrder) => {
          const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: 'muted' as const };
          // 老订单(0107 迁移前)后端补的是 0,但 DTO 漂移时会是 undefined —— 兜底成 0,
          // 否则这里会渲染出「已退 ¥NaN」这种比不显示更糟的东西。
          const refunded = o.refunded_amount ?? 0;
          return (
            <li key={o.id} className="flex items-start justify-between gap-2 py-1.5 text-12">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="text-subtle">{ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}</span>
                  {o.plan_name && <span className="truncate text-faint">{o.plan_name}</span>}
                </span>
                {/* 订单号 / 第三方交易号 —— 排查支付问题时最常被粘进网关后台和工单的两个串,
                    所以都可一键复制。transaction_no 才是去微信/支付宝后台对账的那个 ID,
                    此前接口给了但界面一个字都不显示。 */}
                <CopyableId value={o.order_no} label="订单号" className="font-mono text-faint" />
                {o.transaction_no && (
                  <CopyableId
                    value={o.transaction_no}
                    label="交易号"
                    prefix={<span className="shrink-0 text-faint">交易号</span>}
                    className="font-mono text-faint"
                  />
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums text-foreground">¥{o.final_amount.toFixed(2)}</span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  {/* 退款徽章是**叠加**的第二枚,不替换「已支付」—— 钱确实收到过,退款是其后的另一件事。
                      变体/文案与订单页(OrdersPage 状态列)同口径;唯一差别是不把金额拼进徽章,
                      因为下一行已经有一条专门的「已退 ¥X」,拼进来就是同一个数在两处重复。 */}
                  {o.refund_status && (
                    <Badge
                      variant={o.refund_status === 'full' ? 'destructive' : 'warning'}
                      title={`已退 ¥${refunded.toFixed(2)} / 实付 ¥${o.final_amount.toFixed(2)}`}
                    >
                      {REFUND_STATUS_LABEL[o.refund_status] ?? o.refund_status}
                    </Badge>
                  )}
                </span>
                {/* 两个数并排给出,不靠 hover:上一行的 ¥59.00 是实付,这一行是已退 ¥20.00。
                    部分退款时运维最需要的就是这个差额,藏进 title 等于没有。 */}
                {o.refund_status && (
                  <span className="tabular-nums text-12 text-brand-red">已退 ¥{refunded.toFixed(2)}</span>
                )}
                {/* 同一列混两种语义(支付时刻 / 创建时刻)必须写前缀,否则「3 天前」指哪个说不清 */}
                <TimeCell
                  value={o.payment_time ?? o.created_at}
                  prefix={o.payment_time ? '支付 ' : '创建 '}
                  className="text-12"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

/** 经费流水(充值 / 消费 / 赠送 / 重置 / 过期…)—— credit_transactions 全类型 */
function TransactionsSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserTransactions(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  return (
    <SectionShell
      title="经费流水(充值 / 消费)"
      icon={<ArrowLeftRight className="size-3.5" />}
      query={q}
      shown={rows.length}
      emptyText="暂无流水"
      /* 口径提示:payg 扣的是钱包余额但不逐笔写 credit_transactions;且 0095 汇率重锚前后金额刻度不同。 */
      hint={
        <p className="mb-2 text-12 text-faint">
          按量付费消耗按天汇总为一条「按量付费(日累计)」(0098);2026-07-29 汇率重锚(60→100 经费/¥)前的历史行是旧刻度
        </p>
      }
    >
      <ul className="flex flex-col divide-y divide-border-soft">
        {rows.map((t: AdminCreditTransaction) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-12">
            <div className="flex min-w-0 flex-col">
              <span className="text-subtle">{TX_LABEL[t.type] ?? t.type}</span>
              {t.note && <span className="truncate text-12 text-faint">{t.note}</span>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn('tabular-nums font-medium', t.amount >= 0 ? 'text-brand-green' : 'text-brand-red')}>
                {t.amount >= 0 ? '+' : ''}
                {fmtCredit(t.amount)}
              </span>
              <span className="flex items-center gap-1 text-12 text-faint">
                余 {fmtCredit(t.perm_after + t.temp_after)} ·
                <TimeCell value={t.created_at} className="text-12" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

/** 经费兑换(兑换码) */
function RedemptionsSection({ userId, open }: { userId: number; open: boolean }) {
  const q = useAdminUserRedemptions(userId, { page: 1, page_size: PAGE }, open);
  const rows = q.data?.items ?? [];
  // 0090 起经费只有一种(临时经费退休)—— 同一个抽屉里上面的发放面板已经不提"永久/临时"了,
  // 这里再标一个「(永久)」就是同一个东西两种口径。credit_kind 是历史码定义里的死字段,不再展示。
  // 时长必须带单位:0110 起兑换码可以是天/月/年,裸「· 1」既可能是 1 天也可能是 1 年。
  const grant = (r: AdminRedemption) =>
    r.grant_kind === 'tier'
      ? `会员 ${r.grant_tier}${r.grant_days ? ` · ${formatGrantDuration(r.grant_days, r.grant_unit)}` : ''}`
      : `经费 ${r.grant_credits.toLocaleString()}`;
  return (
    <SectionShell
      title="经费兑换"
      icon={<Ticket className="size-3.5" />}
      query={q}
      shown={rows.length}
      emptyText="暂无兑换记录"
    >
      <ul className="flex flex-col divide-y divide-border-soft">
        {rows.map((r: AdminRedemption, i: number) => (
          <li key={`${r.code}-${i}`} className="flex items-center justify-between gap-2 py-1.5 text-12">
            <div className="flex min-w-0 flex-col">
              <span className="text-subtle">{grant(r)}</span>
              {/* 兑换码后端已打码,复制出来的也是打码串 —— 仅用于跟兑换码管理页对号 */}
              <CopyableId value={r.code} label="兑换码(已打码)" className="font-mono text-faint" />
            </div>
            <TimeCell value={r.redeemed_at} prefix="兑换 " className="shrink-0 text-12" />
          </li>
        ))}
      </ul>
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

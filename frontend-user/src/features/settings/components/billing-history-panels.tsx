// 账单历史子面板:明细查看(订单表格 + 导出)/ 总览(经费流水 + 当月用量热力图)。
// 从 billing-panels.tsx 拆出 —— 那个文件加上微信支付链路后超过 500 行硬上限,
// 而「买东西」(充值 / 兑换 / 订阅支付流)与「看账单」是两组互不引用的职责,沿这条缝切最干净。
// 调用点无需改:billing-panels.tsx 对本文件做同名再导出。
import { useState } from 'react';
import { Download, Undo2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { cn } from '@/shared/lib/utils';
import { useOrders, useTransactions, useUsageCalendar, type CreditTxn, type Order } from '../api/membership';

const TXN_LABEL: Record<string, string> = {
  grant_subscription: '订阅赠送',
  recharge: '充值到账',
  gift: '礼品码',
  task: '任务奖励',
  reset_consume: '用于重置额度',
  expire: '已过期收回',
  refund: '退款',
  admin_adjust: '人工调整',
  payg_daily: '用经费继续(当天合计)', // 0098:每天一行,当天内随消耗累加
  invite_reward: '邀请奖励', // 邀请好友注册奖励(ref_id=被邀者 user_id)
};

// 0098 起流水金额可带小数(payg 日聚合行;经费=分,一天可能只有零点几经费)。
// 整数原样;小数最多保留 4 位并去尾零(0.0053 这类微量也要可见,不能四舍五入成 0.00)。
const fmtCredit = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : String(parseFloat(v.toFixed(4))));

const ORDER_TYPE_LABEL: Record<string, string> = { subscription: '订阅', recharge: '充值'};

// 0107 退款 —— 用户面口径。
// 后端**不改 order.status**(退过款的单依然是「已支付」),退款是叠加在其上的第二个维度:
// 这笔钱确实收到过,退款是发生在其后的另一件事。所以这里只在行内加一枚标识,不改行的其它部分。
// 措辞面向用户:全额退完就说「已退款」,部分退款直接把退回的金额写出来(用户关心的是退回多少钱)。
// 刻意不用红色告警色 —— 自己的账单不是告警面板,退款对用户不是错误。
const refundLabel = (o: Order) =>
  o.refund_status === 'full' ? '已退款' : `已退 ¥${(o.refunded_amount ?? 0).toFixed(2)}`;

// 导出用(表格里一列一个值,金额单独成列,故这里不带金额)。与后台 REFUND_STATUS_LABEL 同口径。
const REFUND_STATUS_LABEL: Record<string, string> = {
  partial: '部分退款',
  full: '已退款',
};

/** 明细查看:已支付订单(订阅 / 充值)表格 + 筛选 + 月份 + 导出 + 申请发票。对齐设计稿。 */
export function OrdersTable() {
  const [filter, setFilter] = useState<'all'|'subscription'|'recharge'>('all');
  const [month, setMonth] = useState('');
  const { data, isLoading } = useOrders(filter ==='all' ? undefined : filter);
  const items = data ?? [];
  const months = Array.from(new Set(items.map((o) => (o.created_at ?? '').slice(0, 7)).filter(Boolean))).sort().reverse();
  const rows = month ? items.filter((o) => (o.created_at ?? '').startsWith(month)) : items;

  // 导出列必须与页面所见一致 —— 页面上标了退款、导出的账单却没有,对账时会得出相反结论。
  const exportCsv = () => {
    const head ='时间,类型,说明,金额,退款,已退金额\n';
    const body = rows
      .map((o) =>`${(o.created_at ??'').slice(0, 16).replace('T', ' ')},${ORDER_TYPE_LABEL[o.order_type] ?? o.order_type},${o.plan_name ??''},¥${o.final_amount.toFixed(2)},${o.refund_status ? REFUND_STATUS_LABEL[o.refund_status] ?? o.refund_status :''},${o.refund_status ?`¥${(o.refunded_amount ?? 0).toFixed(2)}`:''}`)
      .join('\n');
    const blob = new Blob(['﻿'+ head + body], { type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download ='账单明细.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="rounded-16 border border-border bg-surface-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([['all', '全部'], ['subscription', '订阅'], ['recharge', '充值']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn('h-7 rounded-8 px-3 text-12 transition-colors', filter === id ? 'bg-foreground text-on-dark' : 'bg-surface-2 text-subtle hover:bg-surface-1')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} fullWidth={false}>
            <option value="">全部月份</option>
            {months.map((m) => (
              <option key={m} value={m}>{m.replace('-', ' 年 ')} 月</option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportCsv} className="gap-1 border-border text-subtle">
            <Download className="size-3.5"/> 导出
          </Button>
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-12 text-faint">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-12 text-faint">还没有账单记录</p>
      ) : (
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-border text-faint">
              <th className="py-2 text-left font-medium">时间</th>
              <th className="py-2 text-left font-medium">类型</th>
              <th className="py-2 text-right font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <OrderRow key={o.id ?? o.order_no} o={o} />
            ))}
          </tbody>
        </table>
      )}
      {/* 0094 按量付费的扣减是微额高频,逐笔入流水会把明细刷成噪音 —— 后端刻意不逐笔落流水。 */}
      <p className="mt-3 text-12 leading-paragraph text-faint">
        「用经费继续」的扣费按天合并成一条记录,当天用多少就累加多少。
      </p>
      {/* 只在真有退款时出现 —— 常态下没人需要读这句话。 */}
      {rows.some((o) => o.refund_status) && (
        <p className="mt-1 text-12 leading-paragraph text-faint">
          带「已退款」标记的订单,退款金额已按标注退回,对应的会员时长或经费也已同步调整;到账时间以支付渠道为准。
        </p>
      )}
    </section>
  );
}

function OrderRow({ o }: { o: Order }) {
  const isSub = o.order_type ==='subscription';
  // 全额退完的行:金额降到 muted 一档,与仍然生效的消费拉开距离。
  // 刻意**不划掉金额** —— 这笔钱确实付过,划掉会读成「从没扣过」。
  const fullyRefunded = o.refund_status === 'full';
  return (
    <tr className="border-b border-border-soft last:border-0">
      <td className="py-3 tabular-nums text-subtle">{(o.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
      <td className="py-3">
        <span className={cn('rounded-pill px-2 py-0.5 text-12 font-medium', isSub ? 'bg-brand-green/10 text-brand-green' : 'bg-warning-soft text-brand-amber')}>
          {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}
        </span>
      </td>
      <td className="py-3 text-right text-subtle">
        <span className="inline-flex items-center justify-end gap-2">
          <span>{o.plan_name || (isSub ? '会员订阅' : '经费充值')}</span>
          {o.refund_status && (
            <Badge
              variant="muted"
              title={`本单实付 ¥${o.final_amount.toFixed(2)},已退回 ¥${(o.refunded_amount ?? 0).toFixed(2)}`}
            >
              <Undo2 className="size-3" aria-hidden />
              {refundLabel(o)}
            </Badge>
          )}
          <span className={cn('font-medium tabular-nums', fullyRefunded ? 'text-muted-foreground' : 'text-foreground')}>
            ¥{o.final_amount.toFixed(2)}
          </span>
        </span>
      </td>
    </tr>
  );
}

/** 总览 tab 内容:最近的经费变动(经费) + 本月每日用量绿格热力图。对齐设计稿。 */
export function OverviewContent({ onViewAll }: { onViewAll: () => void }) {
  const { data } = useTransactions({ page: 1, page_size: 5 });
  const items = data?.items ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="rounded-16 border border-border bg-surface-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-14 font-medium text-foreground">最近的经费变动</h3>
          <button onClick={onViewAll} className="text-12 text-muted-foreground hover:text-foreground">
            查看全部
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-12 text-faint">还没有经费进出</p>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
      <UsageHeatmap />
    </div>
  );
}

const GREEN_LEVELS = ['bg-surface-2', 'bg-brand-green/25', 'bg-brand-green/50', 'bg-brand-green/75', 'bg-brand-green'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 入参 pct = 后端算好的**相对**强度百分比(0..999)。绝对成本与参考线都不再下发到用户端
// (见 backend billing_handler.go UsageCalendar 的红字):这里只做分档,不做除法。
function levelOf(pct: number): number {
  if (pct <= 0) return 0;
  return pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
}

/** 本月每日用量 —— GitHub 风格绿格热力图(只看当月,相对活跃度;不显示绝对额度)。 */
function UsageHeatmap() {
  const { data } = useUsageCalendar();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const unlimited = data?.unlimited ?? false;
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d.pct]));
  const pad = (n: number) => String(n).padStart(2, '0');

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const weeks: (number | null)[][] = [];
  let col: (number | null)[] = new Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    col.push(d);
    if (col.length === 7) { weeks.push(col); col = []; }
  }
  if (col.length) { while (col.length < 7) col.push(null); weeks.push(col); }

  const activeDays = (data?.days ?? []).filter((d) => d.pct > 0).length;

  return (
    <section className="rounded-16 border border-border bg-surface-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-14 font-medium text-foreground">本月每日活跃</h3>
        <span className="text-12 tabular-nums text-faint">{activeDays} 天有使用</span>
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 pr-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex h-4 items-center text-12 text-faint">{i % 2 === 1 ? w : ''}</span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              if (day === null) return <span key={di} className="size-4"/>;
              const date =`${year}-${pad(month + 1)}-${pad(day)}`;
              const pct = byDate.get(date) ?? 0;
              const tip =
                pct <= 0
                  ? `${date} · 无使用`
                  : unlimited
                    ? `${date} · 约 ${pct}% 本月峰值`
                    : `${date} · 约 ${pct}% 日均参考`;
              return (
                <span key={di} title={tip} className={cn('size-4 rounded-4', GREEN_LEVELS[levelOf(pct)])} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-12 text-faint">
        少
        {GREEN_LEVELS.map((c, i) => <span key={i} className={cn('size-3 rounded-4', c)} />)}
        多
      </div>
    </section>
  );
}

function TxnRow({ t }: { t: CreditTxn }) {
  const positive = t.amount >= 0;
  return (
    <div className="flex items-center justify-between border-b border-border-soft py-2 last:border-0">
      <div className="flex flex-col">
        <span className="text-14 text-subtle">{TXN_LABEL[t.type] ?? t.type}</span>
        <span className="text-12 text-faint">{t.created_at.slice(0, 19).replace('T', ' ')}</span>
      </div>
      <span className={cn('text-14 font-medium tabular-nums', positive ? 'text-brand-green' : 'text-brand-red')}>
        {positive ? '+' : ''}
        {fmtCredit(t.amount)} 经费
      </span>
    </div>
  );
}

// 账户资产子面板:经费充值 / 兑换码激活 / 明细查看。被 MembershipPage(账户资产)的 tab 调用。
import { Fragment, useRef, useState } from 'react';
import { Loader2, Ticket, QrCode, CreditCard, Zap, Coins, Download, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { notifyBillingChanged } from '@/shared/lib/quota-events';
import { showQuotaToast } from '@/shared/components/quota-toast';
import { RedeemConfirmDialog } from './redeem-confirm-dialog';
import {
  useCreateRecharge,
  useCreateSubscription,
  useStartAlipay,
  useTestPay,
  useTransactions,
  useUsageCalendar,
  useOrders,
  usePlans,
  type BillingCycle,
  type CreditTxn,
  type Order,
} from '../api/membership';

const TXN_LABEL: Record<string, string> = {
  grant_subscription: '订阅赠送',
  recharge: '充值到账',
  gift: '礼品码',
  task: '任务奖励',
  reset_consume: '重置消耗',
  expire: '到期清零',
  refund: '退款',
  admin_adjust: '管理员调账',
};

const METHOD_ICONS: Record<string, LucideIcon> = { wechat: QrCode, alipay: CreditCard, test: Zap };

/** 经费充值 —— 两栏:左(金额 + 支付方式)/ 右(订单详情)。对齐设计稿。 */
export function RechargePanel() {
  const { data: plans } = usePlans();
  const recharge = useCreateRecharge();
  const startAlipay = useStartAlipay();
  const testPay = useTestPay();
  const [yuan, setYuan] = useState('20');
  const [method, setMethod] = useState('');

  const rate = plans?.recharge_rate ?? 1;
  const minYuan = (plans?.min_recharge_cents ?? 1000) / 100;
  const cents = Math.round(Number(yuan) * 100);
  const credits = Number.isFinite(cents) ? Math.floor((cents / 100) * rate) : 0;
  const valid = Number.isFinite(cents) && cents >= (plans?.min_recharge_cents ?? 1000);
  const busy = recharge.isPending || startAlipay.isPending || testPay.isPending;

  // 支付方式按 admin 配置(支付宝/微信 是否启用)动态决定 + 开发环境的测试支付。
  const methods = [
    ...(plans?.payment_methods?.wechat ? [{ id: 'wechat', name: '微信支付', desc: '推荐使用微信扫码支付' }] : []),
    ...(plans?.payment_methods?.alipay ? [{ id: 'alipay', name: '支付宝', desc: '支付宝账户余额或银行卡' }] : []),
    ...(plans?.test_payment ? [{ id: 'test', name: '测试支付', desc: '开发环境一键到账' }] : []),
  ];
  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const methodName = methods.find((m) => m.id === sel)?.name ?? '—';

  const onPay = async () => {
    if (!sel) {
      toast.error('管理员尚未配置支付方式');
      return;
    }
    try {
      if (sel === 'wechat') {
        toast.info('微信扫码支付即将开放,请暂用其他方式');
        return;
      }
      const order = await recharge.mutateAsync(cents);
      if (sel === 'test') {
        await testPay.mutateAsync(order.order_no);
        showQuotaToast('recharge');
        notifyBillingChanged(); // 广播刷新额度/经费(账户资产卡 + 全局通知器)
        return;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: '科研经费充值' });
      window.location.href = pay.payment_url;
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex flex-1 flex-col gap-4">
        {/* 金额 */}
        <section className="rounded-md border border-border bg-background p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">选择充值金额</h3>
            <span className="text-2xs text-faint">1 元 = {rate} 经费</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[30, 50, 20, 200, 500, 1000].map((v) => {
              const active = Number(yuan) === v;
              return (
                <button
                  key={v}
                  onClick={() => setYuan(String(v))}
                  className={cn('flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors', active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2')}
                >
                  <span className={cn('text-base font-bold', active ? 'text-brand-red' : 'text-foreground')}>¥{v}</span>
                  <span className="text-2xs text-faint">到账 {Math.floor(v * rate)} 经费</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-surface-1 px-3">
            <Coins className="size-4 shrink-0 text-faint" />
            <Input
              value={yuan}
              onChange={(e) => setYuan(e.target.value.replace(/[^0-9.]/g, ''))}
              className="h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              inputMode="decimal"
              placeholder="输入其他金额"
            />
            <span className="shrink-0 text-2xs text-faint">最低 {minYuan} 元</span>
          </div>
        </section>

        {/* 支付方式 */}
        <section className="rounded-md border border-border bg-background p-5">
          <h3 className="mb-3 text-sm font-bold text-foreground">支付方式</h3>
          {methods.length === 0 && (
            <p className="text-xs text-faint">管理员尚未配置支付渠道,暂时无法充值。</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {methods.map((m) => {
              const Icon = METHOD_ICONS[m.id] ?? CreditCard;
              const active = sel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn('flex items-center gap-2 rounded-md border p-3 text-left transition-colors', active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2')}
                >
                  <Icon className={cn('size-5 shrink-0', active ? 'text-brand-red' : 'text-faint')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{m.name}</p>
                    <p className="truncate text-2xs text-faint">{m.desc}</p>
                  </div>
                  <span className={cn('size-3.5 shrink-0 rounded-pill border-2', active ? 'border-brand-red bg-brand-red' : 'border-border')} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 订单详情 */}
      <aside className="rounded-md border border-border bg-background p-5 md:w-64 md:shrink-0">
        <h3 className="mb-3 text-sm font-bold text-foreground">订单详情</h3>
        <DetailRow k="充值金额" v={`¥${(cents / 100 || 0).toFixed(2)}`} />
        <DetailRow k="到账经费" v={`${credits} 经费`} />
        <DetailRow k="支付方式" v={methodName} />
        <div className="my-3 h-px bg-border-soft" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-faint">实付金额</span>
          <span className="flex items-center gap-1 text-2xl font-bold text-brand-red">
            <Coins className="size-4" />
            {(cents / 100 || 0).toFixed(2)}
          </span>
        </div>
        <div className="my-3 flex items-center gap-1.5 rounded-md bg-prism-badge-bg px-3 py-2 text-2xs text-prism-badge-fg">
          <Coins className="size-3.5" /> {yuan || 0} 元到账 {credits} 经费
        </div>
        <Button onClick={onPay} disabled={!valid || busy || !sel} className="w-full bg-brand-red text-background hover:bg-brand-red/90">
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          立即充值
        </Button>
        <p className="mt-3 text-2xs leading-relaxed text-faint">按 {rate} 经费 / 元到账,经费用于重置额度,永久经费不过期。</p>
      </aside>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-faint">{k}</span>
      <span className="tabular-nums text-subtle">{v}</span>
    </div>
  );
}

/** 4 段式兑换码输入框(XXXX-XXXX-XXXX-XXXX),自动跳格 + 退格回退 + 粘贴分发。 */
function SegmentedCodeInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const setSeg = (i: number, raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const next = [...value];
    next[i] = clean;
    onChange(next);
    if (clean.length === 4 && i < 3) refs.current[i + 1]?.focus();
  };
  return (
    <div
      className="flex flex-1 items-center gap-2"
      onPaste={(e) => {
        e.preventDefault();
        const txt = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        onChange([txt.slice(0, 4), txt.slice(4, 8), txt.slice(8, 12), txt.slice(12, 16)]);
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <Fragment key={i}>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i]}
            onChange={(e) => setSeg(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            maxLength={4}
            placeholder="0000"
            className="h-11 w-full min-w-0 flex-1 rounded-md border border-border bg-surface-1 text-center font-mono text-base uppercase tracking-[0.25em] text-foreground placeholder:text-faint/40 focus:border-brand-red focus:outline-none"
          />
          {i < 3 && <span className="shrink-0 text-faint">–</span>}
        </Fragment>
      ))}
    </div>
  );
}

/** 兑换码激活(会员 or 经费)+ 最近激活记录。码格式 XXXX-XXXX-XXXX-XXXX。
 *  「立即激活」先开确认弹窗(预览将授予的内容 + 失败态),确认后才真正兑换。 */
export function RedeemPanel() {
  const { data: gifts } = useTransactions({ type: 'gift', page: 1, page_size: 5 });
  const [segs, setSegs] = useState(['', '', '', '']);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const code = segs.join('-');
  const complete = segs.every((s) => s.length === 4);

  const recent = gifts?.items ?? [];
  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Ticket className="size-4 text-brand-red" /> 激活礼品码
        </h3>
        <span className="inline-flex items-center gap-1 rounded-pill bg-prism-badge-bg px-2 py-0.5 text-2xs font-medium text-prism-badge-fg">
          <Zap className="size-3" /> 实时到账
        </span>
      </div>
      <div className="flex items-center gap-3">
        <SegmentedCodeInput value={segs} onChange={setSegs} />
        <Button onClick={() => complete && setConfirmOpen(true)} disabled={!complete} className="h-11 shrink-0 bg-brand-red px-5 text-background hover:bg-brand-red/90">
          立即激活
        </Button>
      </div>
      <RedeemConfirmDialog
        code={code}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onRedeemed={() => setSegs(['', '', '', ''])}
      />
      <p className="mt-2 text-2xs text-faint">礼品码可能来自活动赠送、机构发放或合作渠道。兑换码不可重复使用。</p>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-3">
          <p className="mb-2 text-2xs font-bold tracking-[0.12em] text-faint">最近激活记录</p>
          <div className="flex flex-col">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-b border-border-soft py-2 last:border-0">
                <Ticket className="size-4 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground">{t.ref_id || '礼品码'}</p>
                  <p className="text-2xs text-faint">{t.created_at.slice(0, 16).replace('T', ' ')}</p>
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-brand-green">+{t.amount} 经费</span>
                <span className="shrink-0 rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs text-brand-green">成功</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 订阅下单 + 指定支付方式发起支付。供「购买会员弹窗」的 onPay 用。
 *  cycle=yearly 走年度订阅(0079)。
 *  返回 true=已完成(关弹窗 + 刷新);false=保持弹窗(微信暂未开放 / 出错)。
 *  支付宝走收银台跳转(返回 true,页面随即离开)。 */
export function useSubscribeFlow() {
  const sub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const testPay = useTestPay();
  const subscribe = async (
    plan: 'pro' | 'max',
    method: string,
    cycle: BillingCycle,
    label: string,
  ): Promise<boolean> => {
    const cycleLabel = cycle === 'yearly' ? `${label} 年度会员` : label;
    try {
      const order = await sub.mutateAsync({ plan, cycle });
      if (method === 'test') {
        await testPay.mutateAsync(order.order_no);
        toast.success(`测试支付成功!${cycleLabel}已开通`);
        notifyBillingChanged();
        return true;
      }
      if (method === 'wechat') {
        toast.info('微信支付即将开放,请暂用其他方式');
        return false;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: `${cycleLabel}订阅` });
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
      return false;
    }
  };
  return { subscribe, busy: sub.isPending || startAlipay.isPending || testPay.isPending };
}

const ORDER_TYPE_LABEL: Record<string, string> = { subscription: '订阅', recharge: '充值' };

/** 明细查看:已支付订单(订阅 / 充值)表格 + 筛选 + 月份 + 导出 + 申请发票。对齐设计稿。 */
export function OrdersTable() {
  const [filter, setFilter] = useState<'all' | 'subscription' | 'recharge'>('all');
  const [month, setMonth] = useState('');
  const { data, isLoading } = useOrders(filter === 'all' ? undefined : filter);
  const items = data ?? [];
  const months = Array.from(new Set(items.map((o) => (o.created_at ?? '').slice(0, 7)).filter(Boolean))).sort().reverse();
  const rows = month ? items.filter((o) => (o.created_at ?? '').startsWith(month)) : items;

  const exportCsv = () => {
    const head = '时间,类型,说明,金额\n';
    const body = rows
      .map((o) => `${(o.created_at ?? '').slice(0, 16).replace('T', ' ')},${ORDER_TYPE_LABEL[o.order_type] ?? o.order_type},${o.plan_name ?? ''},¥${o.final_amount.toFixed(2)}`)
      .join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '账单明细.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([['all', '全部'], ['subscription', '订阅'], ['recharge', '充值']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn('h-7 rounded-md px-3 text-xs transition-colors', filter === id ? 'bg-foreground text-background' : 'bg-surface-2 text-subtle hover:bg-surface-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground">
            <option value="">全部月份</option>
            {months.map((m) => (
              <option key={m} value={m}>{m.replace('-', ' 年 ')} 月</option>
            ))}
          </select>
          <button onClick={exportCsv} className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs text-subtle transition-colors hover:bg-surface-2">
            <Download className="size-3.5" /> 导出
          </button>
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-xs text-faint">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-faint">暂无订单明细</p>
      ) : (
        <table className="w-full text-xs">
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
    </section>
  );
}

function OrderRow({ o }: { o: Order }) {
  const isSub = o.order_type === 'subscription';
  return (
    <tr className="border-b border-border-soft last:border-0">
      <td className="py-3 tabular-nums text-subtle">{(o.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
      <td className="py-3">
        <span className={cn('rounded-pill px-2 py-0.5 text-2xs font-medium', isSub ? 'bg-brand-green/10 text-brand-green' : 'bg-warning-soft text-brand-amber')}>
          {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}
        </span>
      </td>
      <td className="py-3 text-right text-subtle">
        {o.plan_name || (isSub ? '会员订阅' : '经费充值')} <span className="font-medium text-foreground">¥{o.final_amount.toFixed(2)}</span>
      </td>
    </tr>
  );
}

/** 总览 tab 内容:近期流水(经费) + 本月每日用量绿格热力图。对齐设计稿。 */
export function OverviewContent({ onViewAll }: { onViewAll: () => void }) {
  const { data } = useTransactions({ page: 1, page_size: 5 });
  const items = data?.items ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="rounded-md border border-border bg-background p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">近期流水</h3>
          <button onClick={onViewAll} className="text-xs text-muted-foreground hover:text-foreground">
            查看全部
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-faint">暂无经费流水</p>
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

// P5:入参 cost = 当日精算成本(微元);ceiling = 日均参考线(微元)。只做**相对强度**分档,不露绝对数。
function levelOf(cost: number, ceiling: number): number {
  if (cost <= 0) return 0;
  // 不限档(ceiling<=0):按微元绝对区间兜底(¥0.2/¥0.05/¥0.01 台阶)。
  if (ceiling <= 0) return cost >= 200_000 ? 4 : cost >= 50_000 ? 3 : cost >= 10_000 ? 2 : 1;
  const r = cost / ceiling;
  return r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
}

/** 本月每日用量 —— GitHub 风格绿格热力图(只看当月,相对活跃度;不显示绝对额度)。 */
function UsageHeatmap() {
  const { data } = useUsageCalendar();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const ceiling = data?.daily_ceiling ?? 0;
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d.cost]));
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

  const activeDays = (data?.days ?? []).filter((d) => d.cost > 0).length;

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">本月每日活跃</h3>
        <span className="text-2xs tabular-nums text-faint">{activeDays} 天有使用</span>
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 pr-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex h-4 items-center text-2xs text-faint">{i % 2 === 1 ? w : ''}</span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              if (day === null) return <span key={di} className="size-4" />;
              const date = `${year}-${pad(month + 1)}-${pad(day)}`;
              const cost = byDate.get(date) ?? 0;
              // 相对参考:当日成本相对「日均参考线」的百分比(不露绝对额度),不限档只标有无使用。
              const pct = ceiling > 0 ? Math.min(999, Math.round((cost / ceiling) * 100)) : 0;
              const tip =
                cost <= 0 ? `${date} · 无使用` : ceiling > 0 ? `${date} · 约 ${pct}% 日均参考` : `${date} · 有使用`;
              return (
                <span
                  key={di}
                  title={tip}
                  className={cn('size-4 rounded-sm', GREEN_LEVELS[levelOf(cost, ceiling)])}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-2xs text-faint">
        少
        {GREEN_LEVELS.map((c, i) => <span key={i} className={cn('size-3 rounded-sm', c)} />)}
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
        <span className="text-sm text-subtle">{TXN_LABEL[t.type] ?? t.type}</span>
        <span className="text-2xs text-faint">{t.created_at.slice(0, 19).replace('T', ' ')}</span>
      </div>
      <span className={cn('text-sm font-bold tabular-nums', positive ? 'text-brand-green' : 'text-brand-red')}>
        {positive ? '+' : ''}
        {t.amount} 经费
      </span>
    </div>
  );
}

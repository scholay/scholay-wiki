// 账户资产子面板:经费充值 / 兑换码激活 / 明细查看。被 MembershipPage(账户资产)的 tab 调用。
import { Fragment, useRef, useState } from'react';
import { Loader2, Ticket, QrCode, CreditCard, Zap, Coins, Download, type LucideIcon } from'lucide-react';
import { toast } from'sonner';
import { Button } from'@/shared/ui/button';
import { Switch } from'@/shared/ui/switch';
import { Input } from'@/shared/ui/input';
import { Select } from'@/shared/ui/select';
import { cn } from'@/shared/lib/utils';
import { toApiError } from'@/shared/lib/http';
import { notifyBillingChanged } from'@/shared/lib/quota-events';
import { showQuotaToast } from'@/shared/components/quota-toast';
import { RedeemConfirmDialog } from'./redeem-confirm-dialog';
import {
  useCreateRecharge,
  useCreateSubscription,
  useStartAlipay,
  useTestPay,
  useTransactions,
  useUsageCalendar,
  useBillingOverview,
  useSetCreditAutopay,
  useOrders,
  usePlans,
  type BillingCycle,
  type CreditTxn,
  type Order,
} from'../api/membership';

const TXN_LABEL: Record<string, string> = {
  grant_subscription: '订阅赠送',
  recharge: '充值到账',
  gift: '礼品码',
  task: '任务奖励',
  reset_consume: '重置消耗',
  expire: '到期清零',
  refund: '退款',
  admin_adjust: '管理员调账',
  payg_daily: '按量付费(当日累计)', // 0098:每天一行,当天内随消耗累加
  invite_reward: '邀请奖励', // 邀请好友注册奖励(ref_id=被邀者 user_id)
};

// 0098 起流水金额可带小数(payg 日聚合行;经费=分,一天可能只有零点几经费)。
// 整数原样;小数最多保留 4 位并去尾零(0.0053 这类微量也要可见,不能四舍五入成 0.00)。
const fmtCredit = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : String(parseFloat(v.toFixed(4))));

const METHOD_ICONS: Record<string, LucideIcon> = { wechat: QrCode, alipay: CreditCard, test: Zap };

/**
 * 「用经费继续」开关(0094 按量付费)—— 周期额度用完后自动按真实成本从经费扣。
 *
 * 🔴 **默认关**,必须由用户在这里显式开。历史上的「自动消耗经费重置额度」就是因为
 * 不知情扣费被整个下线的(auto-reset-removed-2026-06),这是同一类风险 ——
 * 所以开关要显眼、文案要把「会花钱」讲明白,而不是藏在设置深处默默生效。
 */
function CreditAutopayCard() {
  const { data } = useBillingOverview();
  const setAutopay = useSetCreditAutopay();
  const on = data?.credit.credit_autopay ?? false;

  return (
    // p-4 而非邻居卡片的 p-5:护栏的「半档间距」棘轮把 -5 也算在内(Figma 集合无 20px),
    // 基线是零余量,新代码只能用 {1,2,2.5,3,4,6,8,10}。视觉上 16 vs 20 的差别可忽略。
    <section className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-14 font-medium text-foreground">用经费继续</h3>
          <p className="max-w-xl text-12 leading-paragraph text-muted-foreground">
            开启后,本周期 AI 额度用完时**自动按实际用量从经费扣费**,不中断使用;
            关闭时额度用完就停下,等周期自动恢复。套餐额度始终优先使用,用完才会动经费。
          </p>
          {data && (
            <p className="text-12 text-faint">
              当前经费 {Number.isInteger(data.credit.total) ? data.credit.total : data.credit.total.toFixed(2)}
              (≈{data.credit.points.toLocaleString()} 算力点)
            </p>
          )}
        </div>
        <Switch
          checked={on}
          disabled={setAutopay.isPending}
          onCheckedChange={(v) => {
            setAutopay.mutate(v, {
              onSuccess: () => toast.success(v ? '已开启:额度用完将自动使用经费' : '已关闭:额度用完不再自动扣经费'),
              onError: (e) => toast.error(toApiError(e).message || '保存失败'),
            });
          }}
        />
      </div>
    </section>
  );
}

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
    ...(plans?.payment_methods?.wechat ? [{ id: 'wechat', name: '微信支付', desc: '推荐使用微信扫码支付'}] : []),
    ...(plans?.payment_methods?.alipay ? [{ id: 'alipay', name: '支付宝', desc: '支付宝账户余额或银行卡'}] : []),
    ...(plans?.test_payment ? [{ id: 'test', name: '测试支付', desc: '开发环境一键到账'}] : []),
  ];
  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const methodName = methods.find((m) => m.id === sel)?.name ?? '—';

  const onPay = async () => {
    if (!sel) {
      toast.error('管理员尚未配置支付方式');
      return;
    }
    try {
      if (sel ==='wechat') {
        toast.info('微信扫码支付即将开放,请暂用其他方式');
        return;
      }
      const order = await recharge.mutateAsync(cents);
      if (sel ==='test') {
        await testPay.mutateAsync(order.order_no);
        showQuotaToast('recharge');
        notifyBillingChanged(); // 广播刷新额度/经费(账户资产卡 + 全局通知器)
        return;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: '科研经费充值'});
      window.location.href = pay.payment_url;
    } catch (err) {
      toast.error(toApiError(err).message ||'发起支付失败');
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex flex-1 flex-col gap-4">
        {/* 用经费继续(按量付费开关)—— 放在充值之上:先讲清经费能干什么,再谈买多少 */}
        <CreditAutopayCard />

        {/* 金额 */}
        <section className="rounded-16 border border-border bg-surface-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-14 font-medium text-foreground">选择充值金额</h3>
            <span className="text-12 text-faint">1 元 = {rate} 经费{plans?.credit_to_points ? ` ≈ ${rate * plans.credit_to_points} 算力点` : ''}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[30, 50, 20, 200, 500, 1000].map((v) => {
              const active = Number(yuan) === v;
              return (
                <button
                  key={v}
                  onClick={() => setYuan(String(v))}
                  className={cn('flex flex-col gap-0.5 rounded-12 border p-3 text-left transition-colors', active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2')}
                >
                  <span className={cn('text-14 font-medium', active ? 'text-brand-red' : 'text-foreground')}>¥{v}</span>
                  <span className="text-12 text-faint">到账 {Math.floor(v * rate)} 经费</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
            <Coins className="size-4 shrink-0 text-faint"/>
            <Input
              value={yuan}
              onChange={(e) => setYuan(e.target.value.replace(/[^0-9.]/g, ''))}
              className="h-10 flex-1 border-0 bg-transparent px-0" inputMode="decimal" placeholder="输入其他金额"/>
            <span className="shrink-0 text-12 text-faint">最低 {minYuan} 元</span>
          </div>
        </section>

        {/* 支付方式 */}
        <section className="rounded-16 border border-border bg-surface-card p-5">
          <h3 className="mb-3 text-14 font-medium text-foreground">支付方式</h3>
          {methods.length === 0 && (
            <p className="text-12 text-faint">管理员尚未配置支付渠道,暂时无法充值。</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {methods.map((m) => {
              const Icon = METHOD_ICONS[m.id] ?? CreditCard;
              const active = sel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn('flex items-center gap-2 rounded-12 border p-3 text-left transition-colors', active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2')}
                >
                  <Icon className={cn('size-5 shrink-0', active ? 'text-brand-red' : 'text-faint')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-14 font-medium text-foreground">{m.name}</p>
                    <p className="truncate text-12 text-faint">{m.desc}</p>
                  </div>
                  <span className={cn('size-3.5 shrink-0 rounded-pill border-2', active ? 'border-brand-red bg-brand-red' : 'border-border')} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 订单详情 */}
      <aside className="rounded-16 border border-border bg-surface-card p-5 md:w-64 md:shrink-0">
        <h3 className="mb-3 text-14 font-medium text-foreground">订单详情</h3>
        <DetailRow k="充值金额" v={`¥${(cents / 100 || 0).toFixed(2)}`} />
        <DetailRow k="到账经费" v={`${credits} 经费`} />
        <DetailRow k="支付方式" v={methodName} />
        <div className="my-3 h-px bg-border-soft"/>
        <div className="flex items-center justify-between">
          <span className="text-12 text-faint">实付金额</span>
          <span className="flex items-center gap-1 text-24 font-medium text-brand-red">
            <Coins className="size-4"/>
            {(cents / 100 || 0).toFixed(2)}
          </span>
        </div>
        <div className="my-3 flex items-center gap-1.5 rounded-8 bg-prism-badge-bg px-3 py-2 text-12 text-prism-badge-fg">
          <Coins className="size-3.5"/> {yuan || 0} 元到账 {credits} 经费
        </div>
        <Button onClick={onPay} disabled={!valid || busy || !sel} className="w-full bg-brand-red text-on-brand hover:bg-brand-red/90">
          {busy && <Loader2 className="size-3.5 animate-spin"/>}
          立即充值
        </Button>
        <p className="mt-3 text-12 leading-paragraph text-faint">按 {rate} 经费 / 元到账,经费不过期,可开启「用经费继续」在额度耗尽后按量续用。</p>
      </aside>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-12">
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
      className="flex flex-1 items-center gap-2" onPaste={(e) => {
        e.preventDefault();
        const txt = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        onChange([txt.slice(0, 4), txt.slice(4, 8), txt.slice(8, 12), txt.slice(12, 16)]);
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <Fragment key={i}>
          <Input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i]}
            onChange={(e) => setSeg(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key ==='Backspace'&& !value[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            maxLength={4}
            placeholder="0000" className="h-11 min-w-0 flex-1 bg-surface-1 px-0 text-center font-mono text-14 uppercase tracking-code placeholder:text-faint/40 focus-visible:border-brand-red"/>
          {i < 3 && <span className="shrink-0 text-faint">–</span>}
        </Fragment>
      ))}
    </div>
  );
}

/** 兑换码激活(会员 or 经费)+ 最近激活记录。码格式 XXXX-XXXX-XXXX-XXXX。
 * 「立即激活」先开确认弹窗(预览将授予的内容 + 失败态),确认后才真正兑换。 */
export function RedeemPanel() {
  const { data: gifts } = useTransactions({ type: 'gift', page: 1, page_size: 5 });
  const [segs, setSegs] = useState(['', '', '', '']);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const code = segs.join('-');
  const complete = segs.every((s) => s.length === 4);

  const recent = gifts?.items ?? [];
  return (
    <section className="rounded-16 border border-border bg-surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
          <Ticket className="size-4 text-brand-red"/> 激活礼品码
        </h3>
        <span className="inline-flex items-center gap-1 rounded-pill bg-prism-badge-bg px-2 py-0.5 text-12 font-medium text-prism-badge-fg">
          <Zap className="size-3"/> 实时到账
        </span>
      </div>
      <div className="flex items-center gap-3">
        <SegmentedCodeInput value={segs} onChange={setSegs} />
        <Button onClick={() => complete && setConfirmOpen(true)} disabled={!complete} className="h-11 shrink-0 bg-brand-red px-5 text-on-brand hover:bg-brand-red/90">
          立即激活
        </Button>
      </div>
      <RedeemConfirmDialog
        code={code}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onRedeemed={() => setSegs(['', '', '', ''])}
      />
      <p className="mt-2 text-12 text-faint">礼品码可能来自活动赠送、机构发放或合作渠道。兑换码不可重复使用。</p>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-3">
          <p className="mb-2 text-12 font-medium text-faint">最近激活记录</p>
          <div className="flex flex-col">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-b border-border-soft py-2 last:border-0">
                <Ticket className="size-4 shrink-0 text-faint"/>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-14 text-foreground">{t.ref_id ||'礼品码'}</p>
                  <p className="text-12 text-faint">{t.created_at.slice(0, 16).replace('T', ' ')}</p>
                </div>
                <span className="shrink-0 text-14 font-medium tabular-nums text-brand-green">+{t.amount} 经费</span>
                <span className="shrink-0 rounded-pill bg-brand-green/10 px-2 py-0.5 text-12 text-brand-green">成功</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 订阅下单 + 指定支付方式发起支付。供「购买会员弹窗」的 onPay 用。
 * cycle=yearly 走年度订阅(0079)。
 * 返回 true=已完成(关弹窗 + 刷新);false=保持弹窗(微信暂未开放 / 出错)。
 * 支付宝走收银台跳转(返回 true,页面随即离开)。 */
export function useSubscribeFlow() {
  const sub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const testPay = useTestPay();
  const subscribe = async (
    plan: 'pro'|'max',
    method: string,
    cycle: BillingCycle,
    label: string,
  ): Promise<boolean> => {
    const cycleLabel = cycle ==='yearly' ? `${label} 年度会员` : label;
    try {
      const order = await sub.mutateAsync({ plan, cycle });
      if (method ==='test') {
        await testPay.mutateAsync(order.order_no);
        toast.success(`测试支付成功!${cycleLabel}已开通`);
        notifyBillingChanged();
        return true;
      }
      if (method ==='wechat') {
        toast.info('微信支付即将开放,请暂用其他方式');
        return false;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: `${cycleLabel}订阅`});
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message ||'发起支付失败');
      return false;
    }
  };
  return { subscribe, busy: sub.isPending || startAlipay.isPending || testPay.isPending };
}

const ORDER_TYPE_LABEL: Record<string, string> = { subscription: '订阅', recharge: '充值'};

/** 明细查看:已支付订单(订阅 / 充值)表格 + 筛选 + 月份 + 导出 + 申请发票。对齐设计稿。 */
export function OrdersTable() {
  const [filter, setFilter] = useState<'all'|'subscription'|'recharge'>('all');
  const [month, setMonth] = useState('');
  const { data, isLoading } = useOrders(filter ==='all' ? undefined : filter);
  const items = data ?? [];
  const months = Array.from(new Set(items.map((o) => (o.created_at ?? '').slice(0, 7)).filter(Boolean))).sort().reverse();
  const rows = month ? items.filter((o) => (o.created_at ?? '').startsWith(month)) : items;

  const exportCsv = () => {
    const head ='时间,类型,说明,金额\n';
    const body = rows
      .map((o) =>`${(o.created_at ??'').slice(0, 16).replace('T', ' ')},${ORDER_TYPE_LABEL[o.order_type] ?? o.order_type},${o.plan_name ??''},¥${o.final_amount.toFixed(2)}`)
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
        <p className="py-6 text-center text-12 text-faint">暂无订单明细</p>
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
        按量付费(用经费继续)按天汇总为一条「按量付费(当日累计)」流水,当天内随消耗累加。
      </p>
    </section>
  );
}

function OrderRow({ o }: { o: Order }) {
  const isSub = o.order_type ==='subscription';
  return (
    <tr className="border-b border-border-soft last:border-0">
      <td className="py-3 tabular-nums text-subtle">{(o.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
      <td className="py-3">
        <span className={cn('rounded-pill px-2 py-0.5 text-12 font-medium', isSub ? 'bg-brand-green/10 text-brand-green' : 'bg-warning-soft text-brand-amber')}>
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
      <section className="rounded-16 border border-border bg-surface-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-14 font-medium text-foreground">近期流水</h3>
          <button onClick={onViewAll} className="text-12 text-muted-foreground hover:text-foreground">
            查看全部
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-12 text-faint">暂无经费流水</p>
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

// 账户资产「买东西」子面板:经费充值 / 兑换码激活 / 订阅支付流(支付宝 · 微信 · 测试通道)。
// 「看账单」那半边(明细表格 / 总览流水 / 用量热力图)在 ./billing-history-panels,
// 本文件底部对它做同名再导出,调用点不用感知这次拆分。
import { Fragment, useRef, useState } from'react';
import { useQueryClient } from'@tanstack/react-query';
import { Loader2, Ticket, Zap, Coins } from'lucide-react';
import { toast } from'sonner';
import { Button } from'@/shared/ui/button';
import { Switch } from'@/shared/ui/switch';
import { Input } from'@/shared/ui/input';
import { cn } from'@/shared/lib/utils';
import { toApiError } from'@/shared/lib/http';
import { notifyBillingChanged } from'@/shared/lib/quota-events';
import { showQuotaToast } from'@/shared/components/quota-toast';
import { WechatPayDialog } from'@/shared/components/wechat-pay-dialog';
import { PayMethodLogo } from'@/shared/components/PayMethodLogo';
import { RedeemConfirmDialog } from'./redeem-confirm-dialog';
import {
  useCreateRecharge,
  useCreateSubscription,
  useStartAlipay,
  useTestPay,
  useTransactions,
  useBillingOverview,
  useSetCreditAutopay,
  usePlans,
  type BillingCycle,
} from'../api/membership';

// 支付方式图标走品牌 logo(PayMethodLogo),见该组件头注释:通用图标对渠道零标识力。

/**
 * 跳支付宝收银台前记住出发页(pathname + search)—— 支付回程由 App.tsx 读取本 key 后
 * 把用户带回原页。key 与读取侧约定为 'scholay:pay-return-path',**一字不差**,改动须两侧同步。
 */
function rememberPayReturnPath() {
  try {
    localStorage.setItem('scholay:pay-return-path', window.location.pathname + window.location.search);
  } catch {
    // Safari 隐私模式等 localStorage 不可写 —— 回程走默认落点即可,不阻断支付
  }
}

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
            {/* ⚠️ 这里原文写的是 markdown 的 `**加粗**` —— JSX 里星号会被原样渲染成字面量,
                用户看到的是「时**自动按实际用量从经费扣费**,不」。加粗要用 <b>。 */}
            打开后:额度用完时不会中断,<b className="font-medium text-foreground">超出的那部分按你实际用掉的量从经费扣</b>,
            手上的任务能接着跑。不打开:额度用完就停下来,等它自动重置。套餐额度永远先用完,才会动经费 —— 随时可以关。
          </p>
          {data && (
            <p className="text-12 text-faint">
              当前经费 {Number.isInteger(data.credit.total) ? data.credit.total : data.credit.total.toFixed(2)}
            </p>
          )}
        </div>
        <Switch
          checked={on}
          disabled={setAutopay.isPending}
          onCheckedChange={(v) => {
            setAutopay.mutate(v, {
              onSuccess: () => toast.success(v ? '已开启。额度用完后会按实际用量从经费扣,只扣超出的那部分,随时可以关' : '已关闭。额度用完后会停下来,不会动你的经费'),
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
  const qc = useQueryClient();
  const recharge = useCreateRecharge();
  const startAlipay = useStartAlipay();
  const testPay = useTestPay();
  const [yuan, setYuan] = useState('20');
  const [method, setMethod] = useState('');
  // 微信支付:建单成功后把单号交给扫码弹窗(null = 弹窗关着)。
  const [wxOrder, setWxOrder] = useState<string | null>(null);

  const rate = plans?.recharge_rate ?? 1;
  const minYuan = (plans?.min_recharge_cents ?? 1000) / 100;
  const cents = Math.round(Number(yuan) * 100);
  const credits = Number.isFinite(cents) ? Math.floor((cents / 100) * rate) : 0;
  const valid = Number.isFinite(cents) && cents >= (plans?.min_recharge_cents ?? 1000);
  const busy = recharge.isPending || startAlipay.isPending || testPay.isPending;

  // 支付方式按 admin 配置(支付宝/微信 是否启用)动态决定 + 开发环境的测试支付。
  const methods = [
    ...(plans?.payment_methods?.wechat ? [{ id: 'wechat', name: '微信支付', desc: '微信扫码支付'}] : []),
    ...(plans?.payment_methods?.alipay ? [{ id: 'alipay', name: '支付宝', desc: '支付宝账户余额或银行卡'}] : []),
    ...(plans?.test_payment ? [{ id: 'test', name: '测试支付', desc: '开发环境一键到账'}] : []),
  ];
  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const methodName = methods.find((m) => m.id === sel)?.name ?? '—';

  const onPay = async () => {
    if (!sel) {
      toast.error('暂时无法在线支付,请稍后再试');
      return;
    }
    try {
      const order = await recharge.mutateAsync(cents);
      if (sel ==='test') {
        await testPay.mutateAsync(order.order_no);
        showQuotaToast('recharge');
        notifyBillingChanged(); // 广播刷新额度/经费(账户资产卡 + 全局通知器)
        return;
      }
      if (sel ==='wechat') {
        // 微信不跳收银台:留在本页开扫码弹窗,支付结果由弹窗轮询(端点顺带兜底对账)。
        setWxOrder(order.order_no);
        return;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: '科研经费充值'});
      rememberPayReturnPath();
      window.location.href = pay.payment_url;
    } catch (err) {
      toast.error(toApiError(err).message ||'没能跳转到支付页面,这笔钱没有扣,稍后再试一次');
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
            <span className="text-12 text-faint">1 元 = {rate} 经费</span>
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
            <p className="text-12 text-faint">暂时无法在线充值,请稍后再试。</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {methods.map((m) => {
              const active = sel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn('flex items-center gap-2 rounded-12 border p-3 text-left transition-colors', active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2')}
                >
                  {/* 品牌 logo 恒定本色;仅「测试通道」是非品牌图标,跟随选中态。 */}
                  <PayMethodLogo
                    method={m.id}
                    className={cn('size-5', m.id === 'test' && (active ? 'text-brand-red' : 'text-faint'))}
                  />
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
        <p className="mt-3 text-12 leading-paragraph text-faint">按 1 元 = {rate} 经费到账,充多少用多少;开启「用经费继续」后,额度用完还能接着干活。</p>
      </aside>

      {/* 微信扫码支付 —— 成功副作用与上面 test 分支对齐(toast + 广播 + 失效总览缓存)。
          Radix 铁律:根节点常驻,靠 orderNo=null 关窗,不做条件挂载。 */}
      <WechatPayDialog
        orderNo={wxOrder}
        subject="科研经费充值"
        onOpenChange={(o) => !o && setWxOrder(null)}
        onPaid={() => {
          showQuotaToast('recharge');
          notifyBillingChanged();
          qc.invalidateQueries({ queryKey: ['settings', 'billing'] });
        }}
      />
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
      <p className="mt-2 text-12 text-faint">礼品码来自活动赠送、机构发放或合作渠道,每个码只能用一次。</p>

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
 * 返回 true=已完成(关弹窗 + 刷新);false=保持弹窗(出错)。
 * 支付宝走收银台跳转(返回 true,页面随即离开);
 * 微信返回 true 关掉套餐弹窗,把已建订单交给 wechatOrder → 调用方渲染的 WechatPayDialog 接手。
 *
 * ⚠️ 调用方**必须**把返回的 wechatOrder / closeWechat / onWechatPaid 接到一个
 * `<WechatPayDialog>` 上,否则微信分支会静默留下一个 pending 孤儿订单
 * (这正是改造前的 bug:先建单、再 `toast.info('即将开放')` 就走人)。 */
export function useSubscribeFlow() {
  const qc = useQueryClient();
  const sub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const testPay = useTestPay();
  // 已建单、待微信支付。label 留着给成功文案(与 test 分支同口径)。
  const [wechatOrder, setWechatOrder] = useState<{ orderNo: string; subject: string; label: string } | null>(null);

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
        // 订单已经建好了 —— 把单号交给扫码弹窗,绝不在这里 return false 丢下它。
        setWechatOrder({ orderNo: order.order_no, subject: `${cycleLabel}订阅`, label: cycleLabel });
        return true;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: `${cycleLabel}订阅`});
      rememberPayReturnPath();
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message ||'没能跳转到支付页面,这笔钱没有扣,稍后再试一次');
      return false;
    }
  };

  return {
    subscribe,
    busy: sub.isPending || startAlipay.isPending || testPay.isPending,
    wechatOrder,
    closeWechat: () => setWechatOrder(null),
    /** 微信支付成功 —— 与 test 分支同一套副作用(成功 toast + 广播 + 失效总览缓存)。 */
    onWechatPaid: () => {
      toast.success(`支付成功!${wechatOrder?.label ?? '会员'}已开通`);
      notifyBillingChanged();
      qc.invalidateQueries({ queryKey: ['settings', 'billing'] });
    },
  };
}

/* 账单历史(明细表格 / 总览流水 + 热力图)已拆到 ./billing-history-panels —— 这里同名再导出,
   MembershipPage 等调用点的 import 路径不用动。拆分理由见那个文件的头注释。 */
export { OrdersTable, OverviewContent } from './billing-history-panels';

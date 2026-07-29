// 会员套餐购买弹窗(presentational)—— 上方 月付/年付 切换 + 价格页同款套餐卡(Free / Pro / Max)
// 选套餐,下方选支付方式(微信/支付宝/测试支付)+ 确认支付。纯展示:数据与建单付款(onPay)由各
// feature 注入。
//
// 续期 / 升级 / 不降级 / 年付(0079):
//   · 当前档(在期)→「续期」:可选月付(延一个月)或年付(延一年,转年费会员);经费下一周期发放
//   · 更高档 →「升级」:按剩余天数补差价、立即升档、到期日不变;**周期锁定为当前订阅周期**
//     (后端两步走:升档后可再按年续期),此时周期切换器禁用并提示
//   · 更低档 →「已拥有」不可选(不支持降级)
//   · 年付未开放的档(year_price_cents<=0)在年付模式下自动回落月度口径
//   实际应付金额按 quote(tier, cycle) 报价显示;测试支付当作一种支付方式平等对待。
import { useEffect, useState } from 'react';
import { Loader2, Check, QrCode, CreditCard, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import {
  MembershipPlanCard,
  BillingCycleToggle,
  maxYearlySavingsPct,
  planYearlyEnabled,
  type MembershipPlanData,
  type BillingCycle,
} from './membership-plan-card';

export interface SubscribePayOption {
  id: string; // wechat | alipay | test
  name: string;
  desc: string;
}

/** 订阅报价(后端 /user/billing/subscribe/quote,mirrors vip.SubQuote)。 */
export interface SubQuote {
  action: 'new' | 'renew' | 'upgrade';
  tier: 'pro' | 'max';
  /** 实际计费周期:new/renew=请求周期;upgrade=用户当前订阅周期(后端锁定)。 */
  cycle: BillingCycle;
  amount_cents: number;
  credits: number;
  deferred: boolean; // 续期=true:本单权益从当前到期日起算(0090 起与经费无关)
  current_tier: string;
  current_cycle?: BillingCycle; // 用户当前订阅周期(付费在期时)
  remaining_days: number;
  new_expires_at?: string | null; // 履约后会员到期日
}

const METHOD_ICON: Record<string, LucideIcon> = { wechat: QrCode, alipay: CreditCard, test: Zap };
const RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

/** 从 admin 支付配置 + 测试支付开关派生可选支付方式(settings / landing 共用)。 */
export function subscribePayMethods(
  pm: { alipay: boolean; wechat: boolean } | undefined,
  testPayment: boolean,
): SubscribePayOption[] {
  return [
    ...(pm?.wechat ? [{ id: 'wechat', name: '微信支付', desc: '微信扫码支付' }] : []),
    ...(pm?.alipay ? [{ id: 'alipay', name: '支付宝', desc: '支付宝余额或银行卡' }] : []),
    ...(testPayment ? [{ id: 'test', name: '测试支付', desc: '开发环境一键开通(不走真实网关)' }] : []),
  ];
}

type CardAction = 'free' | 'new' | 'renew' | 'upgrade' | 'owned';

/** 某档卡片相对当前会员的动作。 */
function cardActionFor(cardTier: string, currentTier?: string): CardAction {
  if (cardTier === 'free') return 'free';
  const cr = RANK[currentTier ?? 'free'] ?? 0;
  const tr = RANK[cardTier] ?? 0;
  if (cr === 0) return 'new';
  if (tr < cr) return 'owned';
  if (tr === cr) return 'renew';
  return 'upgrade';
}

const ACTION_LABEL: Record<CardAction, string> = {
  free: 'Free',
  new: '立即订阅',
  renew: '续期',
  upgrade: '升级',
  owned: '已拥有',
};

export interface SubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 后端 /billing/plans 的全部档位(含 free,用于渲染三卡)。 */
  plans: MembershipPlanData[];
  /** 最受欢迎档(显示徽章)。 */
  popularTier?: string;
  methods: SubscribePayOption[];
  /** 用户当前生效档(决定每卡 续期/升级/已拥有)。未登录/未知=undefined → 全部「立即订阅」。 */
  currentTier?: 'free' | 'pro' | 'max';
  /** 打开时预选的套餐。 */
  initialTier?: 'pro' | 'max';
  /** 打开时预选的计费周期(价格页切到年付再点订阅时带入)。 */
  initialCycle?: BillingCycle;
  /** 报价(算应付金额 + 动作);不传则只显示套餐价。 */
  quote?: (tier: 'pro' | 'max', cycle: BillingCycle) => Promise<SubQuote>;
  /** 确认支付:父级建单 + 按 method 发起支付。返回 true=已完成(关弹窗)。 */
  onPay: (tier: 'pro' | 'max', method: string, cycle: BillingCycle) => Promise<boolean>;
}

export function SubscribeDialog({
  open,
  onOpenChange,
  plans,
  popularTier,
  methods,
  currentTier,
  initialTier,
  initialCycle,
  quote,
  onPay,
}: SubscribeDialogProps) {
  const paidPlans = plans.filter((p) => p.tier !== 'free');
  const selectableTiers = paidPlans
    .map((p) => p.tier)
    .filter((t) => cardActionFor(t, currentTier) !== 'owned') as ('pro' | 'max')[];
  const yearlyAvailable = paidPlans.some(planYearlyEnabled);
  const savingsPct = maxYearlySavingsPct(plans);

  const pickDefault = (): 'pro' | 'max' => {
    if (initialTier && selectableTiers.includes(initialTier)) return initialTier;
    if (currentTier === 'pro' && selectableTiers.includes('pro')) return 'pro'; // 在期默认续期当前档
    if (popularTier === 'pro' || popularTier === 'max') {
      if (selectableTiers.includes(popularTier)) return popularTier;
    }
    return selectableTiers[0] ?? 'pro';
  };

  const [tier, setTier] = useState<'pro' | 'max'>(pickDefault());
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle ?? 'monthly');
  const [method, setMethod] = useState('');
  const [paying, setPaying] = useState(false);
  const [quoteData, setQuoteData] = useState<SubQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);

  // 打开时:预选套餐 + 周期 + 默认支付方式。
  useEffect(() => {
    if (!open) return;
    setTier(pickDefault());
    setCycle(initialCycle && yearlyAvailable ? initialCycle : 'monthly');
    setMethod((m) => (methods.some((x) => x.id === m) ? m : methods[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTier, initialCycle]);

  const selected = plans.find((p) => p.tier === tier);
  // 该档年付未开放 → 报价/下单自动回落月度(卡片展示同步回落)。
  const effCycle: BillingCycle = cycle === 'yearly' && selected && planYearlyEnabled(selected) ? 'yearly' : 'monthly';

  // 选中档 / 周期变化 → 拉报价(应付金额 + 动作)。
  useEffect(() => {
    if (!open || !quote) {
      setQuoteData(null);
      setQuoteFailed(false);
      return;
    }
    let alive = true;
    setQuoting(true);
    setQuoteData(null);
    setQuoteFailed(false);
    quote(tier, effCycle)
      .then((q) => alive && setQuoteData(q))
      .catch(() => alive && setQuoteFailed(true))
      .finally(() => alive && setQuoting(false));
    return () => {
      alive = false;
    };
  }, [open, tier, effCycle, quote]);

  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const action = quoteData?.action ?? cardActionFor(tier, currentTier);
  // 升级动作:后端把周期锁到「按剩余时长选定」的基准周期(忽略请求周期,两步走),切换器禁用。
  const upgradeLock = action === 'upgrade';
  // 展示/下单周期:升级取后端报价锁定的周期(quoteData.cycle),其余取用户所选 effCycle ——
  // 杜绝「卡片按用户手选年付渲染年价/年赠,底部却是月度补差」的口径矛盾(评审 compat-display)。
  const orderCycle: BillingCycle = upgradeLock && quoteData ? quoteData.cycle : effCycle;
  // 应付:优先用报价金额(续期=周期价 / 升级=差价)。需要报价却尚未拿到(加载中/失败)时不猜金额。
  const needQuote = !!quote;
  const quoteReady = !needQuote || (!!quoteData && quoteData.tier === tier);
  const payCents = quoteData && quoteData.tier === tier ? quoteData.amount_cents : selected?.price_cents ?? 0;
  const payCycle: BillingCycle = quoteData?.cycle ?? effCycle;
  const newExpires = quoteData?.new_expires_at ? quoteData.new_expires_at.slice(0, 10) : '';
  // 金额展示:非整元(升级按天折算的差价必带分位)显示两位小数,与实扣 order.final_amount 一致。
  const yuanText = (cents: number) => (cents % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2));

  const onConfirm = async () => {
    if (!sel || !selected) return;
    setPaying(true);
    try {
      // 下单周期用 orderCycle(升级=后端锁定周期),使支付 subject / 成功文案不再把升级误标「年度会员」。
      const done = await onPay(tier, sel, orderCycle);
      if (done) onOpenChange(false);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择会员套餐</DialogTitle>
          <DialogDescription>
            更高 AI 额度,按 7 天周期自动恢复满额。年付一次到位更划算。不支持降级。
          </DialogDescription>
        </DialogHeader>

        {/* 月付 / 年付 切换(有任一档开放年付才显示;升级动作锁定后端选定的基准周期) */}
        {yearlyAvailable && (
          <div className="flex justify-center">
            <BillingCycleToggle
              value={orderCycle}
              onChange={setCycle}
              savingsPct={savingsPct}
              disabled={upgradeLock}
              disabledHint="升级按剩余时长补差价、周期与到期日不变;升级完成后可再按年续期"
            />
          </div>
        )}

        {/* 套餐选择 —— 价格页同款卡片 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plans.map((p) => {
            const act = cardActionFor(p.tier, currentTier);
            const selectable = act !== 'free' && act !== 'owned';
            const isSelected = selectable && p.tier === tier;
            return (
              <MembershipPlanCard
                key={p.tier}
                plan={p}
                cycle={orderCycle}
                popularBadge={popularTier === p.tier}
                highlighted={isSelected}
                onSelect={selectable ? () => setTier(p.tier as 'pro' | 'max') : undefined}
                footer={
                  <div
                    className={cn(
                      'inline-flex h-10 items-center justify-center gap-1.5 rounded-8 text-14 font-medium transition-colors',
                      isSelected
                        ? 'bg-brand-red text-on-brand'
                        : act === 'owned' || act === 'free'
                          ? 'border border-border-button text-faint'
                          : 'border border-border-button text-foreground',
                    )}
                  >
                    {isSelected ? (
                      <>
                        <Check className="size-4" /> 已选择
                      </>
                    ) : (
                      ACTION_LABEL[act]
                    )}
                  </div>
                }
              />
            );
          })}
        </div>

        {/* 支付方式 */}
        <div>
          <p className="mb-2 text-12 font-medium text-foreground">支付方式</p>
          {methods.length === 0 ? (
            <p className="rounded-12 border border-border bg-surface-1 p-3 text-12 text-faint">
              管理员尚未配置支付渠道,暂时无法订阅。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {methods.map((m) => {
                const Icon = METHOD_ICON[m.id] ?? CreditCard;
                const active = m.id === sel;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-8 border p-3 text-left transition-colors',
                      active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    <Icon className={cn('size-5 shrink-0', active ? 'text-brand-red' : 'text-faint')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-14 font-medium text-foreground">{m.name}</p>
                      <p className="text-12 text-faint">{m.desc}</p>
                    </div>
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-pill border',
                        active ? 'border-brand-red' : 'border-border',
                      )}
                    >
                      {active && <span className="size-2 rounded-pill bg-brand-red" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 合计 + 确认 */}
        <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-12 text-faint">{action === 'upgrade' ? '补差价' : '合计'}</span>
              {quoting ? (
                <Loader2 className="size-4 animate-spin text-faint" />
              ) : quoteFailed ? (
                <span className="text-14 font-medium text-brand-red">报价获取失败</span>
              ) : (
                <span className="text-20 font-medium text-brand-red">¥{yuanText(payCents)}</span>
              )}
              {!quoteFailed && action !== 'upgrade' && (
                <span className="text-12 text-faint">{payCycle === 'yearly' ? '/ 年' : '/ 月'}</span>
              )}
            </div>
            {quoteFailed ? (
              <span className="text-12 text-brand-red">网络异常,请重选套餐或稍后重试</span>
            ) : (
              <>
                {action === 'renew' && (
                  <span className="text-12 text-faint">
                    {payCycle === 'yearly' ? '按年续期 · 转为年费会员 · 到期日 +1 年' : '续期 · 到期日 +1 个自然月'}
                    {newExpires ? ` · 续至 ${newExpires}` : ''}
                  </span>
                )}
                {action === 'new' && payCycle === 'yearly' && (
                  <span className="text-12 text-faint">
                    年费会员{newExpires ? ` · 有效期至 ${newExpires}` : ''}
                  </span>
                )}
                {action === 'upgrade' && quoteData && (
                  <span className="text-12 text-faint">
                    升级补差价 · 剩余 {quoteData.remaining_days} 天 · 立即生效 · 周期与到期日不变
                    {payCycle === 'yearly' ? ' · 按年费价目折算' : ''}
                  </span>
                )}
              </>
            )}
          </div>
          <Button
            onClick={onConfirm}
            disabled={!sel || paying || quoting || !quoteReady}
            className="bg-brand-red text-on-brand hover:bg-brand-red/90"
          >
            {paying && <Loader2 className="size-3.5 animate-spin" />}
            {action === 'renew'
              ? payCycle === 'yearly'
                ? '按年续期并支付'
                : '续期并支付'
              : action === 'upgrade'
                ? '升级并补差价'
                : payCycle === 'yearly'
                  ? '开通年费会员'
                  : '确认支付'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

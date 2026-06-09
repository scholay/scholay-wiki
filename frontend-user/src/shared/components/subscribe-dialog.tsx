// 会员套餐购买弹窗(presentational)—— 上方用价格页同款套餐卡(免费 / Pro 套餐 / Max 套餐)选套餐,
// 下方选支付方式(微信/支付宝/测试支付)+ 确认支付。纯展示:数据与建单付款(onPay)由各 feature 注入。
//
// 续期 / 升级 / 不降级:
//   · 当前档(在期)→「续期」(延一个月,经费下一周期发放)
//   · 更高档 →「升级」(按剩余天数补差价 + 经费差额,立即升档)
//   · 更低档 →「已拥有」不可选(不支持降级)
//   实际应付金额按 quote(tier) 报价显示;测试支付当作一种支付方式平等对待。
import { useEffect, useState } from 'react';
import { Loader2, Check, QrCode, CreditCard, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { MembershipPlanCard, type MembershipPlanData } from './membership-plan-card';

export interface SubscribePayOption {
  id: string; // wechat | alipay | test
  name: string;
  desc: string;
}

/** 订阅报价(后端 /user/billing/subscribe/quote)。 */
export interface SubQuote {
  action: 'new' | 'renew' | 'upgrade';
  tier: 'pro' | 'max';
  amount_cents: number;
  credits: number;
  deferred: boolean; // 经费延后到下一周期生效(续期)
  current_tier: string;
  remaining_days: number;
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
  free: '免费版',
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
  /** 报价(算应付金额 + 动作);不传则只显示月价。 */
  quote?: (tier: 'pro' | 'max') => Promise<SubQuote>;
  /** 确认支付:父级建单 + 按 method 发起支付。返回 true=已完成(关弹窗)。 */
  onPay: (tier: 'pro' | 'max', method: string) => Promise<boolean>;
}

export function SubscribeDialog({
  open,
  onOpenChange,
  plans,
  popularTier,
  methods,
  currentTier,
  initialTier,
  quote,
  onPay,
}: SubscribeDialogProps) {
  const paidPlans = plans.filter((p) => p.tier !== 'free');
  const selectableTiers = paidPlans
    .map((p) => p.tier)
    .filter((t) => cardActionFor(t, currentTier) !== 'owned') as ('pro' | 'max')[];

  const pickDefault = (): 'pro' | 'max' => {
    if (initialTier && selectableTiers.includes(initialTier)) return initialTier;
    if (currentTier === 'pro' && selectableTiers.includes('pro')) return 'pro'; // 在期默认续期当前档
    if (popularTier === 'pro' || popularTier === 'max') {
      if (selectableTiers.includes(popularTier)) return popularTier;
    }
    return selectableTiers[0] ?? 'pro';
  };

  const [tier, setTier] = useState<'pro' | 'max'>(pickDefault());
  const [method, setMethod] = useState('');
  const [paying, setPaying] = useState(false);
  const [quoteData, setQuoteData] = useState<SubQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  // 打开时:预选套餐 + 默认支付方式。
  useEffect(() => {
    if (!open) return;
    setTier(pickDefault());
    setMethod((m) => (methods.some((x) => x.id === m) ? m : methods[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTier]);

  // 选中档变化 → 拉报价(应付金额 + 动作)。
  useEffect(() => {
    if (!open || !quote) {
      setQuoteData(null);
      return;
    }
    let alive = true;
    setQuoting(true);
    setQuoteData(null);
    quote(tier)
      .then((q) => alive && setQuoteData(q))
      .catch(() => alive && setQuoteData(null))
      .finally(() => alive && setQuoting(false));
    return () => {
      alive = false;
    };
  }, [open, tier, quote]);

  const selected = plans.find((p) => p.tier === tier);
  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  // 应付:有报价用报价金额(续期=月价 / 升级=差价),否则回退月价。
  const payCents = quoteData && quoteData.tier === tier ? quoteData.amount_cents : selected?.price_cents ?? 0;
  const action = quoteData?.action ?? cardActionFor(tier, currentTier);

  const onConfirm = async () => {
    if (!sel || !selected) return;
    setPaying(true);
    try {
      const done = await onPay(tier, sel);
      if (done) onOpenChange(false);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择会员套餐</DialogTitle>
          <DialogDescription>更高每日 AI 额度 + 每月赠送科研经费,经费可随时重置额度。不支持降级。</DialogDescription>
        </DialogHeader>

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
                popularBadge={popularTier === p.tier}
                highlighted={isSelected}
                onSelect={selectable ? () => setTier(p.tier as 'pro' | 'max') : undefined}
                footer={
                  <div
                    className={cn(
                      'inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-bold transition-colors',
                      isSelected
                        ? 'bg-brand-red text-background'
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
          <p className="mb-2 text-xs font-bold text-foreground">支付方式</p>
          {methods.length === 0 ? (
            <p className="rounded-md border border-border bg-surface-1 p-3 text-xs text-faint">
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
                      'flex items-center gap-3 rounded-md border p-3 text-left transition-colors',
                      active ? 'border-brand-red bg-danger-soft' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    <Icon className={cn('size-5 shrink-0', active ? 'text-brand-red' : 'text-faint')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground">{m.name}</p>
                      <p className="text-2xs text-faint">{m.desc}</p>
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
              <span className="text-xs text-faint">{action === 'upgrade' ? '补差价' : '合计'}</span>
              {quoting ? (
                <Loader2 className="size-4 animate-spin text-faint" />
              ) : (
                <span className="text-xl font-bold text-brand-red">¥{Math.round(payCents / 100)}</span>
              )}
              {action !== 'upgrade' && <span className="text-2xs text-faint">/ 月</span>}
            </div>
            {action === 'renew' && <span className="text-2xs text-faint">续期 · 本期经费将于下一周期发放</span>}
            {action === 'upgrade' && quoteData && (
              <span className="text-2xs text-faint">升级补差价 · 剩余 {quoteData.remaining_days} 天 · 立即生效</span>
            )}
          </div>
          <Button
            onClick={onConfirm}
            disabled={!sel || paying || quoting}
            className="bg-brand-red text-background hover:bg-brand-red/90"
          >
            {paying && <Loader2 className="size-3.5 animate-spin" />}
            {action === 'renew' ? '续期并支付' : action === 'upgrade' ? '升级并补差价' : '确认支付'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 会员「升级」/「续费」弹窗 —— 两条流程共用一个外壳,靠 mode + 选项集区分。
//
// 为什么不再用一个混合弹窗(2026-08-12 重做):
//   旧的 SubscribeDialog 把「选档」和「选周期」做成两个独立控件,再让用户自己组合。
//   但合法组合是**按当前会员状态强约束**的(年费会员不能按月续、顶档不能升级、
//   月付会员升年付走的是另一套计价),两个自由控件必然产出后端会拒或与展示价不符的组合 ——
//   pro 月付用户选 Max 看到年付价、实扣补差价,就是这么来的。
//   现在改成「把合法选项**穷举成卡片**」:每张卡 = 一个 (档位, 周期) 组合 + 它自己的报价。
//   用户点哪张就是买哪张,不存在无效组合,展示价永远来自那张卡自己的 quote。
//
// 金额一律来自后端报价(/user/billing/subscribe/quote),前端不做任何价格推算 ——
// 升级的补差价、switch 的整年价、续费的周期价三种口径都由后端给,前端只负责显示。
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { PayMethodLogo } from './PayMethodLogo';
import {
  MembershipPlanCard,
  yuanText,
  type BillingCycle,
  type MembershipPlanData,
} from './membership-plan-card';
import type { MembershipOption } from '@/shared/lib/membership-options';
import type { SubQuote, SubscribePayOption } from './subscribe-dialog';

const CYCLE_NAME: Record<BillingCycle, string> = { monthly: '月付', yearly: '年付' };

/** 一张选项卡的报价状态。 */
interface OptionQuote {
  loading: boolean;
  quote?: SubQuote;
  failed?: boolean;
}

const optionKey = (o: MembershipOption) => `${o.tier}/${o.cycle}`;

/**
 * 按后端返回的 action 给出这张卡的「买到什么」说明。
 * 三种 action 的语义差别很大,不能混成一句话:
 *   upgrade —— 原地补差:立刻升档,到期日不动(便宜,但不延长)
 *   switch  —— 升档 + 整年:延长一年,原有剩余天数保留
 *   renew   —— 续费:延长一个周期
 *   new     —— 首次订阅
 */
function actionNote(q: SubQuote | undefined, expiresText: string): string {
  if (!q) return '';
  switch (q.action) {
    case 'upgrade':
      return `立即升档,到期日不变${expiresText ? `(${expiresText})` : ''};只补剩余时间的差价`;
    case 'switch':
      return `立即升档,并延长一年${expiresText ? `,到 ${expiresText}` : ''};原有剩余时间保留`;
    case 'renew':
      return `在现有到期日基础上延长${expiresText ? `,到 ${expiresText}` : ''}`;
    default:
      return expiresText ? `有效期至 ${expiresText}` : '';
  }
}

export interface MembershipActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** upgrade = 升级流程;renew = 续费流程。只影响标题/说明,选项集由 options 决定。 */
  mode: 'upgrade' | 'renew';
  /** 本场景的合法选项(来自 shared/lib/membership-options)。 */
  options: MembershipOption[];
  /** 各档牌价与权益(渲染套餐卡用;价格区由每张卡自己的报价覆盖)。 */
  plans: MembershipPlanData[];
  /** 打开时预选中的那一项(价格页点某张卡进来);不在 options 里则忽略,落回第一项。 */
  preselect?: MembershipOption | null;
  methods: SubscribePayOption[];
  /** 逐选项报价(后端算金额与动作)。 */
  quote: (tier: 'pro' | 'max', cycle: BillingCycle) => Promise<SubQuote>;
  /** 确认支付:父级建单 + 发起支付。返回 true = 已完成(关弹窗)。 */
  onPay: (tier: 'pro' | 'max', method: string, cycle: BillingCycle) => Promise<boolean>;
}

export function MembershipActionDialog({
  open,
  onOpenChange,
  mode,
  options,
  plans,
  preselect,
  methods,
  quote,
  onPay,
}: MembershipActionDialogProps) {
  const [picked, setPicked] = useState(0);
  const [method, setMethod] = useState('');
  const [paying, setPaying] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, OptionQuote>>({});

  const optionsKey = useMemo(() => options.map(optionKey).join(','), [options]);

  const preselectKey = preselect ? optionKey(preselect) : '';
  useEffect(() => {
    if (!open) return;
    const at = options.findIndex((o) => optionKey(o) === preselectKey);
    setPicked(at >= 0 ? at : 0);
    setMethod((m) => (methods.some((x) => x.id === m) ? m : methods[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionsKey, preselectKey]);

  // 打开时把**每个**选项都报一遍价:卡片上直接显示各自应付,用户在选之前就能比较,
  // 不用点一张等一次(旧弹窗每换一次选择重拉一次报价,价格在眼前跳)。
  useEffect(() => {
    if (!open || options.length === 0) return;
    let alive = true;
    setQuotes(Object.fromEntries(options.map((o) => [optionKey(o), { loading: true }])));
    for (const o of options) {
      quote(o.tier, o.cycle)
        .then((q) => {
          if (alive) setQuotes((prev) => ({ ...prev, [optionKey(o)]: { loading: false, quote: q } }));
        })
        .catch(() => {
          if (alive) setQuotes((prev) => ({ ...prev, [optionKey(o)]: { loading: false, failed: true } }));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionsKey, quote]);

  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const current = options[picked];
  const currentQuote = current ? quotes[optionKey(current)] : undefined;
  const payReady = !!current && !!currentQuote?.quote && !!sel;

  const onConfirm = async () => {
    if (!current || !sel) return;
    setPaying(true);
    try {
      const done = await onPay(current.tier, sel, current.cycle);
      if (done) onOpenChange(false);
    } finally {
      setPaying(false);
    }
  };

  const title = mode === 'upgrade' ? '升级会员' : '续费会员';
  const desc =
    mode === 'upgrade'
      ? '选择要升级到的套餐。付款后立刻生效,到期不会自动续费。'
      : '选择续费周期。新的有效期在当前到期日基础上顺延,到期不会自动续费。';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              // 🔴 不能用 useNavigate:本弹窗可能被挂在 Router 之外的 providers 层(额度条/toast
              // 的升级入口),Router 上下文外调用 hook 会整站白屏。走 window.__appRouter 桥。
              if (window.location.pathname !== '/pricing') quotaNavigate('/pricing');
            }}
            className="self-start text-12 text-brand-red transition-colors hover:underline"
          >
            看看各档具体差在哪 →
          </button>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="py-6 text-center text-14 text-muted-foreground">
            当前没有可{mode === 'upgrade' ? '升级' : '续费'}的套餐。
          </p>
        ) : (
          // 卡片化:复用价格页同一张 MembershipPlanCard(档名/定位/权益列表/徽章),
          // 价格区用**该选项自己的报价**覆盖 —— 卡上的数字与底部支付按钮永远是同一个数。
          <div
            className={cn(
              'grid gap-3',
              options.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2',
            )}
          >
            {options.map((o, i) => {
              const st = quotes[optionKey(o)];
              const q = st?.quote;
              const plan = plans.find((p) => p.tier === o.tier);
              if (!plan) return null;
              const expiresText = q?.new_expires_at ? q.new_expires_at.slice(0, 10) : '';
              const selected = i === picked;
              return (
                <MembershipPlanCard
                  key={optionKey(o)}
                  plan={plan}
                  cycle={o.cycle}
                  compact
                  badgeText={CYCLE_NAME[o.cycle]}
                  highlighted={selected}
                  onSelect={() => setPicked(i)}
                  priceOverride={{
                    cents: q?.amount_cents ?? 0,
                    note: st?.loading
                      ? '正在获取价格…'
                      : st?.failed
                        ? '暂时拿不到价格,稍后再试'
                        : actionNote(q, expiresText),
                  }}
                  footer={
                    <div
                      className={cn(
                        'inline-flex h-10 w-full items-center justify-center gap-2 rounded-8 text-14 font-medium transition-colors',
                        selected
                          ? 'bg-brand-red text-on-brand'
                          : 'border border-border-button text-foreground',
                      )}
                    >
                      {selected ? (
                        <>
                          <Check className="size-4" /> 已选择
                        </>
                      ) : (
                        `选择${CYCLE_NAME[o.cycle]}`
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        )}

        {options.length > 0 && methods.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-12 text-faint">支付方式</p>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-8 border px-3 py-2 text-14 transition-colors',
                    sel === m.id ? 'border-brand-red bg-brand-red-soft' : 'border-border hover:bg-surface-1',
                  )}
                >
                  <PayMethodLogo method={m.id} className="size-4" />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {options.length > 0 && (
          <Button
            className="w-full"
            disabled={!payReady || paying}
            onClick={() => void onConfirm()}
          >
            {paying ? <Loader2 className="size-4 animate-spin" /> : null}
            {currentQuote?.quote
              ? `支付 ¥${yuanText(currentQuote.quote.amount_cents)}`
              : '确认支付'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

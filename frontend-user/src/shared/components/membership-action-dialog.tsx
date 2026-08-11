// 会员「购买 / 升级 / 续费」弹窗 —— 三条流程共用一个外壳,靠 mode + 合法选项集区分。
//
// 版式依据 2026-08-12 用户设计稿(与价格页同源的卡片语言):
//   ① 顶部周期切换(年付在前、带「省 N%」)—— 只在本场景真有两种周期可选时才出现
//   ② 档位卡两列:划线原价 + 主数字(月口径)+ 计费副行 + 权益列表 + 右上角单选指示
//   ③ 支付方式两列卡片(品牌 logo + 名称 + 说明 + 单选)
//   ④ 底部结算条:合计金额(+ 折合月价)/ 这一单到底发生什么 / 主 CTA
//
// 🔴 卡片与结算条的分工(本弹窗最关键的一条,别再合并):
//   · **卡片讲价值**:牌价口径(划线 + 折合月价),回答「这一档值不值」;
//   · **结算条讲事实**:`合计` 恒等于后端报价的应付金额,回答「我现在付多少、买到什么」。
//   升级的补差价、switch 的整年价、续费的周期价三种口径都由后端算,前端一分钱都不推算。
//   历史上正是把这两件事挤进同一个数字,才出现「卡上 ¥2690、实扣 ¥105」的价格对不上。
//
// 合法选项由 shared/lib/membership-options 推导(与后端 5 场景矩阵一一对应),
// 本组件把它拆成「可选档位 × 可选周期」两维渲染 —— 该集合恒为网格,不存在
// 「某档只有月付、另一档只有年付」的破格情况(见 membership-options 的场景表)。
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
import { ScholayMark } from './brand/ScholayMark';
import {
  BillingCycleToggle,
  maxYearlySavingsPct,
  monthlyEquivalentCents,
  PLAN_META,
  planYearlyEnabled,
  yuanText,
  type BillingCycle,
  type MembershipPlanData,
} from './membership-plan-card';
import type { MembershipOption, PaidTier } from '@/shared/lib/membership-options';
import type { SubQuote, SubscribePayOption } from './subscribe-dialog';

/** 一个组合的报价状态。 */
interface OptionQuote {
  loading: boolean;
  quote?: SubQuote;
  failed?: boolean;
}

const qKey = (tier: string, cycle: string) => `${tier}/${cycle}`;

/** 权益列表(与价格页同源;弹窗只做转化,取前四条真卖点)。 */
function benefits(plan: MembershipPlanData): string[] {
  const quota =
    plan.tier === 'max'
      ? `AI 额度是 Pro 的 ${plan.multiplier} 倍`
      : `AI 额度是 Free 的 ${plan.multiplier} 倍`;
  return plan.tier === 'max'
    ? [quota, '每周约够 15 份完整审稿、150 轮对话', '最强 AI 模型', '高峰期优先处理']
    : [quota, '每周约够 40 轮对话、3 份完整审稿', '优先用上更强的 AI 模型', '新功能先给你用'];
}

/** 结算条第二行:这一单到底发生什么(动作 + 到期日变化)。 */
function settlementNote(q: SubQuote | undefined): string {
  if (!q) return '';
  const to = q.new_expires_at ? q.new_expires_at.slice(0, 10) : '';
  const yearly = q.cycle === 'yearly';
  switch (q.action) {
    case 'upgrade':
      return `立即升档 · 到期日不变${to ? `(${to})` : ''} · 只补剩余时间的差价`;
    case 'switch':
      return `立即升档并转为年费会员 · 到期日 +1 年${to ? ` · 续至 ${to}` : ''}`;
    case 'renew': {
      const turn = yearly && q.current_cycle === 'monthly' ? ' · 转为年费会员' : '';
      return `按${yearly ? '年' : '月'}续期${turn} · 到期日 +1 ${yearly ? '年' : '月'}${to ? ` · 续至 ${to}` : ''}`;
    }
    default:
      return `立即生效${to ? ` · 有效期至 ${to}` : ''}`;
  }
}

/** 主 CTA:说清按下去会发生什么,不用泛化的「确认支付」。 */
function ctaText(q: SubQuote | undefined): string {
  if (!q) return '确认支付';
  switch (q.action) {
    case 'upgrade':
      return '升级并支付';
    case 'switch':
      return '升级并按年付费';
    case 'renew':
      return q.cycle === 'yearly' ? '按年续期并支付' : '按月续期并支付';
    default:
      return q.cycle === 'yearly' ? '按年订阅并支付' : '立即订阅并支付';
  }
}

export interface MembershipActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** subscribe = 首次订阅;upgrade = 升级;renew = 续费。只影响标题与文案。 */
  mode: 'subscribe' | 'upgrade' | 'renew';
  /** 本场景的合法选项(来自 shared/lib/membership-options)。 */
  options: MembershipOption[];
  /** 各档牌价与权益(渲染卡片用)。 */
  plans: MembershipPlanData[];
  /** 打开时预选中的那一项;不在 options 里则忽略。 */
  preselect?: MembershipOption | null;
  popularTier?: string;
  methods: SubscribePayOption[];
  quote: (tier: PaidTier, cycle: BillingCycle) => Promise<SubQuote>;
  onPay: (tier: PaidTier, method: string, cycle: BillingCycle) => Promise<boolean>;
}

export function MembershipActionDialog({
  open,
  onOpenChange,
  mode,
  options,
  plans,
  preselect,
  popularTier,
  methods,
  quote,
  onPay,
}: MembershipActionDialogProps) {
  const tiers = useMemo(() => [...new Set(options.map((o) => o.tier))] as PaidTier[], [options]);
  const cycles = useMemo(() => [...new Set(options.map((o) => o.cycle))] as BillingCycle[], [options]);
  const optionsKey = useMemo(() => options.map((o) => qKey(o.tier, o.cycle)).join(','), [options]);

  const [tier, setTier] = useState<PaidTier | null>(null);
  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [method, setMethod] = useState('');
  const [paying, setPaying] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, OptionQuote>>({});

  // 默认:预选项 > 年付优先(它是我们希望用户选的那一档)+ 首个档位。
  const preTier = preselect?.tier;
  const preCycle = preselect?.cycle;
  useEffect(() => {
    if (!open) return;
    setTier(preTier && tiers.includes(preTier) ? preTier : tiers[0] ?? null);
    setCycle(
      preCycle && cycles.includes(preCycle)
        ? preCycle
        : cycles.includes('yearly')
          ? 'yearly'
          : cycles[0] ?? null,
    );
    setMethod((m) => (methods.some((x) => x.id === m) ? m : methods[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionsKey, preTier, preCycle]);

  // 打开时把每个组合都报一遍价:切档 / 切周期时结算条立刻有数,不用等一次请求。
  useEffect(() => {
    if (!open || options.length === 0) return;
    let alive = true;
    setQuotes(Object.fromEntries(options.map((o) => [qKey(o.tier, o.cycle), { loading: true }])));
    for (const o of options) {
      quote(o.tier, o.cycle)
        .then((r) => {
          if (alive) setQuotes((p) => ({ ...p, [qKey(o.tier, o.cycle)]: { loading: false, quote: r } }));
        })
        .catch(() => {
          if (alive) setQuotes((p) => ({ ...p, [qKey(o.tier, o.cycle)]: { loading: false, failed: true } }));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionsKey, quote]);

  const sel = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? '';
  const current = tier && cycle ? quotes[qKey(tier, cycle)] : undefined;
  const q = current?.quote;
  const savingsPct = maxYearlySavingsPct(plans);
  const yearly = cycle === 'yearly';

  const onConfirm = async () => {
    if (!tier || !cycle || !sel) return;
    setPaying(true);
    try {
      const done = await onPay(tier, sel, cycle);
      if (done) onOpenChange(false);
    } finally {
      setPaying(false);
    }
  };

  const title = mode === 'renew' ? '续费会员' : mode === 'upgrade' ? '升级会员' : '选择会员套餐';
  const desc =
    mode === 'renew'
      ? '新的有效期在当前到期日基础上顺延。付款后立刻生效,到期不会自动续费。'
      : '年付一次付清更省。付款后立刻生效,到期不会自动续费。';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              // 🔴 不能用 useNavigate:本弹窗可能挂在 Router 之外的 providers 层(额度条入口),
              // Router 上下文外调用 hook 会整站白屏。走 window.__appRouter 桥。
              if (window.location.pathname !== '/pricing') quotaNavigate('/pricing');
            }}
            className="self-start text-12 text-brand-red transition-colors hover:underline"
          >
            看看各档具体差在哪 →
          </button>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="py-6 text-center text-14 text-muted-foreground">
            当前没有可{mode === 'renew' ? '续费' : '升级'}的套餐。
          </p>
        ) : (
          <>
            {/* ① 周期切换 —— 只在真有两种周期可选时出现。年费会员续费只能按年、
                年费会员升级只能年付,那些场景下画一个禁用切换器等于摆个点不动的控件。 */}
            {cycles.length > 1 && cycle && (
              <div className="flex justify-center">
                <BillingCycleToggle value={cycle} onChange={setCycle} savingsPct={savingsPct} />
              </div>
            )}

            {/* ② 档位卡 */}
            <div className={cn('grid gap-3', tiers.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1')}>
              {tiers.map((t) => {
                const plan = plans.find((p) => p.tier === t);
                if (!plan || !cycle) return null;
                const meta = PLAN_META[t];
                const effYearly = cycle === 'yearly' && planYearlyEnabled(plan);
                // 主数字恒为**月口径**(年付=折合月价),副行交代真实计费方式 ——
                // 与价格页同一口径:用户脑子里的比较基准就是月价。
                const head = effYearly ? monthlyEquivalentCents(plan.year_price_cents) : plan.price_cents;
                const strike = effYearly
                  ? plan.price_cents > head
                    ? plan.price_cents
                    : 0
                  : plan.original_cents > plan.price_cents
                    ? plan.original_cents
                    : 0;
                const selected = t === tier;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={cn(
                      'relative flex flex-col overflow-hidden rounded-16 border p-5 text-left transition-colors',
                      selected
                        ? 'border-brand-red bg-brand-red-soft'
                        : 'border-border bg-surface-card hover:border-border-strong',
                    )}
                  >
                    {/* 选中卡的品牌水印(设计稿):极低不透明度,纯装饰 */}
                    {selected && (
                      <ScholayMark
                        aria-hidden
                        className="pointer-events-none absolute -bottom-4 right-0 size-40 opacity-5"
                      />
                    )}
                    <span className="relative flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-20 font-medium text-foreground">{meta.name}</span>
                          {popularTier === t && (
                            <span className="shrink-0 rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
                              最受欢迎
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-12 text-faint">{meta.sub}</span>
                      </span>
                      {/* 右上角单选指示:卡本身即选择控件,底部不再放一排按钮 */}
                      <span
                        className={cn(
                          'mt-1 flex size-5 shrink-0 items-center justify-center rounded-pill border',
                          selected ? 'border-brand-red bg-brand-red text-on-brand' : 'border-border',
                        )}
                      >
                        {selected && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </span>

                    {/* 价格:划线原价 + 主数字(月口径) */}
                    <span className="relative mt-4 flex flex-wrap items-baseline gap-2">
                      {strike > 0 && (
                        <span className="text-16 text-faint line-through tabular-nums">
                          ¥{yuanText(strike)}
                        </span>
                      )}
                      <span className="whitespace-nowrap">
                        <span className="font-display text-32 font-bold leading-display-tight text-foreground tabular-nums">
                          ¥{yuanText(head)}
                        </span>
                        <span className="ml-1 text-14 text-faint">/月</span>
                      </span>
                    </span>
                    <span className="relative mt-2 block text-12 text-muted-foreground">
                      {effYearly
                        ? `按年付费,一次 ¥${yuanText(plan.year_price_cents)}`
                        : '按月付费,随时可以改成年付'}
                    </span>

                    {/* 权益 */}
                    <span className="relative mt-4 block text-12 font-medium text-faint">
                      包含 {t === 'max' ? 'Pro' : 'Free'} 的全部,再加上:
                    </span>
                    <span className="relative mt-2 flex flex-col gap-2">
                      {benefits(plan).map((bft) => (
                        <span key={bft} className="flex items-start gap-2 text-12 leading-paragraph text-subtle">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-brand-green" strokeWidth={2.5} />
                          <span>{bft}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ③ 支付方式 */}
            {methods.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-12 text-faint">支付方式</p>
                <div className={cn('grid gap-2', methods.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1')}>
                  {methods.map((m) => {
                    const on = sel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-12 border p-3 text-left transition-colors',
                          on ? 'border-brand-red bg-brand-red-soft' : 'border-border hover:border-border-strong',
                        )}
                      >
                        <PayMethodLogo method={m.id} className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-14 font-medium text-foreground">{m.name}</span>
                          <span className="block text-12 text-faint">{m.desc}</span>
                        </span>
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-pill border',
                            on ? 'border-brand-red bg-brand-red text-on-brand' : 'border-border',
                          )}
                        >
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ④ 结算条 —— 「现在付多少 / 买到什么」的唯一出处,金额恒等于后端报价。 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline pt-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-12 text-faint">合计</span>
                  {current?.loading ? (
                    <Loader2 className="size-4 animate-spin text-faint" />
                  ) : q ? (
                    <>
                      <span className="font-display text-24 font-bold leading-display-tight text-foreground tabular-nums">
                        ¥{yuanText(q.amount_cents)}
                      </span>
                      {/* 单位只在「买的是一个完整周期」时才写:升级补差是一次性金额,
                          标「/年」会让人以为往后每年都收这个数。 */}
                      {q.action !== 'upgrade' && (
                        <span className="text-12 text-faint">
                          /{yearly ? '年' : '月'}
                          {yearly && ` (折合 ¥${yuanText(monthlyEquivalentCents(q.amount_cents))}/月)`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-14 text-faint">暂时拿不到价格</span>
                  )}
                </p>
                <p className="mt-1 text-12 text-muted-foreground">{settlementNote(q)}</p>
              </div>
              <Button
                className="shrink-0 rounded-pill px-5"
                disabled={!q || !sel || paying}
                onClick={() => void onConfirm()}
              >
                {paying && <Loader2 className="size-4 animate-spin" />}
                {ctaText(q)}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

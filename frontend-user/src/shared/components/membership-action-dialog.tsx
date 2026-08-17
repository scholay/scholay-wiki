// 会员「购买 / 升级 / 续费」弹窗 —— 三条流程共用一个外壳,靠 mode + 合法选项集区分。
//
// ── 版式:左右两栏(2026-08-13 改版)──────────────────────────────────────────
//   【左栏】周期切换 + 档位卡(划线原价 + 主数字月口径 + 计费副行 + 权益 + 单选指示)
//   【右栏】支付方式(纵向)+ 应付金额 + 这一单发生什么 + 主 CTA,整块做成抬升面板
//
// 🔴 为什么从「上下堆叠」改成「左右分栏」:原版式是
//   周期 → 档位卡 → 支付方式 → 结算条 的纵向长条,实测整体约 700px。
//   笔记本常见的 768px 高屏上 `max-h-[90dvh]` ≈ 691px —— **付款区被挤到折叠线以下**,
//   用户要先滚动才能看到自己付多少、按哪个键。价格页可以滚,收银台不行。
//   分栏后总高 ≈ max(左 360, 右 260) + 头部,一屏装得下,且付款区恒在视野内。
//
// 🔴 右栏刻意做得比左栏重(bg-surface-1 抬升 + border-border-strong + 32px 金额 + 满宽实心 CTA):
//   这是用户真正要做决策的地方(付多少、用什么付、按哪里)。左栏是「挑哪一档」,
//   信息量大但每一项都轻;右栏是「这一单」,项少而每一项都贵 —— 视觉重量按这个分。
//   窄屏(<lg)自动回落成上下堆叠,顺序仍是「先选套餐、后付款」。
//
// 🔴 卡片与结算区的分工(本弹窗最关键的一条,别再合并):
//   · **卡片讲价值**:牌价口径(划线 + 折合月价),回答「这一档值不值」;
//   · **结算区讲事实**:`应付金额` 恒等于后端报价,回答「我现在付多少、买到什么」。
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

/** 权益列表(与价格页同源;弹窗只做转化,取前三条真卖点)。
 * 🔴 2026-08-13:摘掉「最强 / 更强 AI 模型」「高峰期优先处理」「新功能先给你用」——
 * 实测代码里全不存在(详见 membership-plan-card.tsx planFeatures 的红字)。 */
function benefits(plan: MembershipPlanData): string[] {
  const quota =
    plan.tier === 'max'
      ? `AI 额度是 Pro 的 ${plan.multiplier} 倍`
      : `AI 额度是 Free 的 ${plan.multiplier} 倍`;
  return plan.tier === 'max'
    ? [quota, '每周约够 15 份完整审稿、150 轮对话', '多篇稿件并行推进时仍有余量']
    : [quota, '每周约够 40 轮对话、3 份完整审稿', '额度足以完整跑完 AI 审稿'];
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
      {/* max-w-5xl:分栏后左栏要同时放下两张档位卡(右栏定宽 300)。
          3xl(768)减去右栏只剩 ~430,两张卡各 ~210 —— ¥ 主数字 32px 会撑破。 */}
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
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
          // 左右两栏:左选套餐、右付款(理由见文件头)。右栏定宽 300 —— 支付卡与金额
          // 都是短内容,给弹性宽度只会让它在宽屏上摊薄、反而不聚焦;左栏吃掉全部余量。
          // lg 以下回落单列,顺序仍是「先选套餐、后付款」。
          // 🔴 刻意**不写** lg:items-start:栅格项默认 stretch,右栏才会被拉到整行高度,
          // 它的 border-l 也才是一条**从上到下贯通**的分割线(items-start 下只有内容那么长)。
          // 间距不用 gap 而用两侧对称 padding —— 分割线要落在两栏正中,gap 会让它贴着右栏。
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-0">
            {/* ── 左栏:周期 + 档位卡 ────────────────────────────────────── */}
            <div className="flex min-w-0 flex-col gap-2 lg:pr-6">
              {/* 周期切换 —— 只在真有两种周期可选时出现。年费会员续费只能按年、
                  年费会员升级只能年付,那些场景下画一个禁用切换器等于摆个点不动的控件。
                  `block` + 与卡片只隔 gap-2:让它读起来是**下面这组卡片的控制条**,
                  而不是一枚与卡片无关、浮在左上角的独立药丸(切周期会改卡上的价,关系必须看得见)。
                  ⚠️ 但**不能真的拉满整个左栏**:实拍(1366×768)下两项各占一半 = 每项 300px,
                  「月付」那半是一大片空,「省 N%」徽标浮在中间显得散。收到 320px 定宽 + 居中 ——
                  居中而非贴左:它管的是**整组卡片**(两张都受影响),压在卡组中轴上才对得起这层关系;
                  贴左会读成「只跟左边那张有关」。与价格页的切换器也统一为居中。 */}
              {cycles.length > 1 && cycle && (
                <BillingCycleToggle
                  block
                  className="sm:mx-auto sm:max-w-[320px]"
                  value={cycle}
                  onChange={setCycle}
                  savingsPct={savingsPct}
                />
              )}

              {/* 档位卡 —— sm 起并排(原为 md:)。左栏比整个弹窗窄,断点跟着提前,
                  否则在 md 宽度上会出现「左栏已经够宽、卡却还堆成一列」的空当。 */}
              <div className={cn('mt-1 grid gap-3', tiers.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
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
            </div>

            {/* ── 右栏:订单区 ──────────────────────────────────────────────
                🔴 **不做成卡片**(2026-08-13 用户拍板):卡片是「一块可选的东西」的语言,
                而这一栏是这一单的**结算凭据**,要读起来像收银小票而不是又一个待选项。
                因此去掉底色 / 圆角 / 描边盒,只留一条贯通的 border-l 与正文分区,
                重量全部交给排版:右对齐金额、32px 主数字、满宽实心 CTA。
                窄屏(<lg)竖排时分割线转成顶部横线,分区语义不丢。 */}
            <aside className="flex flex-col border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              {/* sticky 挂在内层:外层 aside 已被 stretch 拉满高(那是分割线的载体),
                  内容要留在顶部并在左栏超高时跟随视口。 */}
              <div className="flex flex-col gap-4 lg:sticky lg:top-0">
                {/* 支付方式 —— 表单行,不是卡片:行间发丝线分隔,选中态靠字重 + 勾选圈,
                    不用填充底色(填充块=卡片语言,与本栏定位冲突)。 */}
                {methods.length > 0 && (
                  <div>
                    <p className="text-12 font-medium text-faint">支付方式</p>
                    <div className="mt-1 flex flex-col">
                      {methods.map((m) => {
                        const on = sel === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMethod(m.id)}
                            className={cn(
                              'flex items-center gap-3 border-b border-border-hairline py-3 text-left transition-colors last:border-b-0',
                              on ? 'text-foreground' : 'text-subtle hover:text-foreground',
                            )}
                          >
                            <PayMethodLogo method={m.id} className="size-5 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-14', on && 'font-medium')}>
                                {m.name}
                              </span>
                              <span className="block truncate text-12 text-faint">{m.desc}</span>
                            </span>
                            <span
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center rounded-pill border',
                                on
                                  ? 'border-brand-red bg-brand-red text-on-brand'
                                  : 'border-border-button',
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

                {/* 应付金额 —— 「现在付多少 / 买到什么」的唯一出处,金额恒等于后端报价。
                    标签左、金额右的同基线行是收银台的通行写法,比左对齐更像结算单。 */}
                <div className="border-t border-border pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 text-12 font-medium text-faint">应付金额</span>
                    {current?.loading ? (
                      <Loader2 className="size-5 animate-spin text-faint" />
                    ) : q ? (
                      <span className="flex items-baseline gap-1 text-right">
                        <span className="font-display text-32 font-bold leading-display-tight text-foreground tabular-nums">
                          ¥{yuanText(q.amount_cents)}
                        </span>
                        {/* 单位只在「买的是一个完整周期」时才写:升级补差是一次性金额,
                            标「/年」会让人以为往后每年都收这个数。 */}
                        {q.action !== 'upgrade' && (
                          <span className="text-12 text-faint">/{yearly ? '年' : '月'}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-14 text-faint">暂时拿不到价格</span>
                    )}
                  </div>
                  {/* 折合月价右对齐跟在金额下:窄栏里跟在主数字后面会把 ¥ 数字挤换行 */}
                  {q && q.action !== 'upgrade' && yearly && (
                    <p className="mt-1 text-right text-12 text-faint">
                      折合 ¥{yuanText(monthlyEquivalentCents(q.amount_cents))}/月
                    </p>
                  )}
                  <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
                    {settlementNote(q)}
                  </p>
                </div>

                <Button
                  className="w-full rounded-pill"
                  disabled={!q || !sel || paying}
                  onClick={() => void onConfirm()}
                >
                  {paying && <Loader2 className="size-4 animate-spin" />}
                  {ctaText(q)}
                </Button>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// 会员套餐卡(presentational)—— 价格页「订阅套餐」三卡 + 升级弹窗的套餐选择共用同一张卡,
// 保证两处视觉完全一致。卡身(名称/价格/赠送经费/特性)固定,底部 footer slot 由调用方决定:
// 价格页放 CTA 按钮;弹窗放「选择此套餐 / 已选择」态。
// 年度订阅(0079):cycle='yearly' 时价格区显示年价 + 折合月价 + 「比月付省 ¥N」;
// 赠送经费区显示年度总额(按月分批发放)。year_price_cents<=0 = 该档年付未开放。
// 术语统一:额度每日「重置」(不用「刷新」);Free 不展示具体 token 数;等级一律叫 Free / Pro / Max。
import { type ReactNode } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** 计费周期(mirrors backend/internal/vip/billing_model.go CycleMonthly/CycleYearly)。 */
export type BillingCycle = 'monthly' | 'yearly';

/** 后端 /billing/plans 的单档结构(price/multiplier/赠送经费 + 年度价目)。 */
export interface MembershipPlanData {
  tier: 'free' | 'pro' | 'max';
  price_cents: number;
  original_cents: number;
  multiplier: number;
  grant_credits: number;
  /** 年度实付价(分);<=0 = 该档年付未开放。 */
  year_price_cents: number;
  /** 年度划线原价(分)。 */
  year_original_cents: number;
  /** 年度赠送经费总额(按月分 12 批发放)。 */
  year_grant_credits: number;
}

/** 各档展示文案(价格页 + 弹窗共用,保持一致)。 */
export const PLAN_META: Record<'free' | 'pro' | 'max', { name: string; sub: string }> = {
  // 等级名全站统一 Free / Pro / Max;sub 是各档定位副标题。
  free: { name: 'Free', sub: '面向全体学者永久免费' },
  pro: { name: 'Pro', sub: '轻量检索与日常写作' },
  max: { name: 'Max', sub: '高频科研的主力之选' },
};

/** 该档年付是否可购(后端年价 <=0 = admin 未开放)。 */
export function planYearlyEnabled(plan: Pick<MembershipPlanData, 'year_price_cents'>): boolean {
  return (plan.year_price_cents ?? 0) > 0;
}

/** 年付相对「按月付 12 个月」省下的钱(分);未开放/不省返回 0。 */
export function planYearlySavings(plan: Pick<MembershipPlanData, 'price_cents' | 'year_price_cents'>): number {
  if (!planYearlyEnabled(plan)) return 0;
  const diff = plan.price_cents * 12 - plan.year_price_cents;
  return diff > 0 ? diff : 0;
}

/** 全部套餐里最大的年付折扣比例(0..1),用于周期切换器上的「省 N%」徽标。 */
export function maxYearlySavingsPct(plans: MembershipPlanData[]): number {
  let best = 0;
  for (const p of plans) {
    if (p.tier === 'free' || !planYearlyEnabled(p) || p.price_cents <= 0) continue;
    const pct = 1 - p.year_price_cents / (p.price_cents * 12);
    if (pct > best) best = pct;
  }
  return best;
}

function planFeatures(plan: MembershipPlanData, cycle: BillingCycle): string[] {
  if (plan.tier === 'free') {
    return ['全部基础功能', '标准 AI 模型', '7 天周期基础额度 · 到期自动恢复'];
  }
  // 倍率口径:Pro 相对 Free,Max 相对 Pro(后端 WindowCeiling 同步)。
  const quota =
    plan.tier === 'max'
      ? `${plan.multiplier}× 于 Pro 的 7 天周期额度`
      : `${plan.multiplier}× 于 Free 的 7 天周期额度`;
  const yearly = cycle === 'yearly' && planYearlyEnabled(plan);
  const credits = yearly
    ? `全年赠送 ${plan.year_grant_credits} 经费(按月发放)`
    : `每月赠送 ${plan.grant_credits} 经费`;
  if (plan.tier === 'pro') {
    return [
      quota,
      credits,
      ...(yearly ? ['锁定一年价格 · 免续费打扰'] : []),
      '优先使用更强 AI 模型',
      '新功能优先体验',
      '经费可随时重置额度',
    ];
  }
  // max —— 体现比 Pro 更高的优先级 / 模型 / 新功能
  return [
    quota,
    credits,
    ...(yearly ? ['锁定一年价格 · 免续费打扰'] : []),
    '顶级优先级 · 最强 AI 模型',
    '新功能抢先开放 · 专属能力',
    '优先算力队列 · 专属客服',
  ];
}

export interface MembershipPlanCardProps {
  plan: MembershipPlanData;
  /** 计费周期(默认 monthly);yearly 时价格区/经费区切年度口径。 */
  cycle?: BillingCycle;
  /** 显示「最受欢迎」徽章。 */
  popularBadge?: boolean;
  /** 红色强调边框(价格页=最受欢迎档;弹窗=当前选中档)。 */
  highlighted?: boolean;
  /** 整卡可点(弹窗选择模式);不传=不可点。 */
  onSelect?: () => void;
  /** 底部 CTA(价格页按钮)/ 选择态(弹窗)slot。 */
  footer: ReactNode;
}

export function MembershipPlanCard({ plan, cycle = 'monthly', popularBadge, highlighted, onSelect, footer }: MembershipPlanCardProps) {
  const meta = PLAN_META[plan.tier] ?? { name: plan.tier, sub: '' };
  const isFree = plan.tier === 'free';
  // 该档未开放年付时,即使全局切到年付也回落月度展示(报价/下单侧同样回落)。
  const effCycle: BillingCycle = cycle === 'yearly' && planYearlyEnabled(plan) ? 'yearly' : 'monthly';
  const yearly = effCycle === 'yearly';
  const features = planFeatures(plan, effCycle);

  const priceCents = yearly ? plan.year_price_cents : plan.price_cents;
  const originalCents = yearly ? plan.year_original_cents : plan.original_cents;
  const savings = yearly ? planYearlySavings(plan) : 0;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-4 rounded-12 border bg-surface-card p-6 transition-colors',
        highlighted ? 'border-2 border-brand-red' : 'border-border',
        onSelect && 'cursor-pointer hover:border-brand-red/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-16 font-medium text-foreground">{meta.name}</p>
        {popularBadge && (
          <span className="shrink-0 rounded-pill bg-brand-red px-2 py-0.5 text-12 font-medium text-background">最受欢迎</span>
        )}
      </div>
      <p className="text-12 text-faint">{meta.sub}</p>

      {/* 价格 —— 有划线原价时挂「限时优惠」红徽章;年付追加「折合月价 + 比月付省 ¥N」 */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-end gap-2">
          <span className="font-display text-28 font-bold leading-none text-foreground">
            {isFree ? '免费' : `¥${Math.round(priceCents / 100)}`}
          </span>
          {!isFree && originalCents > priceCents && (
            <span className="text-12 text-faint line-through">¥{Math.round(originalCents / 100)}</span>
          )}
          {!isFree && <span className="text-12 text-faint">{yearly ? '/ 年' : '/ 月'}</span>}
          {!isFree && !yearly && originalCents > priceCents && (
            <span className="rounded-pill bg-brand-red px-1.5 py-0.5 text-12 font-medium text-background">限时优惠</span>
          )}
          {!isFree && yearly && savings > 0 && (
            <span className="rounded-pill bg-brand-red px-1.5 py-0.5 text-12 font-medium text-background">
              比月付省 ¥{Math.round(savings / 100)}
            </span>
          )}
        </div>
        {!isFree && yearly && (
          <p className="text-12 text-faint">
            {/* 折合月价向下取到 0.1 元:营销口径不虚高(避免 ¥33.3×12 > 实付) */}
            折合 ¥{(Math.floor((priceCents / 100 / 12) * 10) / 10).toFixed(1)}/月 · 一次付费畅享一整年
          </p>
        )}
      </div>

      {/* 赠送经费 / 周期重置 box */}
      <div className={cn('flex items-center gap-3 rounded-8 p-3', highlighted ? 'bg-danger-soft' : 'bg-surface-1')}>
        <RefreshCw className={cn('size-5 shrink-0', highlighted ? 'text-brand-red' : 'text-brand-amber')} />
        {isFree ? (
          <div>
            <p className="text-14 font-medium text-foreground">周期重置</p>
            <p className="text-12 text-faint">基础 AI 额度 · 7 天周期到期自动恢复</p>
          </div>
        ) : yearly ? (
          <div>
            <p className="text-14 font-medium text-foreground">
              {plan.year_grant_credits} <span className="text-12 font-normal text-faint">经费 / 年</span>
            </p>
            <p className="text-12 text-faint">按月分 12 批发放 · 每批当月有效</p>
          </div>
        ) : (
          <div>
            <p className="text-14 font-medium text-foreground">
              {plan.grant_credits} <span className="text-12 font-normal text-faint">经费</span>
            </p>
            <p className="text-12 text-faint">每月赠送 · 整月有效</p>
          </div>
        )}
      </div>

      {/* 特性 */}
      <ul className="flex flex-1 flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-14 leading-paragraph text-subtle">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {footer}
    </div>
  );
}

/** 月付 / 年付 分段切换器(价格页 + 订阅弹窗共用)。年付项带「省 N%」徽标。 */
export function BillingCycleToggle({
  value,
  onChange,
  savingsPct,
  disabled,
  disabledHint,
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  /** 年付最大折扣比例(0..1),>0 时年付项显示「省 N%」。 */
  savingsPct?: number;
  /** 禁用切换(如升级动作锁定当前周期),并可附提示。 */
  disabled?: boolean;
  disabledHint?: string;
}) {
  const pct = Math.round((savingsPct ?? 0) * 100);
  return (
    <div
      className={cn('inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 p-1', disabled && 'opacity-60')}
      title={disabled ? disabledHint : undefined}
    >
      {(
        [
          { id: 'monthly', label: '月付' },
          { id: 'yearly', label: '年付' },
        ] as const
      ).map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.id)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-pill px-4 text-14 font-medium transition-colors',
              active ? 'bg-surface-card text-foreground shadow-raised' : 'text-muted-foreground',
              !disabled && !active && 'hover:text-foreground',
              disabled && 'cursor-not-allowed',
            )}
          >
            {opt.label}
            {opt.id === 'yearly' && pct > 0 && (
              <span
                className={cn(
                  'rounded-pill px-1.5 py-0.5 text-12 font-medium',
                  active ? 'bg-brand-red text-background' : 'bg-brand-red/10 text-brand-red',
                )}
              >
                省 {pct}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

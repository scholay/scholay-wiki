// 会员套餐卡(presentational)—— 价格页「订阅套餐」三卡 + 升级弹窗的套餐选择共用同一张卡,
// 保证两处视觉完全一致。卡身(名称/价格/赠送经费/特性)固定,底部 footer slot 由调用方决定:
// 价格页放 CTA 按钮;弹窗放「选择此套餐 / 已选择」态。
// 术语统一:额度每日「重置」(不用「刷新」);Free 不展示具体 token 数;等级一律叫 Free / Pro / Max。
import { type ReactNode } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** 后端 /billing/plans 的单档结构(price/multiplier/赠送经费)。 */
export interface MembershipPlanData {
  tier: 'free' | 'pro' | 'max';
  price_cents: number;
  original_cents: number;
  multiplier: number;
  grant_credits: number;
}

/** 各档展示文案(价格页 + 弹窗共用,保持一致)。 */
export const PLAN_META: Record<'free' | 'pro' | 'max', { name: string; sub: string }> = {
  // 等级名全站统一 Free / Pro / Max;sub 是各档定位副标题。
  free: { name: 'Free', sub: '面向全体学者永久免费' },
  pro: { name: 'Pro', sub: '轻量检索与日常写作' },
  max: { name: 'Max', sub: '高频科研的主力之选' },
};

function planFeatures(plan: MembershipPlanData): string[] {
  if (plan.tier === 'free') {
    return ['全部基础功能', '标准 AI 模型', '每日基础额度 · 00:00 自动重置'];
  }
  // 倍率口径:Pro 相对 Free,Max 相对 Pro(后端 DailyCeiling 同步)。
  const quota =
    plan.tier === 'max'
      ? `${plan.multiplier}× 于 Pro 的每日额度`
      : `${plan.multiplier}× 于 Free 的每日额度`;
  if (plan.tier === 'pro') {
    return [
      quota,
      `每月赠送 ${plan.grant_credits} 经费`,
      '优先使用更强 AI 模型',
      '新功能优先体验',
      '经费可随时重置额度',
    ];
  }
  // max —— 体现比 Pro 更高的优先级 / 模型 / 新功能
  return [
    quota,
    `每月赠送 ${plan.grant_credits} 经费`,
    '顶级优先级 · 最强 AI 模型',
    '新功能抢先开放 · 专属能力',
    '优先算力队列 · 专属客服',
  ];
}

export interface MembershipPlanCardProps {
  plan: MembershipPlanData;
  /** 显示「最受欢迎」徽章。 */
  popularBadge?: boolean;
  /** 红色强调边框(价格页=最受欢迎档;弹窗=当前选中档)。 */
  highlighted?: boolean;
  /** 整卡可点(弹窗选择模式);不传=不可点。 */
  onSelect?: () => void;
  /** 底部 CTA(价格页按钮)/ 选择态(弹窗)slot。 */
  footer: ReactNode;
}

export function MembershipPlanCard({ plan, popularBadge, highlighted, onSelect, footer }: MembershipPlanCardProps) {
  const meta = PLAN_META[plan.tier] ?? { name: plan.tier, sub: '' };
  const isFree = plan.tier === 'free';
  const features = planFeatures(plan);

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-4 rounded-md border bg-background p-6 transition-colors',
        highlighted ? 'border-2 border-brand-red' : 'border-border',
        onSelect && 'cursor-pointer hover:border-brand-red/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-bold text-foreground">{meta.name}</p>
        {popularBadge && (
          <span className="shrink-0 rounded-pill bg-brand-red px-2 py-0.5 text-2xs font-bold text-background">最受欢迎</span>
        )}
      </div>
      <p className="text-xs text-faint">{meta.sub}</p>

      {/* 价格 —— 有划线原价时挂「限时优惠」红徽章 */}
      <div className="flex flex-wrap items-end gap-2">
        <span className="font-display text-3xl font-bold leading-none text-foreground">
          {isFree ? '免费' : `¥${Math.round(plan.price_cents / 100)}`}
        </span>
        {!isFree && plan.original_cents > plan.price_cents && (
          <span className="text-sm text-faint line-through">¥{Math.round(plan.original_cents / 100)}</span>
        )}
        {!isFree && <span className="text-xs text-faint">/ 月</span>}
        {!isFree && plan.original_cents > plan.price_cents && (
          <span className="rounded-pill bg-brand-red px-1.5 py-0.5 text-2xs font-bold text-background">限时优惠</span>
        )}
      </div>

      {/* 赠送经费 / 每日重置 box */}
      <div className={cn('flex items-center gap-3 rounded-md p-3', highlighted ? 'bg-danger-soft' : 'bg-surface-1')}>
        <RefreshCw className={cn('size-5 shrink-0', highlighted ? 'text-brand-red' : 'text-brand-amber')} />
        {isFree ? (
          <div>
            <p className="text-sm font-bold text-foreground">每日重置</p>
            <p className="text-2xs text-faint">基础 AI 额度 · 每日 00:00 重置</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-foreground">
              {plan.grant_credits} <span className="text-2xs font-normal text-faint">经费</span>
            </p>
            <p className="text-2xs text-faint">每月赠送 · 整月有效</p>
          </div>
        )}
      </div>

      {/* 特性 */}
      <ul className="flex flex-1 flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm leading-relaxed text-subtle">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {footer}
    </div>
  );
}

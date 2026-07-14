import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RouteSEO } from '@/shared/components/RouteSEO';
import {
  SubscribeDialog,
  subscribePayMethods,
  MembershipPlanCard,
  PLAN_META,
} from '@/shared/components';
import { getAuthToken } from '@/shared/lib/auth-token';
import { cn } from '@/shared/lib/utils';
import { LandingLayout } from '../layout/LandingLayout';
import { usePublicPlans, useLandingSubscribe, useCurrentTier, quoteSubscription } from '../api/plans';

const RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

/** 价格页某档卡片 CTA(随当前会员档变化:立即订阅 / 续期 / 升级 / 已拥有)。 */
function ctaFor(cardTier: string, currentTier?: string): { label: string; disabled: boolean } {
  if (!currentTier || RANK[currentTier] === 0) return { label: '立即订阅', disabled: false };
  const tr = RANK[cardTier] ?? 0;
  const cr = RANK[currentTier] ?? 0;
  if (tr < cr) return { label: '已拥有', disabled: true };
  if (tr === cr) return { label: '续期', disabled: false };
  return { label: '升级', disabled: false };
}

/**
 * 学者订阅计划 · Plans —— /pricing。对齐设计稿 scholay-money.pen(UUq6B)。
 * 三档 Free/Pro/Max 用 shared MembershipPlanCard 渲染(与升级弹窗同款卡片)。
 * 价格/倍率/赠送经费全部从后端 /billing/plans 取;最受欢迎档由后台配置。
 * 点「立即订阅」→ 未登录跳登录弹窗;已登录开「选套餐 + 选支付」弹窗。
 */
export function PricingPage() {
  const { data } = usePublicPlans();
  const { subscribe } = useLandingSubscribe();
  const currentTier = useCurrentTier();
  const navigate = useNavigate();
  const [sub, setSub] = useState<{ open: boolean; tier?: 'pro' | 'max' }>({ open: false });

  const plans = data?.plans ?? [];
  const resetCost = data?.reset_cost_credits ?? 0;

  const onSubscribe = (tier: 'pro' | 'max') => {
    if (!getAuthToken()) {
      navigate('/?login=required');
      return;
    }
    setSub({ open: true, tier });
  };

  const methods = subscribePayMethods(data?.payment_methods, data?.test_payment ?? false);

  return (
    <LandingLayout>
      <RouteSEO
        title="学者订阅计划 - Scholay"
        description="Scholay 学者订阅:统一 7 天周期 AI 额度 + 科研经费。Pro / Max 获更高额度并赠送经费,经费可随时重置额度。"
        keywords="Scholay 会员,学术 AI 订阅,科研经费,Scholay 价格"
      />
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="rounded-lg border border-border bg-surface-1 p-6 md:p-10">
          <p className="text-xs font-bold text-brand-red">SCHOLAY 学者订阅</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">学者订阅计划</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            会员订阅提供更高的 AI 额度(按 7 天周期计算,首次使用开始计时、到期自动重置满额)与每月赠送的科研经费。额度耗尽后可消耗经费
            {resetCost ? `(每次 ${resetCost} 经费)` : ''}立即重置。
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const isFree = p.tier === 'free';
              const popular = data?.popular_plan === p.tier;
              const cta = ctaFor(p.tier, currentTier);
              return (
                <MembershipPlanCard
                  key={p.tier}
                  plan={p}
                  popularBadge={popular}
                  highlighted={popular}
                  footer={
                    isFree ? (
                      <Link
                        to="/"
                        className="inline-flex h-10 items-center justify-center rounded-md border border-border-button text-sm font-bold text-faint transition-colors hover:bg-surface-2"
                      >
                        FREE
                      </Link>
                    ) : (
                      <button
                        onClick={() => !cta.disabled && onSubscribe(p.tier as 'pro' | 'max')}
                        disabled={cta.disabled}
                        className={cn(
                          'inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold transition-colors',
                          cta.disabled
                            ? 'cursor-not-allowed border border-border-button text-faint'
                            : popular
                              ? 'bg-brand-red text-background hover:bg-brand-red/90'
                              : 'border border-border-button text-foreground hover:bg-surface-2',
                        )}
                      >
                        {cta.label}
                      </button>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      </section>

      <SubscribeDialog
        open={sub.open}
        onOpenChange={(o) => setSub((s) => ({ ...s, open: o }))}
        plans={plans}
        popularTier={data?.popular_plan}
        currentTier={currentTier}
        quote={quoteSubscription}
        methods={methods}
        initialTier={sub.tier}
        onPay={(tier, method) => subscribe(tier, method, PLAN_META[tier]?.name ?? tier)}
      />
    </LandingLayout>
  );
}

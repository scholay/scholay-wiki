// 会员「升级」/「续费」两条流程各自的**合法选项**推导 —— 全站单一真源。
//
// 背景(2026-08-12):过去只有一个混合弹窗,把「升级」和「续费」揉在同一组套餐卡里,
// 用户在 pro 月付状态下点 Max 会看到年付价、实际却下成补差单。现在按产品拍板拆成
// 两条独立流程,每条只给该场景真正买得到的东西:
//
//   场景            升级(可选)                        续费(可选)
//   ① free          Pro月 / Pro年 / Max月 / Max年      —(没有可续的东西)
//   ② pro 月        Max月(原地补差) / Max年(整年)      Pro月 / Pro年
//   ③ pro 年        Max(原地补差,年基准)               Pro年   ← 年费只能按年续
//   ④ max 月        —(已是顶档)                       Max月 / Max年
//   ⑤ max 年        —                                  Max年   ← 同上
//
// 🔴 与后端 computeSubscription 的对应(backend/internal/vip/order.go):
//   · 升级 Max月 / pro年升级 → action=upgrade,**原地补差、到期日不变**
//   · 升级 Max年(仅月付会员)→ action=switch,**整年全价、叠加到原到期日**
//   · 续费                   → action=renew,整周期原价、叠加
//   · 年费会员按月续          → ErrYearlyRenewOnly(后端硬拒),所以这里不给该选项
//   金额一律以 quote 报价为准,本模块只决定「给哪些选项」,不算钱。
import type { BillingCycle } from '@/shared/components/membership-plan-card';

export type Tier = 'free' | 'pro' | 'max';
export type PaidTier = 'pro' | 'max';

const RANK: Record<Tier, number> = { free: 0, pro: 1, max: 2 };

/** 一个可购买选项:目标档 + 计费周期。 */
export interface MembershipOption {
  tier: PaidTier;
  cycle: BillingCycle;
}

/** 该档年付是否开放(后端未配置年价时 year_price_cents <= 0)。 */
export interface TierPricing {
  tier: Tier;
  price_cents: number;
  year_price_cents: number;
}

function yearlyOpen(plans: TierPricing[], tier: PaidTier): boolean {
  const p = plans.find((x) => x.tier === tier);
  return !!p && p.year_price_cents > 0;
}

function monthlyOpen(plans: TierPricing[], tier: PaidTier): boolean {
  const p = plans.find((x) => x.tier === tier);
  return !!p && p.price_cents > 0;
}

/**
 * 「升级」流程的可选项。
 *
 * · free 用户没有「升级」概念 —— 他走的是首次订阅,选项 = 全部付费档 × 全部开放周期。
 * · 付费会员只能往更高档走(后端 ErrNoDowngrade),所以只出比当前档高的档。
 * · **年费会员只出年付**:他升档走的是原地补差(到期日不变),月付选项在后端会被当成
 *   同一个 upgrade 处理,给出来只会让用户以为自己买了「Max 月」。
 * · 月付会员两种都出:月付 = 原地补差(便宜、到期日不变);年付 = 买整年(贵、延一年)。
 */
export function upgradeOptions(
  current: Tier,
  currentCycle: BillingCycle | undefined,
  plans: TierPricing[],
): MembershipOption[] {
  const higher = (['pro', 'max'] as PaidTier[]).filter((t) => RANK[t] > RANK[current]);
  const out: MembershipOption[] = [];
  for (const tier of higher) {
    // 年费会员:只给年付(见上)。free 与月付会员:月付/年付都给。
    const yearlyMember = current !== 'free' && currentCycle === 'yearly';
    if (!yearlyMember && monthlyOpen(plans, tier)) out.push({ tier, cycle: 'monthly' });
    if (yearlyOpen(plans, tier)) out.push({ tier, cycle: 'yearly' });
  }
  return out;
}

/**
 * 「续费」流程的可选项 —— 只续当前档,不换档(换档是升级流程的事)。
 *
 * · free 没有可续的东西,返回空。
 * · 年费会员只能按年续(后端 ErrYearlyRenewOnly):按月续会把 vip_cycle 冲成月度,
 *   年费身份与后续价目一起错档。
 * · 月付会员可以续月,也可以续年(= 转年付)。
 */
export function renewOptions(
  current: Tier,
  currentCycle: BillingCycle | undefined,
  plans: TierPricing[],
): MembershipOption[] {
  if (current === 'free') return [];
  const tier = current as PaidTier;
  const out: MembershipOption[] = [];
  if (currentCycle !== 'yearly' && monthlyOpen(plans, tier)) out.push({ tier, cycle: 'monthly' });
  if (yearlyOpen(plans, tier)) out.push({ tier, cycle: 'yearly' });
  return out;
}

/** 设置页主 CTA 的角色:有更高档可升 → 升级为主、续费为次;已顶档 → 续费即主。 */
export function primaryAction(
  current: Tier,
  currentCycle: BillingCycle | undefined,
  plans: TierPricing[],
): 'subscribe' | 'upgrade' | 'renew' {
  if (current === 'free') return 'subscribe';
  return upgradeOptions(current, currentCycle, plans).length > 0 ? 'upgrade' : 'renew';
}

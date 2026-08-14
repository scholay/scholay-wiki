// 购买弹窗的「谁能看到哪张卡、CTA 说什么」—— 这是产品给的验收标准,逐条钉死。
//
// 验收标准(2026-08-02 用户口述):
//   · 非用户  → 看到 Pro、Max,都能买
//   · Pro 会员 → 看到 Pro(续期 / 转年付)、Max(套餐升级)
//   · Max 会员 → 看到 Pro(禁用,不能降级)、Max(续期 / 转年付)
//   · Free/Pro/Max 三档**对比**只属于价格页,不进购买弹窗
import { describe, expect, it } from 'vitest';
import { cardActionFor, actionLabel } from './subscribe-dialog';
import type { MembershipPlanData } from './membership-plan-card';

const PLANS: MembershipPlanData[] = [
  { tier: 'free', price_cents: 0, original_cents: 0, multiplier: 1, year_price_cents: 0, year_original_cents: 0 },
  { tier: 'pro', price_cents: 5900, original_cents: 19900, multiplier: 20, year_price_cents: 59000, year_original_cents: 238800 },
  { tier: 'max', price_cents: 26900, original_cents: 99900, multiplier: 5, year_price_cents: 269000, year_original_cents: 1198800 },
];

/** 弹窗只渲染付费档 —— 与 subscribe-dialog 里 paidPlans 的口径必须一致。 */
const dialogCards = (plans: MembershipPlanData[]) => plans.filter((p) => p.tier !== 'free').map((p) => p.tier);

describe('购买弹窗只卖付费档', () => {
  it('不渲染 Free 卡 —— 三档对比属于价格页', () => {
    expect(dialogCards(PLANS)).toEqual(['pro', 'max']);
  });
});

describe('非用户(未订阅 / 未登录)', () => {
  it('Pro 与 Max 都是可购的「立即订阅」', () => {
    for (const cur of [undefined, 'free' as const]) {
      expect(cardActionFor('pro', cur)).toBe('new');
      expect(cardActionFor('max', cur)).toBe('new');
      expect(actionLabel('new', 'yearly', undefined)).toBe('立即订阅');
    }
  });
});

describe('Pro 会员', () => {
  it('Pro 卡 = 续期;Max 卡 = 套餐升级', () => {
    expect(cardActionFor('pro', 'pro')).toBe('renew');
    expect(cardActionFor('max', 'pro')).toBe('upgrade');
    expect(actionLabel('upgrade', 'yearly', 'monthly')).toBe('套餐升级');
  });

  it('月付会员选年付时,续期要说成「转为年付」', () => {
    // 后端 renew 分支会按本单 cycle 推到期日**并改写 vip_cycle**,这一单确实把他转成年费会员,
    // CTA 就得如实说 —— 笼统写「续期」会让用户以为只是延期、周期不变。
    expect(actionLabel('renew', 'yearly', 'monthly')).toBe('转为年付');
    expect(actionLabel('renew', 'monthly', 'monthly')).toBe('续期');
  });

  it('已经是年付的会员选年付 → 仍是「续期」,不是「转为年付」', () => {
    expect(actionLabel('renew', 'yearly', 'yearly')).toBe('续期');
  });
});

describe('Max 会员', () => {
  it('Pro 卡不可购,文案是「不可降级」而不是「已拥有」', () => {
    // 🔴 Max 用户并不拥有 Pro —— 他拥有的是 Max。写「已拥有」会让人以为自己买过 Pro。
    expect(cardActionFor('pro', 'max')).toBe('owned');
    expect(actionLabel('owned', 'yearly', 'yearly')).toBe('不可降级');
  });

  it('Max 卡仍可续期 / 转年付', () => {
    expect(cardActionFor('max', 'max')).toBe('renew');
    expect(actionLabel('renew', 'yearly', 'monthly')).toBe('转为年付');
  });
});

describe('可选性(整卡能不能点)', () => {
  const selectable = (card: string, cur?: 'free' | 'pro' | 'max') => {
    const act = cardActionFor(card, cur);
    return act !== 'free' && act !== 'owned';
  };
  it('只有 owned 与 free 不可点', () => {
    expect(selectable('pro', undefined)).toBe(true);
    expect(selectable('pro', 'pro')).toBe(true);
    expect(selectable('max', 'pro')).toBe(true);
    expect(selectable('max', 'max')).toBe(true);
    expect(selectable('pro', 'max')).toBe(false); // 唯一禁用格
  });
});

// 会员「升级 / 续费」两条流程的**选项矩阵**契约(2026-08-12 产品拍板的 5 个场景)。
//
// 这一族不是样式问题:多给一个选项 = 让用户买到一个后端会拒(年费按月续)或与展示价格
// 不符(年费会员选 Max 月)的东西;少给一个 = 直接砍掉一条付费路径。
// 与后端 backend/internal/vip/subscription_matrix_test.go 是同一份矩阵的两侧。
import { describe, expect, it } from 'vitest';
import {
  primaryAction,
  renewOptions,
  upgradeOptions,
  type TierPricing,
} from '@/shared/lib/membership-options';

// 现网价目(与 /billing/plans 实测一致)
const PLANS: TierPricing[] = [
  { tier: 'free', price_cents: 0, year_price_cents: 0 },
  { tier: 'pro', price_cents: 5900, year_price_cents: 59000 },
  { tier: 'max', price_cents: 26900, year_price_cents: 269000 },
];

const key = (o: { tier: string; cycle: string }) => `${o.tier}/${o.cycle}`;

describe('升级选项', () => {
  it('① free:四种组合全给(首次订阅)', () => {
    expect(upgradeOptions('free', undefined, PLANS).map(key)).toEqual([
      'pro/monthly',
      'pro/yearly',
      'max/monthly',
      'max/yearly',
    ]);
  });

  it('② pro 月:Max 月(原地补差)与 Max 年(整年)都给,不给 Pro', () => {
    expect(upgradeOptions('pro', 'monthly', PLANS).map(key)).toEqual([
      'max/monthly',
      'max/yearly',
    ]);
  });

  it('③ pro 年:只给 Max 年 —— 年费会员升档是原地补差,给月付选项会让人以为买了 Max 月', () => {
    expect(upgradeOptions('pro', 'yearly', PLANS).map(key)).toEqual(['max/yearly']);
  });

  it('④⑤ max:已是顶档,升级选项为空(不能对顶档用户显示升级)', () => {
    expect(upgradeOptions('max', 'monthly', PLANS)).toEqual([]);
    expect(upgradeOptions('max', 'yearly', PLANS)).toEqual([]);
  });

  it('目标档年价未配置时不给年付选项', () => {
    const noYear: TierPricing[] = [
      { tier: 'free', price_cents: 0, year_price_cents: 0 },
      { tier: 'pro', price_cents: 5900, year_price_cents: 59000 },
      { tier: 'max', price_cents: 26900, year_price_cents: 0 },
    ];
    expect(upgradeOptions('pro', 'monthly', noYear).map(key)).toEqual(['max/monthly']);
  });
});

describe('续费选项', () => {
  it('① free:没有可续的东西', () => {
    expect(renewOptions('free', undefined, PLANS)).toEqual([]);
  });

  it('② pro 月:可续 Pro 月 / Pro 年(年 = 转年付)', () => {
    expect(renewOptions('pro', 'monthly', PLANS).map(key)).toEqual(['pro/monthly', 'pro/yearly']);
  });

  it('③ pro 年:只能按年续 —— 按月续会把年费身份冲成月度(后端 ErrYearlyRenewOnly)', () => {
    expect(renewOptions('pro', 'yearly', PLANS).map(key)).toEqual(['pro/yearly']);
  });

  it('④ max 月:可续 Max 月 / Max 年', () => {
    expect(renewOptions('max', 'monthly', PLANS).map(key)).toEqual(['max/monthly', 'max/yearly']);
  });

  it('⑤ max 年:只能按年续', () => {
    expect(renewOptions('max', 'yearly', PLANS).map(key)).toEqual(['max/yearly']);
  });

  it('续费永远不换档(只出当前档)', () => {
    for (const cycle of ['monthly', 'yearly'] as const) {
      expect(renewOptions('pro', cycle, PLANS).every((o) => o.tier === 'pro')).toBe(true);
      expect(renewOptions('max', cycle, PLANS).every((o) => o.tier === 'max')).toBe(true);
    }
  });
});

describe('设置页主 CTA 角色', () => {
  it('free → 订阅;pro → 升级为主;max → 续费为主(顶档没有升级可言)', () => {
    expect(primaryAction('free', undefined, PLANS)).toBe('subscribe');
    expect(primaryAction('pro', 'monthly', PLANS)).toBe('upgrade');
    expect(primaryAction('pro', 'yearly', PLANS)).toBe('upgrade');
    expect(primaryAction('max', 'monthly', PLANS)).toBe('renew');
    expect(primaryAction('max', 'yearly', PLANS)).toBe('renew');
  });
});

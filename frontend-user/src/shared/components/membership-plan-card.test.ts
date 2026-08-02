// 会员定价派生函数的机械不变量。
//
// 为什么值得单测:这几个函数的输出是**对外明示的价格**,算错不是渲染瑕疵而是价格欺诈或收入泄漏。
// 而在 2026-08-02 改版之前,这条链路**零测试覆盖** —— 折合月价的实现还被逐字复制了两份
// (PC 卡片 / 移动弹层),两侧口径漂移不会有任何东西报警。
import { describe, expect, it } from 'vitest';
import {
  monthlyEquivalentCents,
  resolveDefaultCycle,
  planYearlySavings,
  maxYearlySavingsPct,
  yuanText,
  type MembershipPlanData,
} from './membership-plan-card';

const plan = (over: Partial<MembershipPlanData> = {}): MembershipPlanData => ({
  tier: 'pro',
  price_cents: 5900,
  original_cents: 19900,
  multiplier: 20,
  year_price_cents: 59000,
  year_original_cents: 238800,
  ...over,
});

describe('monthlyEquivalentCents —— 折合月价', () => {
  // 🔴 这是本文件最重要的一条:折合月价会成为卡片的**主数字**,它 ×12 绝不能超过用户实付的年价,
  // 否则就是对外虚报价格。floor 保证这一点,round 会破坏它(¥590 → round 得 49.17,×12 = 590.04 > 590)。
  it('折合月价 × 12 恒 ≤ 年付实付(绝不虚高)', () => {
    for (let yearCents = 1; yearCents <= 500_000; yearCents += 7) {
      expect(monthlyEquivalentCents(yearCents) * 12).toBeLessThanOrEqual(yearCents);
    }
  });

  it('自我低估有界:整元取整最多少算不到 1 元/月', () => {
    // 取整到「元」后,每月最多少算 99 分 → 全年最多差 12×99 = 1188 分。
    // 这是**刻意**的:主价格数字带分位(¥49.16)在展示字号下视觉极碎,9 家大厂无一家这么做。
    for (let yearCents = 1200; yearCents <= 500_000; yearCents += 13) {
      const gap = yearCents - monthlyEquivalentCents(yearCents) * 12;
      expect(gap).toBeGreaterThanOrEqual(0); // 永不虚高
      expect(gap).toBeLessThan(12 * 100);
    }
  });

  it('现网价目的具体落点(整元)', () => {
    expect(monthlyEquivalentCents(59000)).toBe(4900); // Pro 年付 ¥590 → ¥49/月
    expect(monthlyEquivalentCents(269000)).toBe(22400); // Max 年付 ¥2690 → ¥224/月
    expect(yuanText(monthlyEquivalentCents(59000))).toBe('49');
    expect(yuanText(monthlyEquivalentCents(269000))).toBe('224');
  });

  it('年价过小时回落到分位,不显示「¥0/月」', () => {
    // 整元取整会把 ¥11/年 压成 0 —— 那会渲染出「¥0/月」这种明显错误的价格。
    expect(monthlyEquivalentCents(1100)).toBe(91); // ¥11/年 → ¥0.91/月
    expect(monthlyEquivalentCents(1100) * 12).toBeLessThanOrEqual(1100);
  });

  it('非法/未开放年付返回 0,不产生 NaN 或负数', () => {
    expect(monthlyEquivalentCents(0)).toBe(0);
    expect(monthlyEquivalentCents(-1)).toBe(0);
  });
});

describe('resolveDefaultCycle —— 年付优先', () => {
  it('任一付费档开放年付 → 默认年付', () => {
    expect(resolveDefaultCycle([plan({ tier: 'free', year_price_cents: 0 }), plan()])).toBe('yearly');
  });

  it('所有付费档都关了年付 → 回落月付', () => {
    expect(resolveDefaultCycle([plan({ year_price_cents: 0 }), plan({ tier: 'max', year_price_cents: 0 })])).toBe(
      'monthly',
    );
  });

  it('plans 还没到位(空数组)→ 月付,不是年付', () => {
    // 这条钉住「不能把 'yearly' 写进 useState 初值」那个决定:数据未到时必须给保守值,
    // 否则会先渲染一个可能根本不存在的周期,再被各处回落逻辑拨回去(用户看见价格跳变)。
    expect(resolveDefaultCycle([])).toBe('monthly');
  });

  it('只有 free 档配了年价 —— 不算开放年付', () => {
    expect(resolveDefaultCycle([plan({ tier: 'free', year_price_cents: 12000 })])).toBe('monthly');
  });
});

describe('年付折扣', () => {
  it('planYearlySavings = 月价×12 − 年价,不省则 0', () => {
    expect(planYearlySavings(plan())).toBe(5900 * 12 - 59000); // ¥118
    expect(planYearlySavings(plan({ year_price_cents: 5900 * 12 }))).toBe(0);
    expect(planYearlySavings(plan({ year_price_cents: 0 }))).toBe(0); // 未开放
  });

  it('maxYearlySavingsPct 取全部付费档的最大折扣,free 不参与', () => {
    const pct = maxYearlySavingsPct([
      plan({ tier: 'free', price_cents: 0, year_price_cents: 0 }),
      plan({ price_cents: 5900, year_price_cents: 59000 }), // 省 1/6 ≈ 16.7%
      plan({ tier: 'max', price_cents: 26900, year_price_cents: 269000 }), // 同为 1/6
    ]);
    expect(Math.round(pct * 100)).toBe(17);
  });

  it('切换器上的「省 N%」与卡片副行的年/月对照必须自洽', () => {
    // 若两处口径分叉,用户会看到「省 17%」但自己一算只省了别的数 —— 这里钉住同源。
    const p = plan();
    const pct = maxYearlySavingsPct([p]);
    const monthlyTotal = p.price_cents * 12;
    expect(Math.round((1 - p.year_price_cents / monthlyTotal) * 100)).toBe(Math.round(pct * 100));
    expect(planYearlySavings(p)).toBe(monthlyTotal - p.year_price_cents);
  });
});

// @vitest-environment jsdom

/**
 * 账户资产卡「Pro / Max 额度」倍数阶梯的契约。
 *
 * 这里锁两件容易算错、且错了会直接对用户说错话的事:
 *
 * 1. **Max 的倍率锚点是 Pro,不是 Free**(后端 billing_model.go:147:
 *    max 上限 = free × pro_multiplier × max_multiplier)。
 *    plans 里 max.multiplier 是「相对 Pro」,要展示「相对 Free」必须连乘 ——
 *    漏乘会把 4× 说成 2×,是对付费用户的虚假宣传。
 * 2. **倍率 <=0 = 该档不限额**(后端 fail-open,config.go:36 的校验刻意不拦)。
 *    不处理这一支会渲染出「0× 当前额度」。
 *
 * 另外锁住「plans 未到位时不显示倍数」—— 组件兜底值(5/5)与线上配置(实测 2/2)
 * 不一致,一个醒目的错数字比不显示更糟。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountAssetsCard } from '@/features/settings/components/account-assets-card';
import type { Overview, Tier } from '@/features/settings/api/membership';

vi.mock('@/shared/lib/device', () => ({ isPhoneDevice: () => false }));
// 卡片内的支付/升级弹层与本契约无关,替身掉以免拖进整条支付链。
vi.mock('@/shared/components', () => ({
  SubscribeDialog: () => null,
  WechatPayDialog: () => null,
  subscribePayMethods: () => [],
}));
vi.mock('../src/features/settings/components/billing-panels', () => ({
  useSubscribeFlow: () => ({
    subscribe: async () => true,
    wechatOrder: null,
    closeWechat: () => {},
    onWechatPaid: () => {},
  }),
}));

const plansRef: { current: { tier: Tier; multiplier: number }[] | null } = { current: null };
vi.mock('@/features/settings/api/membership', async (orig) => {
  const actual = await orig<typeof import('@/features/settings/api/membership')>();
  return {
    ...actual,
    usePlans: () => ({
      data: plansRef.current
        ? { plans: plansRef.current.map((p) => ({ ...p, price_cents: 100 })), recharge_rate: 100 }
        : undefined,
    }),
    useResetQuota: () => ({ mutate: () => {}, isPending: false }),
    useSetCreditAutopay: () => ({ mutate: () => {}, isPending: false }),
  };
});

afterEach(() => {
  cleanup();
  plansRef.current = null;
});

function overview(tier: Tier): Overview {
  return {
    tier,
    cycle: 'monthly',
    token: {
      used: 0,
      ceiling: 0,
      percent: 0,
      unlimited: false,
      window_days: 7,
      window_started_at: null,
      window_reset_at: null,
    },
    credit: { perm: 0, total: 0, perm_micro: 0, points: 0, credit_autopay: false },
    reset_passes: 0,
  } as unknown as Overview;
}

async function renderCard(tier: Tier, plans: { tier: Tier; multiplier: number }[] | null) {
  plansRef.current = plans;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AccountAssetsCard data={overview(tier)} />
    </QueryClientProvider>,
  );
}

/** 某一档诱导行上的徽标文字('' = 没有徽标)。 */
function badgeOf(label: 'Pro' | 'Max'): string {
  const row = screen.getByText(`${label} 额度`).parentElement!;
  const badge = [...row.querySelectorAll('span')].find((e) =>
    /当前额度|不限额度/.test(e.textContent ?? ''),
  );
  return badge?.textContent?.trim() ?? '';
}

const NORMAL: { tier: Tier; multiplier: number }[] = [
  { tier: 'free', multiplier: 1 },
  { tier: 'pro', multiplier: 2 },
  { tier: 'max', multiplier: 2 },
];

describe('档位倍数阶梯', () => {
  it('free 视角:Pro = 2×,Max = 2×2 = 4×(Max 锚点是 Pro,必须连乘)', async () => {
    await renderCard('free', NORMAL);
    expect(badgeOf('Pro')).toBe('2× 当前额度');
    expect(badgeOf('Max'), 'Max 相对 Free 必须是 pro×max 连乘,不是 max.multiplier').toBe(
      '4× 当前额度',
    );
  });

  it('pro 视角:只出 Max 行,且分母是当前档(2× 而不是相对 Free 的 4×)', async () => {
    await renderCard('pro', NORMAL);
    expect(screen.queryByText('Pro 额度'), '已在 Pro,不该再诱导 Pro').toBeNull();
    expect(badgeOf('Max')).toBe('2× 当前额度');
  });

  it('非整数倍率保留一位小数,不出现 2.50×', async () => {
    await renderCard('free', [
      { tier: 'free', multiplier: 1 },
      { tier: 'pro', multiplier: 2.5 },
      { tier: 'max', multiplier: 2 },
    ]);
    expect(badgeOf('Pro')).toBe('2.5× 当前额度');
    expect(badgeOf('Max')).toBe('5× 当前额度');
  });

  it('倍率 <=0 = 该档不限额:写「不限额度」,不写 0×', async () => {
    await renderCard('free', [
      { tier: 'free', multiplier: 1 },
      { tier: 'pro', multiplier: 2 },
      { tier: 'max', multiplier: 0 },
    ]);
    expect(badgeOf('Pro')).toBe('2× 当前额度');
    expect(badgeOf('Max'), '倍率<=0 是后端的不限额语义').toBe('不限额度');
  });

  it('plans 未到位时不显示倍数(兜底值与线上配置不一致,宁可不写)', async () => {
    await renderCard('free', null);
    expect(badgeOf('Pro')).toBe('');
    expect(badgeOf('Max')).toBe('');
  });
});

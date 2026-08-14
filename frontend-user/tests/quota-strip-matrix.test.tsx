// @vitest-environment jsdom

/**
 * 额度耗尽条的**按钮矩阵契约**(2026-08-12 产品拍板)。
 *
 * 这一族按钮不是样式问题:出错会把用户推向买不到的东西(给 max 用户显示「升级 Max」)、
 * 或把免费用户直接推向按量付费的复杂心智。矩阵在这里逐格钉死:
 *
 *   档位 × 经费 → 下区按钮
 *     free            → [升级会员]                        (不出经费路)
 *     pro  + 无可用经费 → [升级 Max] [充值经费]
 *     pro  + 有经费未开 → [升级 Max] [用经费继续]
 *     max  + 无可用经费 → [充值经费]                      (顶档不出升级键)
 *     max  + 有经费未开 → [用经费继续]
 *   重置次数 > 0     → 上区额外出 [立即恢复](与付费路分区)
 *
 * 「有经费未开」= credit.total>0 且 credit_autopay=false;开了 autopay 却仍被拦
 * 只可能是余额为 0,故按「无可用经费」处理(出充值)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuotaComposerStrip } from '@/shared/components/chat/QuotaComposerStrip';
import { useQuotaStore } from '@/stores/quota.store';

// 额度条只读 overview;http 与设备判定打桩,组件其余部分照常渲染。
vi.mock('@/shared/lib/auth-token', () => ({ getAuthToken: () => 'test-token' }));
vi.mock('@/shared/lib/device', () => ({ isPhoneDevice: () => false }));

const overviewRef: { current: unknown } = { current: null };
vi.mock('@/shared/lib/http', () => ({
  http: {
    get: async () => ({ data: { data: overviewRef.current } }),
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
  },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

afterEach(() => {
  cleanup();
  useQuotaStore.setState({ lastExceeded: null, stripCount: 0, blockedStripCount: 0 });
});

function overview(opts: {
  tier: 'free' | 'pro' | 'max';
  credit: number;
  autopay?: boolean;
  passes?: number;
}) {
  return {
    tier: opts.tier,
    cycle: 'monthly',
    token: {
      used: 0,
      ceiling: 0,
      percent: 100,
      unlimited: false,
      window_days: 7,
      window_started_at: '2026-08-11T00:00:00+08:00',
      window_reset_at: '2026-08-18T19:53:00+08:00',
    },
    credit: {
      perm: opts.credit,
      total: opts.credit,
      perm_micro: 0,
      points: 0,
      credit_autopay: opts.autopay ?? false,
    },
    reset_passes: opts.passes ?? 0,
  };
}

/** 渲染耗尽条并**等到 overview 真正落地**。
 *  ⚠️ 不能拿标题当锚点:标题在无数据时也渲染(默认按 free 出按钮),
 *     用它等待会在数据到达前就断言,矩阵永远读到 free 的那一组。
 *     锚点必须是数据驱动的元素 —— 这里用「恢复时刻」(overview.window_reset_at)。 */
async function renderBlocked(data: ReturnType<typeof overview>) {
  overviewRef.current = data;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuotaComposerStrip blocked={{ onResend: () => {}, onDismiss: () => {} }} />
    </QueryClientProvider>,
  );
  await screen.findByText(/8月18日/);
}

/** 条内所有可见按钮文案(含上区/下区,排除关闭图标按钮)。 */
function buttonLabels(): string[] {
  return screen
    .getAllByRole('button')
    .map((b) => (b.textContent ?? '').trim())
    .filter(Boolean);
}

describe('额度耗尽条 · 按钮矩阵', () => {
  it('free:只给升级会员,不出经费路(不把免费用户推向按量付费)', async () => {
    await renderBlocked(overview({ tier: 'free', credit: 0 }));
    const labels = buttonLabels();
    expect(labels).toContain('升级会员');
    expect(labels.join()).not.toContain('充值经费');
    expect(labels.join()).not.toContain('用经费继续');
    expect(labels.join()).not.toContain('立即恢复');
  });

  it('free 即使账上有经费也只给升级(经费路对免费档不开放)', async () => {
    await renderBlocked(overview({ tier: 'free', credit: 20 }));
    const labels = buttonLabels().join();
    expect(labels).toContain('升级会员');
    expect(labels).not.toContain('用经费继续');
  });

  it('pro + 无经费:升级 Max + 充值经费', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 0 }));
    const labels = buttonLabels();
    expect(labels).toContain('升级 Max');
    expect(labels).toContain('充值经费');
    expect(labels.join()).not.toContain('用经费继续');
  });

  it('pro + 有经费未开:升级 Max + 用经费继续', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 12.5 }));
    const labels = buttonLabels();
    expect(labels).toContain('升级 Max');
    expect(labels).toContain('用经费继续');
    expect(labels.join()).not.toContain('充值经费');
  });

  it('pro + 开了用经费继续但余额为 0:回落充值(不给点了没用的开关)', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 0, autopay: true }));
    const labels = buttonLabels();
    expect(labels).toContain('充值经费');
    expect(labels.join()).not.toContain('用经费继续');
  });

  it('max + 无经费:只给充值经费(顶档不出升级键)', async () => {
    await renderBlocked(overview({ tier: 'max', credit: 0 }));
    const labels = buttonLabels();
    expect(labels).toContain('充值经费');
    expect(labels.join()).not.toContain('升级');
  });

  it('max + 有经费未开:只给用经费继续', async () => {
    await renderBlocked(overview({ tier: 'max', credit: 30 }));
    const labels = buttonLabels();
    expect(labels).toContain('用经费继续');
    expect(labels.join()).not.toContain('升级');
  });

  it('有恢复次数:上区额外出「立即恢复」,与下区付费路并存', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 0, passes: 2 }));
    const labels = buttonLabels();
    expect(labels).toContain('立即恢复');
    expect(labels).toContain('升级 Max');
    expect(screen.getByText(/可立即恢复/)).toBeTruthy();
  });

  it('无恢复次数:不出上区(不显示 0 次)', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 0, passes: 0 }));
    expect(buttonLabels().join()).not.toContain('立即恢复');
    expect(screen.queryByText(/可立即恢复/)).toBeNull();
  });
});

describe('额度耗尽条 · 分区结构', () => {
  it('有恢复次数时:上区(立即恢复)在前、下区(说明+付费路)在后,且两区之间有分隔线', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 12.5, passes: 2 }));
    const strip = screen.getByRole('status');
    const resetBtn = screen.getByRole('button', { name: '立即恢复' });
    const title = screen.getByText('额度已用完');
    // DOM 顺序 = 视觉顺序(条内是纵向 flex,无 order 覆写)
    expect(
      resetBtn.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
      '「立即恢复」区必须排在说明与付费按钮之上',
    ).toBeTruthy();
    // 分隔线:免费的那条路不能和要花钱的挤成一排被整体读成付费墙
    const divider = strip.querySelector('.border-b');
    expect(divider, '两区之间缺少分隔线').toBeTruthy();
    expect(divider!.textContent).toContain('立即恢复');
  });
});

describe('额度耗尽条 · 文案', () => {
  it('标题主语是额度而非用户;正文只讲恢复时刻,不掺其他信息', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 0 }));
    expect(screen.getByText('额度已用完')).toBeTruthy();
    const body = screen.getByText(/恢复满额/);
    expect(body.textContent, '必须给绝对恢复时刻,不许写「稍后再试」').toMatch(/8月18日 19:53/);
    // 2026-08-12 拍板:正文只留恢复时刻,其余一律不展示
    for (const noise of ['消息已保存', '未消耗', '自动发送']) {
      expect(body.textContent, `正文不应出现「${noise}」`).not.toContain(noise);
    }
  });

  // 2026-08-13 文案铁律:周期/重置这类内部机制口径不进用户文案(规则在变,写进去就会过期)。
  // 钉在这里而不是靠 review:这条条文历史上被「本周期用量已达上限」违反了整整一个版本。
  it('条内任何一格都不出现周期/重置这类机制口径', async () => {
    await renderBlocked(overview({ tier: 'pro', credit: 12.5, passes: 2 }));
    const text = screen.getByRole('status').textContent ?? '';
    for (const banned of ['本周期', '周期', '重置', '重新计算']) {
      expect(text, `额度条不应出现机制口径「${banned}」`).not.toContain(banned);
    }
  });
});

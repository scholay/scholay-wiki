// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { useClaimInvite } from '@/stores/claim-invite.store';

const mocks = vi.hoisted(() => ({
  filled: false,
  ready: true,
  campaignEnabled: true,
}));

vi.mock('@/features/auth/hooks/useInviteFilled', () => ({
  useInviteFilled: () => ({
    campaignEnabled: mocks.campaignEnabled,
    ready: mocks.ready,
    filled: mocks.filled,
  }),
}));

import { ClaimInviteNavButton } from './ClaimInviteNavButton';

function renderButton() {
  return render(
    <TooltipProvider>
      <ClaimInviteNavButton />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.filled = false;
  mocks.ready = true;
  mocks.campaignEnabled = true;
  useClaimInvite.getState().closeClaim();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  useClaimInvite.getState().closeClaim();
  vi.useRealTimers();
});

describe('ClaimInviteNavButton', () => {
  it('未填码时 5 秒轮播三种入口', () => {
    renderButton();
    expect(screen.getByRole('button', { name: '填写邀请码' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: '推广有好礼' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: '获取邀请码' })).toBeInTheDocument();
  });

  it('已填码只保留推广有好礼', () => {
    mocks.filled = true;
    renderButton();
    expect(screen.getByRole('button', { name: '推广有好礼' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByRole('button', { name: '推广有好礼' })).toBeInTheDocument();
  });

  it('点击当前入口会打开对应场景', () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: '填写邀请码' }));
    expect(useClaimInvite.getState()).toMatchObject({
      open: true,
      scene: 'fill',
    });
  });

  it('右侧刷新可立刻切到下一项活动', () => {
    renderButton();
    expect(screen.getByRole('button', { name: '填写邀请码' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切换活动' }));
    expect(screen.getByRole('button', { name: '推广有好礼' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切换活动' }));
    expect(screen.getByRole('button', { name: '获取邀请码' })).toBeInTheDocument();
  });

  it('已填码时不显示刷新', () => {
    mocks.filled = true;
    renderButton();
    expect(screen.queryByRole('button', { name: '切换活动' })).not.toBeInTheDocument();
  });
});

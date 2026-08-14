// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  open: false,
  openPromo: vi.fn(),
  closePromo: vi.fn(),
}));

vi.mock('@/shared/api/promo', () => ({
  usePromoEligible: () => ({
    cfg: {
      enabled: true,
      wechat_qr_url: '/api/v1/config/promo/qr',
    },
    tierReady: true,
    visible: true,
  }),
}));

vi.mock('@/stores/promo.store', () => ({
  usePromoStore: (selector: (state: typeof mocks) => unknown) => selector(mocks),
}));

vi.mock('@/stores/quota.store', () => ({
  QUOTA_DIALOG_SNOOZE_MS: 30_000,
  useQuotaStore: Object.assign(() => null, {
    getState: () => ({ resetOpen: false, dismissedAt: 0 }),
  }),
}));

vi.mock('@/shared/hooks/useLocalStorage', () => ({
  useLocalStorage: () => ['', vi.fn()],
}));

// 刻意让 Dialog 在关闭态也预挂载 children：这比 Radix 当前行为更严格，
// 用来证明 QR 请求闸门依赖 open，而不依赖 Portal 实现细节。
vi.mock('@/shared/ui/dialog', () => ({
  Dialog: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DialogClose: ({ children }: PropsWithChildren) => <>{children}</>,
  DialogContent: ({ children }: PropsWithChildren) => <section>{children}</section>,
  DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: PropsWithChildren) => <footer>{children}</footer>,
  DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

import { PromoModal } from './PromoModal';

beforeEach(() => {
  mocks.open = false;
  mocks.openPromo.mockReset();
  mocks.closePromo.mockReset();
});

afterEach(cleanup);

describe('PromoModal QR loading boundary', () => {
  it('关闭态不挂载 QR 图片，真正打开后才设置独立图片 URL', () => {
    const cfg = { enabled: true, wechat_qr_url: '/api/v1/config/promo/qr' };
    const view = render(<PromoModal cfg={cfg} visible />);
    expect(screen.queryByRole('img', { name: '微信客服二维码' })).toBeNull();

    mocks.open = true;
    view.rerender(<PromoModal cfg={cfg} visible />);

    expect(screen.getByRole('img', { name: '微信客服二维码' }).getAttribute('src')).toBe(
      '/api/v1/config/promo/qr',
    );
  });

  it('图片失败后先收起裂图，新 nonce 只触发一次绕缓存重试', () => {
    mocks.open = true;
    const onQRCodeError = vi.fn();
    const cfg = {
      enabled: true,
      wechat_qr_url: '/api/v1/config/promo/qr?v=old',
    };
    const view = render(
      <PromoModal cfg={cfg} visible onQRCodeError={onQRCodeError} />,
    );

    fireEvent.error(screen.getByRole('img', { name: '微信客服二维码' }));
    expect(onQRCodeError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: '微信客服二维码' })).toBeNull();

    view.rerender(
      <PromoModal
        cfg={cfg}
        visible
        qrRetryNonce={1}
        onQRCodeError={onQRCodeError}
      />,
    );
    expect(screen.getByRole('img', { name: '微信客服二维码' }).getAttribute('src')).toBe(
      '/api/v1/config/promo/qr?v=old&retry=1',
    );
  });
});

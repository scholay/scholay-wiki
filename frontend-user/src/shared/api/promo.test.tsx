// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/shared/lib/http', () => ({ http: { get: mocks.get } }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStatus: () => ({ authenticated: false, user: null, profileLoading: false }),
}));

import { usePromoConfig } from './promo';

afterEach(() => {
  cleanup();
  mocks.get.mockReset();
});

describe('promo public config', () => {
  it('常驻控制只请求不含 base64 二维码的 summary', async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: {
          enabled: true,
          title: '限时领取',
          wechat_qr_url: '/api/v1/config/promo/qr',
        },
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const view = renderHook(() => usePromoConfig(), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('/config/promo/summary');
    expect(view.result.current.data).toEqual({
      enabled: true,
      title: '限时领取',
      wechat_qr_url: '/api/v1/config/promo/qr',
    });

    view.unmount();
    client.clear();
  });
});

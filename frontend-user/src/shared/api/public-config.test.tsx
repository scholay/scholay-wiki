// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get },
}));

import {
  PUBLIC_CONFIG_STALE_TIME,
  usePublicConfig,
} from './public-config';

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

afterEach(() => {
  cleanup();
  mocks.get.mockReset();
});

describe('public system config cache contract', () => {
  it('revalidates auth-critical switches within one minute and on focus/reconnect', async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: {
          id: 1,
          require_email_verification: true,
          enable_turnstile: false,
          turnstile_site_key: '',
        },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderHook(() => usePublicConfig(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    const query = queryClient.getQueryCache().find({
      queryKey: ['public-config', 'system'],
    });
    const options = query?.options as {
      staleTime?: number;
      refetchOnWindowFocus?: boolean;
      refetchOnReconnect?: boolean;
    };
    expect(PUBLIC_CONFIG_STALE_TIME).toBeLessThanOrEqual(60_000);
    expect(options.staleTime).toBe(PUBLIC_CONFIG_STALE_TIME);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchOnReconnect).toBe(true);
    expect(mocks.get).toHaveBeenCalledWith('/config/system');

    view.unmount();
    queryClient.clear();
  });
});

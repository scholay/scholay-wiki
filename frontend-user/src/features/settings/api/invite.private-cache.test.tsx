// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  token: null as string | null,
  get: vi.fn(),
}));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { token: string | null }) => unknown) =>
    selector({ token: mocks.token }),
}));

import { authSessionKey } from '@/shared/lib/auth-token';
import { useInvitedUsers } from './invite';

function jwtForUser(userId: number): string {
  const payload = btoa(JSON.stringify({ user_id: userId }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mocks.token = null;
  mocks.get.mockReset();
});

afterEach(() => cleanup());

describe('useInvitedUsers private query partition', () => {
  it('从账号 A 切换到 B 时不把 A 的邀请名单作为 placeholder 展示', async () => {
    const tokenA = jwtForUser(301);
    const tokenB = jwtForUser(302);
    const registrationsA = {
      items: [
        {
          name: '用户 A 的好友',
          method: 'email',
          rewarded_credits: 10,
          created_at: '2026-08-09T01:00:00Z',
        },
      ],
      total: 1,
    };
    const registrationsB = {
      items: [
        {
          name: '用户 B 的好友',
          method: 'phone',
          rewarded_credits: 20,
          created_at: '2026-08-09T02:00:00Z',
        },
      ],
      total: 1,
    };
    let resolveUserB!: (value: {
      data: { data: typeof registrationsB };
    }) => void;
    const userBResponse = new Promise<{
      data: { data: typeof registrationsB };
    }>((resolve) => {
      resolveUserB = resolve;
    });
    mocks.token = tokenA;
    mocks.get
      .mockResolvedValueOnce({ data: { data: registrationsA } })
      .mockReturnValueOnce(userBResponse);
    const queryClient = testQueryClient();
    const view = renderHook(() => useInvitedUsers(1, 10), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() =>
      expect(view.result.current.data?.items[0]?.name).toBe('用户 A 的好友'),
    );

    mocks.token = tokenB;
    view.rerender();

    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.isPlaceholderData).toBe(false);
    expect(
      queryClient.getQueryData([
        'settings',
        'invite',
        'registrations',
        authSessionKey(tokenA),
        1,
        10,
      ]),
    ).toEqual(registrationsA);

    await act(async () => {
      resolveUserB({ data: { data: registrationsB } });
      await userBResponse;
    });
    await waitFor(() =>
      expect(view.result.current.data?.items[0]?.name).toBe('用户 B 的好友'),
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user/invite/registrations', {
      params: { page: 1, page_size: 10 },
    });
    expect(
      queryClient.getQueryData([
        'settings',
        'invite',
        'registrations',
        authSessionKey(tokenB),
        1,
        10,
      ]),
    ).toEqual(registrationsB);

    view.unmount();
    queryClient.clear();
  });
});

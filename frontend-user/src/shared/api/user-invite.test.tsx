// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
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
import { USER_INVITE_QUERY_KEY, useUserInvite } from './user-invite';

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

describe('useUserInvite private query partition', () => {
  it('账号 A 切换到账号 B 后使用新 query key 并重新请求，不复用 A 的邀请码', async () => {
    const tokenA = jwtForUser(101);
    const tokenB = jwtForUser(202);
    const inviteA = {
      code: 'USERA101',
      url: 'https://www.scholay.com/i/USERA101',
    };
    const inviteB = {
      code: 'USERB202',
      url: 'https://www.scholay.com/i/USERB202',
    };
    mocks.token = tokenA;
    mocks.get
      .mockResolvedValueOnce({ data: { data: inviteA } })
      .mockResolvedValueOnce({ data: { data: inviteB } });
    const queryClient = testQueryClient();
    const view = renderHook(() => useUserInvite(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() =>
      expect(view.result.current.data?.code).toBe('USERA101'),
    );
    expect(
      queryClient.getQueryData([
        ...USER_INVITE_QUERY_KEY,
        authSessionKey(tokenA),
      ]),
    ).toEqual(inviteA);

    mocks.token = tokenB;
    view.rerender();

    await waitFor(() =>
      expect(view.result.current.data?.code).toBe('USERB202'),
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/user/invite');
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user/invite');
    expect(
      queryClient.getQueryData([
        ...USER_INVITE_QUERY_KEY,
        authSessionKey(tokenA),
      ]),
    ).toEqual(inviteA);
    expect(
      queryClient.getQueryData([
        ...USER_INVITE_QUERY_KEY,
        authSessionKey(tokenB),
      ]),
    ).toEqual(inviteB);
    expect(authSessionKey(tokenA)).not.toBe(authSessionKey(tokenB));

    view.unmount();
    queryClient.clear();
  });

  it('无 token 时即使调用方 enabled=true 也不请求私有接口', () => {
    const queryClient = testQueryClient();
    const view = renderHook(() => useUserInvite(true), {
      wrapper: wrapperFor(queryClient),
    });

    expect(view.result.current.fetchStatus).toBe('idle');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryCache().find({
        queryKey: [...USER_INVITE_QUERY_KEY, 'anonymous'],
        exact: true,
      }),
    ).toBeDefined();

    view.unmount();
    queryClient.clear();
  });
});

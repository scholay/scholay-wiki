// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  token: 'token-a' as string | null,
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get, post: mocks.post },
  toApiError: (error: unknown) => error,
}));

vi.mock('@/shared/lib/auth-token', () => ({
  authSessionKey: (token: string | null) =>
    token ? `session:${token}` : 'anonymous',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (
    selector: (state: { token: string | null }) => unknown,
  ) => selector({ token: mocks.token }),
}));

import {
  INVITE_CAMPAIGN_QUERY_KEY,
  INVITE_STATUS_QUERY_KEY,
  useBindInvite,
  useInviteCampaign,
  useInviteStatus,
} from './invite-campaign';

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
  mocks.token = 'token-a';
});

afterEach(() => {
  cleanup();
  mocks.get.mockReset();
  mocks.post.mockReset();
});

describe('invite campaign shared query contracts', () => {
  it('常驻顶栏与 Flow 每 60 秒跟随活动开关，隐藏标签页不轮询', async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: {
          enabled: true,
          inviter_registration_credits: 100,
          invitee_registration_credits: 50,
          registration_daily_cap: 10,
          bind_window_days: 7,
          first_purchase_window_days: 30,
          first_purchase_rebate_bps: 1250,
          code_help_url: '',
        },
      },
    });
    const queryClient = testQueryClient();
    const view = renderHook(() => useInviteCampaign(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    const query = queryClient.getQueryCache().find({
      queryKey: INVITE_CAMPAIGN_QUERY_KEY,
    });
    const options = query?.options as {
      staleTime?: number;
      refetchInterval?: number;
      refetchIntervalInBackground?: boolean;
      retry?: number;
    };
    expect(options.staleTime).toBe(60_000);
    expect(options.refetchInterval).toBe(60_000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(query?.options.retry).toBe(1);
    expect(mocks.get).toHaveBeenCalledWith('/invite/campaign');
    view.unmount();
    queryClient.clear();
  });

  it('显式绑定成功后同步刷新关联状态、邀请页、钱包和经费流水', async () => {
    mocks.post.mockResolvedValue({
      data: {
        data: {
          status: { enabled: true, bound: true, eligible: false },
          rewards: { invitee_registration_credits: 50 },
        },
      },
    });
    const queryClient = testQueryClient();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const view = renderHook(() => useBindInvite(), {
      wrapper: wrapperFor(queryClient),
    });

    await act(async () => {
      await view.result.current.mutateAsync('abcd2345');
    });

    expect(mocks.post).toHaveBeenCalledWith('/user/invite/bind', {
      code: 'ABCD2345',
    });
    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
      ['invite', 'status'],
      ['settings', 'invite'],
      ['settings', 'billing'],
      ['settings', 'billing', 'txns'],
    ]);
    view.unmount();
    queryClient.clear();
  });

  it('邀请关联状态的 query key 随鉴权会话分区，换号后不复用前一用户状态', async () => {
    mocks.get
      .mockResolvedValueOnce({
        data: {
          data: {
            enabled: true,
            bound: true,
            eligible: false,
            inviter_name: '用户 A',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            enabled: true,
            bound: false,
            eligible: true,
          },
        },
      });
    const queryClient = testQueryClient();
    const view = renderHook(() => useInviteStatus(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(view.result.current.data?.bound).toBe(true));
    expect(
      queryClient.getQueryData([
        ...INVITE_STATUS_QUERY_KEY,
        'session:token-a',
      ]),
    ).toMatchObject({ bound: true, inviter_name: '用户 A' });

    mocks.token = 'token-b';
    view.rerender();

    await waitFor(() => expect(view.result.current.data?.bound).toBe(false));
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/user/invite/status');
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user/invite/status');
    expect(
      queryClient.getQueryData([
        ...INVITE_STATUS_QUERY_KEY,
        'session:token-b',
      ]),
    ).toMatchObject({ bound: false, eligible: true });

    view.unmount();
    queryClient.clear();
  });
});

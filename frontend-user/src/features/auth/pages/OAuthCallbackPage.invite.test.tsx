// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  params: null as URLSearchParams | null,
  navigate: vi.fn(),
  handleAuthSuccess: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ provider: 'apple' }),
    useSearchParams: () => [mocks.params!],
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks,
}));

vi.mock('../api/auth', () => ({
  handleAuthSuccess: (...args: unknown[]) => mocks.handleAuthSuccess(...args),
}));

vi.mock('../components/OAuthMergeConfirmDialog', () => ({
  OAuthMergeConfirmDialog: () => null,
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: () => ({ token: null }),
  }),
}));

vi.mock('@/shared/lib/http', () => ({
  http: { get: vi.fn(), post: vi.fn() },
  toApiError: (error: unknown) => error,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

import { OAuthCallbackPage } from './OAuthCallbackPage';

beforeEach(() => {
  const user = encodeURIComponent(
    JSON.stringify({ id: 88, email: 'apple@example.com', role: 'user' }),
  );
  mocks.params = new URLSearchParams(
    `token=apple-jwt&user=${user}&is_new_user=true`,
  );
  mocks.navigate.mockReset();
  mocks.handleAuthSuccess.mockReset();
  mocks.invalidateQueries.mockReset();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('Apple OAuth 新用户邀请接续', () => {
  it('把 redirect 上的 is_new_user=true 传入统一 handleAuthSuccess', async () => {
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(mocks.handleAuthSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.handleAuthSuccess.mock.calls[0]?.[1]).toMatchObject({
      token: 'apple-jwt',
      is_new_user: true,
      user: { id: 88, email: 'apple@example.com', role: 'user' },
    });
  });

  it('无 user JSON 时使用 redirect 中的真实 user_id，不传 id:0', async () => {
    mocks.params = new URLSearchParams(
      'token=apple-jwt&user_id=93&is_new_user=true',
    );

    render(<OAuthCallbackPage />);

    await waitFor(() => expect(mocks.handleAuthSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.handleAuthSuccess.mock.calls[0]?.[1]).toMatchObject({
      token: 'apple-jwt',
      is_new_user: true,
      user: { id: 93, email: '', role: 'user' },
    });
    expect(mocks.handleAuthSuccess.mock.calls[0]?.[1]?.user?.id).not.toBe(0);
  });
});

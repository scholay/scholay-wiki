// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  params: null as URLSearchParams | null,
  navigate: vi.fn(),
  handleAuthSuccess: vi.fn(),
  exchangeAppleLoginCode: vi.fn(),
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
  exchangeAppleLoginCode: (...args: unknown[]) => mocks.exchangeAppleLoginCode(...args),
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
  // 新流程(2026-08-12 安全修复):Apple 回调只带一次性 login_code,不再带 JWT。
  mocks.params = new URLSearchParams('login_code=apple-onetime-code&is_new_user=true');
  mocks.navigate.mockReset();
  mocks.handleAuthSuccess.mockReset();
  mocks.exchangeAppleLoginCode.mockReset();
  mocks.exchangeAppleLoginCode.mockResolvedValue({
    token: 'apple-jwt',
    is_new_user: true,
    user: { id: 88, email: 'apple@example.com', role: 'user' },
  });
  mocks.invalidateQueries.mockReset();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('Apple OAuth 新用户邀请接续(login_code 交换)', () => {
  it('拿 login_code POST 换 token,交换结果(含 is_new_user)传入统一 handleAuthSuccess', async () => {
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(mocks.exchangeAppleLoginCode).toHaveBeenCalledTimes(1));
    expect(mocks.exchangeAppleLoginCode).toHaveBeenCalledWith('apple-onetime-code');
    await waitFor(() => expect(mocks.handleAuthSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.handleAuthSuccess.mock.calls[0]?.[1]).toMatchObject({
      token: 'apple-jwt',
      is_new_user: true,
      user: { id: 88, email: 'apple@example.com', role: 'user' },
    });
  });

  it('绝不从 URL 直接读 JWT —— 只认 login_code(安全回归:JWT 不再落 URL)', async () => {
    // 即便 URL 里塞了 token=,页面也不能拿它当会话(旧漏洞的反向锁)。
    mocks.params = new URLSearchParams('token=leaked-jwt&user_id=93');
    render(<OAuthCallbackPage />);
    // 无 login_code → 不走交换、不落 session(会往下走到 code+state 或错误分支,不会用 token=)。
    await waitFor(() => expect(mocks.exchangeAppleLoginCode).not.toHaveBeenCalled());
    expect(mocks.handleAuthSuccess).not.toHaveBeenCalled();
  });

  it('交换失败(code 过期/无效)进错误态,不落 session', async () => {
    mocks.exchangeAppleLoginCode.mockRejectedValue({ message: '登录码无效或已过期,请重新登录' });
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(mocks.exchangeAppleLoginCode).toHaveBeenCalledTimes(1));
    expect(mocks.handleAuthSuccess).not.toHaveBeenCalled();
  });
});

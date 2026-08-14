// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  openAuth: vi.fn(),
  clearSession: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../api/oauth-merge', () => ({
  usePendingMerge: () => ({
    data: {
      provider: 'google',
      provider_email: 'target@example.com',
      target_email: 'target@example.com',
    },
    isLoading: false,
    isError: false,
  }),
  useConfirmOAuthMerge: () => ({
    mutateAsync: mocks.confirm,
    isPending: false,
  }),
  useCancelOAuthMerge: () => ({
    mutateAsync: mocks.cancel,
    isPending: false,
  }),
}));

vi.mock('@/stores/auth.store', () => ({
  useIsAuthenticated: () => false,
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: null, clear: mocks.clearSession }),
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: (selector: (state: unknown) => unknown) =>
    selector({ openDialog: mocks.openAuth }),
}));

vi.mock('@/shared/hooks', () => ({
  useApiToast: () => ({ show: vi.fn() }),
}));

import { OAuthMergeConfirmDialog } from './OAuthMergeConfirmDialog';

beforeEach(() => {
  mocks.openAuth.mockReset();
  mocks.clearSession.mockReset();
  mocks.confirm.mockReset();
  mocks.cancel.mockReset();
});

afterEach(() => cleanup());

describe('OAuthMergeConfirmDialog 邀请流隔离', () => {
  it('登录目标账号时标记 suppressInviteFlow，不先消费邀请候选', () => {
    render(
      <OAuthMergeConfirmDialog token="merge-token" onDone={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /登录该账号后绑定/ }));

    expect(mocks.openAuth).toHaveBeenCalledWith('login', {
      accountType: 'email',
      suppressInviteFlow: true,
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});

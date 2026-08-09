// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  profile: undefined as
    | {
        id: number;
        email?: string;
        role: 'user';
      }
    | undefined,
  inviteOpen: true,
  setUser: vi.fn(),
  clear: vi.fn(),
  closeInvite: vi.fn(),
  openDialog: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/features/auth/api/profile', () => ({
  useProfile: () => ({ data: mocks.profile }),
}));

vi.mock('@/shared/lib/http', () => ({
  BizCode: {
    TokenRevoked: 41_001,
    TokenExpired: 41_002,
  },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (
    selector: (state: {
      setUser: typeof mocks.setUser;
      clear: typeof mocks.clear;
    }) => unknown,
  ) => selector({ setUser: mocks.setUser, clear: mocks.clear }),
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: {
    getState: () => ({ openDialog: mocks.openDialog }),
  },
}));

vi.mock('@/stores/invite-entry.store', () => ({
  useInviteEntry: {
    getState: () => ({
      open: mocks.inviteOpen,
      closeInvite: mocks.closeInvite,
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
  },
}));

import { AuthBootstrap } from './AuthBootstrap';

beforeEach(() => {
  mocks.profile = undefined;
  mocks.inviteOpen = true;
  mocks.setUser.mockReset();
  mocks.clear.mockReset();
  mocks.closeInvite.mockReset();
  mocks.openDialog.mockReset();
  mocks.toastInfo.mockReset();
  mocks.toastWarning.mockReset();
  window.history.replaceState({}, '', '/library');
});

afterEach(() => cleanup());

describe('AuthBootstrap auth eviction', () => {
  it('用户端会话失效时先关闭邀请弹窗，再清会话并打开登录弹窗', () => {
    render(<AuthBootstrap />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('auth-evicted', {
          detail: { code: 41_002, message: '登录已过期' },
        }),
      );
    });

    expect(mocks.closeInvite).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo).toHaveBeenCalledWith('登录已过期');
    expect(mocks.openDialog).toHaveBeenCalledWith('login');
    expect(mocks.closeInvite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder[0],
    );
    expect(mocks.closeInvite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openDialog.mock.invocationCallOrder[0],
    );
  });
});

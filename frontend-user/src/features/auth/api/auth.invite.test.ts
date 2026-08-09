// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  closeDialog: vi.fn(),
  invalidateQueries: vi.fn(),
  suppressInviteFlow: false,
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: () => ({ setSession: mocks.setSession }),
  }),
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: Object.assign(vi.fn(), {
    getState: () => ({
      close: mocks.closeDialog,
      suppressInviteFlow: mocks.suppressInviteFlow,
    }),
  }),
}));

vi.mock('@/shared/lib/http', () => ({
  http: {},
  toApiError: (error: unknown) => error,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { handleAuthSuccess } from './auth';
import { AUTH_SUCCESS_EVENT, type AuthSuccessEventDetail } from '@/shared/lib/auth-events';
import type { AuthResponse } from '../types';

const qc = { invalidateQueries: mocks.invalidateQueries };

function response(isNewUser?: boolean): AuthResponse {
  return {
    token: 'jwt',
    is_new_user: isNewUser,
    user: {
      id: 73,
      email: 'new@example.com',
      role: 'user',
    },
  } as AuthResponse;
}

beforeEach(() => {
  mocks.setSession.mockReset();
  mocks.closeDialog.mockReset();
  mocks.invalidateQueries.mockReset();
  mocks.suppressInviteFlow = false;
});

describe('handleAuthSuccess 邀请流信号', () => {
  it('新注册（包括 OAuth）发出 isNewUser=true 的统一事件', () => {
    const details: AuthSuccessEventDetail[] = [];
    const listener = (event: Event) => {
      details.push((event as CustomEvent<AuthSuccessEventDetail>).detail);
    };
    window.addEventListener(AUTH_SUCCESS_EVENT, listener);

    handleAuthSuccess(qc as never, response(true));

    window.removeEventListener(AUTH_SUCCESS_EVENT, listener);
    expect(details).toEqual([{ isNewUser: true, userId: 73 }]);
    expect(mocks.setSession).toHaveBeenCalledTimes(1);
    expect(mocks.closeDialog).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('普通旧用户登录明确发出 false，不能误进新用户绑定分支', () => {
    const details: AuthSuccessEventDetail[] = [];
    const listener = (event: Event) => {
      details.push((event as CustomEvent<AuthSuccessEventDetail>).detail);
    };
    window.addEventListener(AUTH_SUCCESS_EVENT, listener);

    handleAuthSuccess(qc as never, response());

    window.removeEventListener(AUTH_SUCCESS_EVENT, listener);
    expect(details).toEqual([{ isNewUser: false, userId: 73 }]);
  });

  it('OAuth merge 目标账号登录传递一次性 suppressInviteFlow', () => {
    mocks.suppressInviteFlow = true;
    const details: AuthSuccessEventDetail[] = [];
    const listener = (event: Event) => {
      details.push((event as CustomEvent<AuthSuccessEventDetail>).detail);
    };
    window.addEventListener(AUTH_SUCCESS_EVENT, listener);

    handleAuthSuccess(qc as never, response(false));

    window.removeEventListener(AUTH_SUCCESS_EVENT, listener);
    expect(details).toEqual([
      { isNewUser: false, userId: 73, suppressInviteFlow: true },
    ]);
    expect(mocks.closeDialog).toHaveBeenCalledTimes(1);
  });
});

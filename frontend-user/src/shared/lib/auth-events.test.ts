import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ inviteCode: null as string | null }));

vi.mock('./invite-code', () => ({
  readInviteCode: () => mocks.inviteCode,
}));

import { authSuccessLandingPath } from './auth-events';

beforeEach(() => {
  mocks.inviteCode = null;
});

describe('authSuccessLandingPath', () => {
  it('新用户即使有候选码也回首页，由 Flow 自动绑定', () => {
    mocks.inviteCode = 'ABC234';
    expect(authSuccessLandingPath(true)).toBe('/');
  });

  it('老用户有候选码时进入设置页主动确认', () => {
    mocks.inviteCode = 'ABC234';
    expect(authSuccessLandingPath(false)).toBe('/settings/invite?bind=1');
  });

  it('没有候选码时回首页', () => {
    expect(authSuccessLandingPath(false)).toBe('/');
  });
});

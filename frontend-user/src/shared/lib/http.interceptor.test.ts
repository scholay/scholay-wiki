import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: null as string | null,
}));

vi.mock('@/shared/lib/auth-token', () => ({
  getAuthToken: () => mocks.token,
  notifyAuthLost: vi.fn(),
}));

vi.mock('@/shared/lib/anon-id', () => ({ getAnonId: () => 'anon-test' }));
vi.mock('@/shared/lib/invite-code', () => ({ readInviteCode: () => null }));
vi.mock('@/shared/lib/http-status-messages', () => ({
  statusFallbackMessage: () => '',
}));
vi.mock('@/shared/lib/quota-events', () => ({
  AGENT_QUOTA_HTTP_CODE: 6010,
  isQuotaSignal: () => false,
  notifyQuotaExceeded: vi.fn(),
}));
vi.mock('@/shared/lib/attachment-events', () => ({
  ATTACHMENT_QUOTA_HTTP_CODE: 7010,
  isAttachmentQuotaSignal: () => false,
  openAttachmentManager: vi.fn(),
}));

import { http } from './http';

beforeEach(() => {
  mocks.token = null;
});

describe('http request interceptor session binding', () => {
  it('freezes Authorization inside http.post before the next microtask can switch accounts', async () => {
    mocks.token = 'token-a';
    let authorization: string | undefined;

    const request = http.post('/session-probe', undefined, {
      adapter: async (config) => {
        authorization = config.headers.get('Authorization')?.toString();
        return {
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });

    // 模拟 http.post 返回后，同一轮后续逻辑立即切换会话。
    mocks.token = 'token-b';
    await request;

    expect(authorization).toBe('Bearer token-a');
  });
});

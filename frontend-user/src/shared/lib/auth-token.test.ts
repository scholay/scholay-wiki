// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { authSessionKey } from './auth-token';

function jwt(payload: Record<string, unknown>, suffix = 'signature'): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.${suffix}`;
}

describe('authSessionKey', () => {
  it('空会话固定落到 anonymous 分区', () => {
    expect(authSessionKey(null)).toBe('anonymous');
    expect(authSessionKey('')).toBe('anonymous');
  });

  it.each([
    [42, 'user:42'],
    ['9007199254740991', 'user:9007199254740991'],
  ])('从 JWT user_id=%s 生成非敏感用户分区键', (userId, expected) => {
    const token = jwt({ user_id: userId, email: 'private@example.com' });

    expect(authSessionKey(token)).toBe(expected);
    expect(authSessionKey(token)).not.toContain(token);
    expect(authSessionKey(token)).not.toContain('private@example.com');
  });

  it('不同用户绝不复用私有缓存，同一用户的 token 轮换仍落到同一用户分区', () => {
    const userOneBeforeRotation = jwt({ user_id: 101 }, 'old');
    const userOneAfterRotation = jwt({ user_id: 101 }, 'new');
    const userTwo = jwt({ user_id: 202 });

    expect(authSessionKey(userOneBeforeRotation)).toBe('user:101');
    expect(authSessionKey(userOneAfterRotation)).toBe('user:101');
    expect(authSessionKey(userTwo)).toBe('user:202');
    expect(authSessionKey(userOneBeforeRotation)).not.toBe(
      authSessionKey(userTwo),
    );
  });

  it.each([
    ['not-a-jwt', 'another-broken-token'],
    [jwt({ user_id: 0 }), jwt({ user_id: 'not-a-number' })],
    ['header.%%%invalid-base64%%%.signature', 'header.e30.signature'],
  ])('畸形或无有效 user_id 的 token 也用稳定指纹互相隔离', (first, second) => {
    const firstKey = authSessionKey(first);
    const secondKey = authSessionKey(second);

    expect(firstKey).toMatch(/^token:[a-z0-9]+:\d+$/);
    expect(secondKey).toMatch(/^token:[a-z0-9]+:\d+$/);
    expect(firstKey).not.toBe(secondKey);
    expect(authSessionKey(first)).toBe(firstKey);
    expect(firstKey).not.toContain(first);
    expect(secondKey).not.toContain(second);
  });
});

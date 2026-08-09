// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readInviteCandidate } from '@/shared/lib/invite-code';
import { useInviteCandidate } from './invite.store';

const STORAGE_KEY = 'scholay:invite_code';
const NOW = new Date('2026-08-09T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', createMemoryStorage());
  window.localStorage.clear();
  useInviteCandidate.setState({ candidate: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  useInviteCandidate.setState({ candidate: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useInviteCandidate', () => {
  it('capture 规范化候选码，并把编辑后的候选重置为待校验状态', () => {
    act(() => {
      useInviteCandidate.getState().confirm(' abc234 ', '研***友');
    });
    expect(useInviteCandidate.getState().candidate).toMatchObject({
      code: 'ABC234',
      inviterName: '研***友',
      valid: true,
    });

    act(() => {
      useInviteCandidate.getState().capture('  xy0o1l  ');
    });

    expect(useInviteCandidate.getState().candidate).toEqual({
      code: 'XY0O1L',
      ts: NOW,
      expiresAt: NOW + 30 * DAY,
    });
    expect(readInviteCandidate()).toEqual({
      code: 'XY0O1L',
      ts: NOW,
      expiresAt: NOW + 30 * DAY,
    });
  });

  it('confirm 将大写码、邀请人摘要和 valid 状态同步到内存与存储', () => {
    act(() => {
      useInviteCandidate.getState().confirm(' new234 ', '李***');
    });

    const expected = {
      code: 'NEW234',
      ts: NOW,
      expiresAt: NOW + 30 * DAY,
      inviterName: '李***',
      valid: true as const,
    };
    expect(useInviteCandidate.getState().candidate).toEqual(expected);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')).toEqual(expected);
  });

  it('refresh 可恢复旧 payload，clear 同时清理内存与持久化候选', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code: 'old234', ts: NOW - 500 }),
    );

    act(() => useInviteCandidate.getState().refresh());
    expect(useInviteCandidate.getState().candidate).toEqual({
      code: 'OLD234',
      ts: NOW - 500,
      expiresAt: NOW - 500 + 30 * DAY,
    });

    act(() => useInviteCandidate.getState().clear());
    expect(useInviteCandidate.getState().candidate).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('存储不可用时 capture/refresh/clear 均保持无异常且不伪造候选', () => {
    const set = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => { throw new Error('quota'); });
    expect(() => useInviteCandidate.getState().capture('ABC234')).not.toThrow();
    expect(useInviteCandidate.getState().candidate).toBeNull();
    set.mockRestore();

    const get = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => { throw new Error('privacy'); });
    expect(() => useInviteCandidate.getState().refresh()).not.toThrow();
    expect(useInviteCandidate.getState().candidate).toBeNull();
    get.mockRestore();

    useInviteCandidate.setState({
      candidate: { code: 'ABC234', ts: NOW, expiresAt: NOW + DAY },
    });
    const remove = vi
      .spyOn(window.localStorage, 'removeItem')
      .mockImplementation(() => { throw new Error('blocked'); });
    expect(() => useInviteCandidate.getState().clear()).not.toThrow();
    expect(useInviteCandidate.getState().candidate).toBeNull();
    remove.mockRestore();
  });

  it('campaign 时窗由 1 天改为 60 天时，以原捕获时刻重算而不延后 ts', () => {
    act(() => useInviteCandidate.getState().capture('DAY234', 1));
    expect(useInviteCandidate.getState().candidate).toEqual({
      code: 'DAY234',
      ts: NOW,
      expiresAt: NOW + DAY,
    });

    vi.setSystemTime(NOW + 12 * 60 * 60 * 1000);
    act(() => useInviteCandidate.getState().setBindWindowDays(60));

    expect(useInviteCandidate.getState().candidate).toEqual({
      code: 'DAY234',
      ts: NOW,
      expiresAt: NOW + 60 * DAY,
    });
  });
});

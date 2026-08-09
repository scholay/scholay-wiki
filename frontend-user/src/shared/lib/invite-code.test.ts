// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearInviteCode,
  readInviteCandidate,
  readInviteCode,
  saveInviteCode,
} from './invite-code';

const STORAGE_KEY = 'scholay:invite_code';
const NOW = new Date('2026-08-09T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * DAY;

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
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('invite-code persistence', () => {
  it('保存时 trim 并转大写，preview 元信息按需持久化', () => {
    saveInviteCode('  ab0o1l  ', { inviterName: '研***友', valid: true });

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')).toEqual({
      code: 'AB0O1L',
      ts: NOW,
      expiresAt: NOW + THIRTY_DAYS,
      inviterName: '研***友',
      valid: true,
    });
    expect(readInviteCode()).toBe('AB0O1L');
  });

  it('兼容旧版仅含 code/ts 的 payload，并在读取时规范成大写', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code: 'abc234', ts: NOW - 1_000 }),
    );

    expect(readInviteCandidate()).toEqual({
      code: 'ABC234',
      ts: NOW - 1_000,
      expiresAt: NOW - 1_000 + THIRTY_DAYS,
    });
  });

  it('候选码恰好 30 天仍有效，超过 30 天则读取为空并自清理', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code: 'ATEDGE', ts: NOW - THIRTY_DAYS }),
    );
    expect(readInviteCode()).toBe('ATEDGE');

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code: 'EXPIRED', ts: NOW - THIRTY_DAYS - 1 }),
    );
    expect(readInviteCandidate()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('新 payload 按 campaign 的 1 天或 60 天绑定时窗写入显式 expiresAt', () => {
    saveInviteCode('DAY234', { bindWindowDays: 1 });
    expect(readInviteCandidate()).toEqual({
      code: 'DAY234',
      ts: NOW,
      expiresAt: NOW + DAY,
    });

    saveInviteCode('LONG234', { bindWindowDays: 60 });
    expect(readInviteCandidate()).toEqual({
      code: 'LONG234',
      ts: NOW,
      expiresAt: NOW + 60 * DAY,
    });
  });

  it('localStorage 的读、写、删除异常都不会阻断正常流程', () => {
    const set = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveInviteCode('ABC234')).not.toThrow();
    set.mockRestore();

    const get = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => { throw new Error('privacy'); });
    expect(readInviteCandidate()).toBeNull();
    get.mockRestore();

    const remove = vi
      .spyOn(window.localStorage, 'removeItem')
      .mockImplementation(() => { throw new Error('blocked'); });
    expect(() => clearInviteCode()).not.toThrow();
    remove.mockRestore();
  });
});

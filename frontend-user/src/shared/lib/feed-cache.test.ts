// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistFeedPages, readFeedPages } from './feed-cache';

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

describe('feed cache render-before-fetch hydration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('同 seed 的有效页能同步作为 infinite query initialData', () => {
    const pages = [[{ paperId: 'p-1', title: 'cached' }]];
    persistFeedPages('papers', 42, pages, [0]);

    expect(readFeedPages<typeof pages[number], number>('papers', 42)).toEqual({
      pages,
      pageParams: [0],
    });
  });

  it('拒绝错 seed、过期和空内容，让 query 正常走网络', () => {
    persistFeedPages('papers', 42, [[{ paperId: 'p-1' }]], [0]);
    expect(readFeedPages('papers', 7)).toBeUndefined();

    vi.setSystemTime(new Date('2026-08-11T00:00:00.001Z'));
    expect(readFeedPages('papers', 42)).toBeUndefined();

    persistFeedPages('empty', 42, [[]], [0]);
    expect(readFeedPages('empty', 42)).toBeUndefined();
  });
});

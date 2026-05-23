/**
 * 通用 API 缓存工具
 *
 * 提供模块级别（跨组件生命周期）的内存缓存，用于减少重复 API 请求。
 * 支持 TTL 自动过期、LRU 淘汰、命名空间隔离。
 *
 * 用法：
 *   const cache = createCache<MyData>({ maxSize: 100, ttl: 5 * 60 * 1000, name: 'papers' });
 *   cache.set('key', data);
 *   const data = cache.get('key'); // null if expired/missing
 */

export interface CacheOptions {
  maxSize?: number;
  ttl?: number;
  name?: string;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

export interface Cache<T> {
  get(key: string): T | null;
  set(key: string, data: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  deleteByPrefix(prefix: string): void;
  clear(): void;
  readonly size: number;
  readonly name: string;
}

/**
 * 创建一个带 TTL 和 LRU 淘汰的缓存实例
 */
export function createCache<T = unknown>({
  maxSize = 100,
  ttl = 5 * 60 * 1000,
  name = 'cache',
}: CacheOptions = {}): Cache<T> {
  const store = new Map<string, CacheEntry<T>>();

  function evictOldest(): void {
    if (store.size >= maxSize) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) {
        store.delete(oldest);
      }
    }
  }

  const cache: Cache<T> = {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > ttl) {
        store.delete(key);
        return null;
      }
      // LRU: 重新插入到末尾
      store.delete(key);
      store.set(key, entry);
      return entry.data;
    },

    set(key: string, data: T): void {
      store.delete(key);
      evictOldest();
      store.set(key, { data, ts: Date.now() });
    },

    has(key: string): boolean {
      return cache.get(key) !== null;
    },

    delete(key: string): void {
      store.delete(key);
    },

    deleteByPrefix(prefix: string): void {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },

    clear(): void {
      store.clear();
    },

    get size(): number {
      return store.size;
    },

    name,
  };

  return cache;
}

// ======================== 预定义的全局缓存实例 ========================

export const paperDetailCache = createCache({
  maxSize: 50,
  ttl: 5 * 60 * 1000,
  name: 'paperDetail',
});

export const citationsCache = createCache({
  maxSize: 200,
  ttl: 5 * 60 * 1000,
  name: 'citations',
});

export const referencesCache = createCache({
  maxSize: 200,
  ttl: 5 * 60 * 1000,
  name: 'references',
});

export const similarPapersCache = createCache({
  maxSize: 100,
  ttl: 10 * 60 * 1000,
  name: 'similarPapers',
});

export const recommendationIdsCache = createCache({
  maxSize: 50,
  ttl: 10 * 60 * 1000,
  name: 'recommendationIds',
});

export const authorDetailCache = createCache({
  maxSize: 30,
  ttl: 5 * 60 * 1000,
  name: 'authorDetail',
});

export const authorPapersCache = createCache({
  maxSize: 100,
  ttl: 5 * 60 * 1000,
  name: 'authorPapers',
});

export const searchResultsCache = createCache({
  maxSize: 50,
  ttl: 10 * 60 * 1000,
  name: 'searchResults',
});

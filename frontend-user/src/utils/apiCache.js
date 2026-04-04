/**
 * 通用 API 缓存工具
 *
 * 提供模块级别（跨组件生命周期）的内存缓存，用于减少重复 API 请求。
 * 支持 TTL 自动过期、LRU 淘汰、命名空间隔离。
 *
 * 用法：
 *   const cache = createCache({ maxSize: 100, ttl: 5 * 60 * 1000, name: 'papers' });
 *   cache.set('key', data);
 *   const data = cache.get('key'); // null if expired/missing
 */

/**
 * 创建一个带 TTL 和 LRU 淘汰的缓存实例
 * @param {object} options
 * @param {number} options.maxSize - 最大缓存条目数（默认 100）
 * @param {number} options.ttl - 过期时间（毫秒，默认 5 分钟）
 * @param {string} options.name - 缓存名称（用于调试日志）
 */
export function createCache({ maxSize = 100, ttl = 5 * 60 * 1000, name = 'cache' } = {}) {
  const store = new Map();

  function evictOldest() {
    if (store.size >= maxSize) {
      const oldest = store.keys().next().value;
      store.delete(oldest);
    }
  }

  return {
    /** 获取缓存，过期返回 null */
    get(key) {
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

    /** 设置缓存 */
    set(key, data) {
      store.delete(key); // 先删除旧值（如果有）
      evictOldest();
      store.set(key, { data, ts: Date.now() });
    },

    /** 检查是否存在且未过期 */
    has(key) {
      return this.get(key) !== null;
    },

    /** 删除单个 key */
    delete(key) {
      store.delete(key);
    },

    /** 按前缀批量删除（用于清除某论文/作者的所有缓存） */
    deleteByPrefix(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },

    /** 清空所有缓存 */
    clear() {
      store.clear();
    },

    /** 当前缓存大小 */
    get size() {
      return store.size;
    },

    /** 缓存名称 */
    name,
  };
}

// ======================== 预定义的全局缓存实例 ========================
// 模块级别，跨组件生命周期共享

/** 论文详情缓存 */
export const paperDetailCache = createCache({
  maxSize: 50,
  ttl: 5 * 60 * 1000,
  name: 'paperDetail',
});

/** 引用文献缓存（按 paperId + page 缓存） */
export const citationsCache = createCache({
  maxSize: 200,
  ttl: 5 * 60 * 1000,
  name: 'citations',
});

/** 参考文献缓存（按 paperId + page 缓存） */
export const referencesCache = createCache({
  maxSize: 200,
  ttl: 5 * 60 * 1000,
  name: 'references',
});

/** 相似论文缓存（按 paperId + page 缓存） */
export const similarPapersCache = createCache({
  maxSize: 100,
  ttl: 10 * 60 * 1000,
  name: 'similarPapers',
});

/** 推荐论文 ID 列表缓存（按 paperId 缓存） */
export const recommendationIdsCache = createCache({
  maxSize: 50,
  ttl: 10 * 60 * 1000,
  name: 'recommendationIds',
});

/** 作者详情缓存 */
export const authorDetailCache = createCache({
  maxSize: 30,
  ttl: 5 * 60 * 1000,
  name: 'authorDetail',
});

/** 作者论文缓存（按 authorId + page 缓存） */
export const authorPapersCache = createCache({
  maxSize: 100,
  ttl: 5 * 60 * 1000,
  name: 'authorPapers',
});

/** 搜索结果缓存（按 query + filters + page 缓存） */
export const searchResultsCache = createCache({
  maxSize: 50,
  ttl: 10 * 60 * 1000,
  name: 'searchResults',
});

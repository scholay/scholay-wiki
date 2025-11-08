import { useRef, useEffect, useCallback } from 'react';

/**
 * 防抖函数 - 延迟执行,多次调用只执行最后一次
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 节流函数 - 固定时间间隔执行,限制执行频率
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间间隔(毫秒)
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  let lastResult;

  return function throttled(...args) {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(this, args);

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    return lastResult;
  };
}

/**
 * React Hook: 使用防抖
 * @param {Function} callback - 回调函数
 * @param {number} delay - 延迟时间(毫秒)
 * @param {Array} deps - 依赖数组
 * @returns {Function} 防抖后的回调
 *
 * @example
 * const handleSearch = useDebounce((query) => {
 *   // API call
 * }, 500);
 */
export function useDebounce(callback, delay = 300, deps = []) {
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay, ...deps]);
}

/**
 * React Hook: 使用节流
 * @param {Function} callback - 回调函数
 * @param {number} limit - 时间间隔(毫秒)
 * @param {Array} deps - 依赖数组
 * @returns {Function} 节流后的回调
 *
 * @example
 * const handleScroll = useThrottle(() => {
 *   // Handle scroll
 * }, 100);
 */
export function useThrottle(callback, limit = 300, deps = []) {
  const inThrottleRef = useRef(false);

  return useCallback((...args) => {
    if (!inThrottleRef.current) {
      callback(...args);
      inThrottleRef.current = true;

      setTimeout(() => {
        inThrottleRef.current = false;
      }, limit);
    }
  }, [callback, limit, ...deps]);
}

/**
 * 请求去重 - 防止相同请求并发执行
 * @param {Function} requestFn - 返回 Promise 的请求函数
 * @returns {Function} 去重后的请求函数
 *
 * @example
 * const fetchData = dedupe(async (id) => {
 *   return await api.get(`/data/${id}`);
 * });
 */
export function dedupe(requestFn) {
  const pendingRequests = new Map();

  return async function deduped(...args) {
    const key = JSON.stringify(args);

    // 如果相同请求正在进行,返回同一个 Promise
    if (pendingRequests.has(key)) {
      return pendingRequests.get(key);
    }

    // 创建新请求
    const promise = requestFn(...args).finally(() => {
      pendingRequests.delete(key);
    });

    pendingRequests.set(key, promise);
    return promise;
  };
}

/**
 * React Hook: 使用请求去重
 * @param {Function} requestFn - 异步请求函数
 * @returns {Function} 去重后的请求函数
 *
 * @example
 * const fetchPaper = useDedupe(async (paperId) => {
 *   return await api.get(`/papers/${paperId}`);
 * });
 */
export function useDedupe(requestFn) {
  const pendingRef = useRef(new Map());

  useEffect(() => {
    return () => {
      // 组件卸载时清理待处理请求
      pendingRef.current.clear();
    };
  }, []);

  return useCallback(async (...args) => {
    const key = JSON.stringify(args);

    if (pendingRef.current.has(key)) {
      return pendingRef.current.get(key);
    }

    const promise = requestFn(...args).finally(() => {
      pendingRef.current.delete(key);
    });

    pendingRef.current.set(key, promise);
    return promise;
  }, [requestFn]);
}

/**
 * 简单的LRU缓存实现
 */
export class LRUCache {
  constructor(capacity = 50) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    // LRU: 移到最后
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  set(key, value) {
    // 删除旧的
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 添加新的
    this.cache.set(key, value);

    // 超过容量,删除最旧的
    if (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * 带过期时间的缓存
 */
export class TTLCache {
  constructor(ttl = 5 * 60 * 1000) { // 默认5分钟
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, customTTL) {
    const ttl = customTTL || this.ttl;
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // 清理过期项
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * React Hook: 使用带TTL的缓存
 * @param {number} ttl - 缓存时间(毫秒)
 * @returns {TTLCache} 缓存实例
 */
export function useTTLCache(ttl = 5 * 60 * 1000) {
  const cacheRef = useRef(null);

  if (!cacheRef.current) {
    cacheRef.current = new TTLCache(ttl);
  }

  useEffect(() => {
    const cache = cacheRef.current;

    // 定期清理过期项(每分钟)
    const interval = setInterval(() => {
      cache.cleanup();
    }, 60 * 1000);

    return () => {
      clearInterval(interval);
      cache.clear();
    };
  }, []);

  return cacheRef.current;
}

/**
 * 批量请求合并 - 将多个请求合并为一次批量请求
 * @param {Function} batchFn - 批量请求函数,接收ID数组,返回结果数组
 * @param {Object} options - 配置选项
 * @returns {Function} 合并后的请求函数
 */
export function batchRequests(batchFn, options = {}) {
  const {
    maxBatchSize = 50,    // 最大批量大小
    maxWaitTime = 50,     // 最大等待时间(毫秒)
  } = options;

  let batch = [];
  let timeoutId = null;

  const executeBatch = async () => {
    if (batch.length === 0) return;

    const currentBatch = batch;
    batch = [];

    try {
      const ids = currentBatch.map(item => item.id);
      const results = await batchFn(ids);

      // 分发结果
      currentBatch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      currentBatch.forEach(item => {
        item.reject(error);
      });
    }
  };

  return function batched(id) {
    return new Promise((resolve, reject) => {
      batch.push({ id, resolve, reject });

      if (batch.length >= maxBatchSize) {
        // 达到批量大小,立即执行
        clearTimeout(timeoutId);
        executeBatch();
      } else if (!timeoutId) {
        // 设置定时器,等待更多请求
        timeoutId = setTimeout(() => {
          timeoutId = null;
          executeBatch();
        }, maxWaitTime);
      }
    });
  };
}

export default {
  debounce,
  throttle,
  useDebounce,
  useThrottle,
  dedupe,
  useDedupe,
  LRUCache,
  TTLCache,
  useTTLCache,
  batchRequests
};

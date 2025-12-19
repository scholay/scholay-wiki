/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useImagePreload - 图片预加载 Hook
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * 预加载单张图片
 * @param {string} src - 图片地址
 * @returns {Promise<HTMLImageElement>}
 */
const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * 图片预加载 Hook
 * @param {string|string[]} sources - 图片地址或地址数组
 * @param {Object} options - 配置选项
 * @param {boolean} options.lazy - 是否懒加载（默认 false）
 * @param {number} options.delay - 延迟加载时间（毫秒）
 */
const useImagePreload = (sources, options = {}) => {
  const { lazy = false, delay = 0 } = options;
  
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  // 将单个源转换为数组 - 使用 useMemo 缓存
  const sourceArray = useMemo(() => {
    return Array.isArray(sources) ? sources : (sources ? [sources] : []);
  }, [sources]);

  // 加载图片
  const loadImages = useCallback(async () => {
    if (sourceArray.length === 0) {
      setLoaded(true);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      let loadedCount = 0;
      
      await Promise.all(
        sourceArray.map(async (src) => {
          try {
            await preloadImage(src);
            loadedCount++;
            if (mountedRef.current) {
              setProgress(Math.round((loadedCount / sourceArray.length) * 100));
            }
          } catch (err) {
            console.warn(`Failed to preload image: ${src}`, err);
            // 单个图片加载失败不影响整体
            loadedCount++;
            if (mountedRef.current) {
              setProgress(Math.round((loadedCount / sourceArray.length) * 100));
            }
          }
        })
      );

      if (mountedRef.current) {
        setLoaded(true);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [sourceArray]);

  // 自动加载
  useEffect(() => {
    mountedRef.current = true;

    if (lazy) {
      // 懒加载模式：不自动加载
      return;
    }

    if (delay > 0) {
      const timer = setTimeout(loadImages, delay);
      return () => {
        clearTimeout(timer);
        mountedRef.current = false;
      };
    }

    loadImages();

    return () => {
      mountedRef.current = false;
    };
  }, [lazy, delay, loadImages]);

  // 手动触发加载
  const startLoad = useCallback(() => {
    if (!loaded && !loading) {
      loadImages();
    }
  }, [loaded, loading, loadImages]);

  return {
    loaded,
    loading,
    error,
    progress,
    startLoad,
  };
};

/**
 * 批量预加载图片
 * @param {string[]} sources - 图片地址数组
 * @param {Object} options - 配置选项
 * @param {number} options.concurrency - 并发数（默认 3）
 */
export const preloadImages = async (sources, options = {}) => {
  const { concurrency = 3 } = options;
  
  const results = [];
  const queue = [...sources];
  
  const worker = async () => {
    while (queue.length > 0) {
      const src = queue.shift();
      try {
        await preloadImage(src);
        results.push({ src, success: true });
      } catch (err) {
        results.push({ src, success: false, error: err });
      }
    }
  };

  // 创建多个 worker 并发加载
  const workers = Array(Math.min(concurrency, sources.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  
  return results;
};

export default useImagePreload;


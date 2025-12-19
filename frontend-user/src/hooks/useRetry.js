/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useRetry - 带重试功能的异步操作 Hook
 */

import { useState, useCallback, useRef } from 'react';

/**
 * 重试 Hook
 * @param {Function} asyncFn - 异步函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认 3
 * @param {number} options.retryDelay - 重试延迟（毫秒），默认 1000
 * @param {boolean} options.exponentialBackoff - 是否使用指数退避，默认 true
 * @param {Function} options.onRetry - 重试时的回调
 * @param {Function} options.shouldRetry - 判断是否应该重试的函数
 */
const useRetry = (asyncFn, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    onRetry,
    shouldRetry = (error) => {
      // 默认只对网络错误和 5xx 错误重试
      if (!error) return false;
      if (error.message?.includes('Network Error')) return true;
      if (error.response?.status >= 500) return true;
      return false;
    },
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // 计算延迟时间
  const getDelay = useCallback((attempt) => {
    if (exponentialBackoff) {
      return retryDelay * Math.pow(2, attempt);
    }
    return retryDelay;
  }, [retryDelay, exponentialBackoff]);

  // 延迟函数
  const delay = useCallback((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  // 执行请求
  const execute = useCallback(async (...args) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setRetryCount(0);

    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await asyncFn(...args, { signal: abortControllerRef.current.signal });
        
        if (isMountedRef.current) {
          setData(result);
          setLoading(false);
        }
        return result;
      } catch (err) {
        lastError = err;

        // 如果是取消请求，直接返回
        if (err.name === 'AbortError' || err.message === 'canceled') {
          if (isMountedRef.current) {
            setLoading(false);
          }
          return;
        }

        // 判断是否应该重试
        if (attempt < maxRetries && shouldRetry(err)) {
          if (isMountedRef.current) {
            setRetryCount(attempt + 1);
          }
          onRetry?.(attempt + 1, err);
          await delay(getDelay(attempt));
          attempt++;
        } else {
          break;
        }
      }
    }

    if (isMountedRef.current) {
      setError(lastError);
      setLoading(false);
    }
    throw lastError;
  }, [asyncFn, maxRetries, shouldRetry, onRetry, delay, getDelay]);

  // 手动重试
  const retry = useCallback(async (...args) => {
    return execute(...args);
  }, [execute]);

  // 取消请求
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // 重置状态
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
    setRetryCount(0);
  }, []);

  return {
    execute,
    retry,
    cancel,
    reset,
    loading,
    error,
    data,
    retryCount,
    isRetrying: retryCount > 0 && loading,
  };
};

export default useRetry;


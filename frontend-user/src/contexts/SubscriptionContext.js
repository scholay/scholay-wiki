/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 注意：配额系统（usage/quota）已废弃，现在使用货币系统（经费）进行扣费控制
 * usageData、quotaData 及相关方法保留用于向后兼容，但不再执行实际功能
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as subscriptionAPI from '../services/subscriptionService';
import logger from '../utils/logger';

const SubscriptionContext = createContext();

// 缓存有效期：5分钟
const CACHE_TTL = 5 * 60 * 1000;

export const SubscriptionProvider = ({ children }) => {
  const [subscriptionData, setSubscriptionData] = useState(null);
  // Deprecated: 配额统计已废弃
  const [usageData, setUsageData] = useState(null);
  const [quotaData, setQuotaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 缓存时间戳
  const lastFetchTime = useRef({
    subscription: 0,
    usage: 0,
    quota: 0
  });

  // 防止并发请求
  const fetchingRef = useRef({
    subscription: false,
    usage: false,
    quota: false
  });

  /**
   * 获取订阅信息
   * @param {boolean} force - 是否强制刷新缓存
   */
  const fetchSubscription = useCallback(async (force = false) => {
    const now = Date.now();
    const cacheKey = 'subscription';

    // 检查缓存
    if (!force && subscriptionData && (now - lastFetchTime.current[cacheKey] < CACHE_TTL)) {
      return subscriptionData;
    }

    // 防止并发请求
    if (fetchingRef.current[cacheKey]) {
      return subscriptionData;
    }

    try {
      fetchingRef.current[cacheKey] = true;
      setLoading(true);
      setError(null);

      const response = await subscriptionAPI.getMySubscription();
      if (response.data.code === 0) {
        const data = response.data.data;
        setSubscriptionData(data);
        lastFetchTime.current[cacheKey] = now;
        return data;
      } else {
        throw new Error(response.data.message || '获取订阅信息失败');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || '获取订阅信息失败';
      setError(errorMsg);
      logger.error('Failed to fetch subscription:', err);
      return null;
    } finally {
      setLoading(false);
      fetchingRef.current[cacheKey] = false;
    }
  }, [subscriptionData]);

  /**
   * 获取使用情况
   * @param {boolean} force - 是否强制刷新缓存
   */
  const fetchUsage = useCallback(async (force = false) => {
    const now = Date.now();
    const cacheKey = 'usage';

    // 检查缓存
    if (!force && usageData && (now - lastFetchTime.current[cacheKey] < CACHE_TTL)) {
      return usageData;
    }

    // 防止并发请求
    if (fetchingRef.current[cacheKey]) {
      return usageData;
    }

    try {
      fetchingRef.current[cacheKey] = true;
      setLoading(true);
      setError(null);

      const response = await subscriptionAPI.getUsage();
      if (response.data.code === 0) {
        const data = response.data.data;
        setUsageData(data);
        lastFetchTime.current[cacheKey] = now;
        return data;
      } else {
        throw new Error(response.data.message || '获取使用情况失败');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || '获取使用情况失败';
      setError(errorMsg);
      logger.error('Failed to fetch usage:', err);
      return null;
    } finally {
      setLoading(false);
      fetchingRef.current[cacheKey] = false;
    }
  }, [usageData]);

  /**
   * 获取配额信息
   * @param {boolean} force - 是否强制刷新缓存
   */
  const fetchQuota = useCallback(async (force = false) => {
    const now = Date.now();
    const cacheKey = 'quota';

    // 检查缓存
    if (!force && quotaData && (now - lastFetchTime.current[cacheKey] < CACHE_TTL)) {
      return quotaData;
    }

    // 防止并发请求
    if (fetchingRef.current[cacheKey]) {
      return quotaData;
    }

    try {
      fetchingRef.current[cacheKey] = true;
      setLoading(true);
      setError(null);

      const response = await subscriptionAPI.getQuota();
      if (response.data.code === 0) {
        const data = response.data.data;
        setQuotaData(data);
        lastFetchTime.current[cacheKey] = now;
        return data;
      } else {
        throw new Error(response.data.message || '获取配额信息失败');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || '获取配额信息失败';
      setError(errorMsg);
      logger.error('Failed to fetch quota:', err);
      return null;
    } finally {
      setLoading(false);
      fetchingRef.current[cacheKey] = false;
    }
  }, [quotaData]);

  /**
   * 批量获取所有数据（并行）
   * @param {boolean} force - 是否强制刷新缓存
   */
  const fetchAll = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);

      const [subscription, usage, quota] = await Promise.all([
        fetchSubscription(force),
        fetchUsage(force),
        fetchQuota(force)
      ]);

      return { subscription, usage, quota };
    } catch (err) {
      setError(err.message || '获取数据失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchSubscription, fetchUsage, fetchQuota]);

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    setSubscriptionData(null);
    setUsageData(null);
    setQuotaData(null);
    lastFetchTime.current = {
      subscription: 0,
      usage: 0,
      quota: 0
    };
  }, []);

  /**
   * 更新使用量（扣减配额后调用）
   * @param {object} updates - 要更新的使用量字段
   */
  const incrementUsage = useCallback((updates) => {
    setUsageData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ...updates
      };
    });
  }, []);

  const value = {
    // 数据
    subscriptionData,
    usageData,
    quotaData,
    loading,
    error,

    // 方法
    fetchSubscription,
    fetchUsage,
    fetchQuota,
    fetchAll,
    clearCache,
    incrementUsage,

    // 辅助方法
    isSubscriptionValid: subscriptionData?.status === 'active',
    hasQuotaRemaining: (quotaType) => {
      if (!usageData || !subscriptionData) return false;
      const used = usageData[quotaType] || 0;
      const quota = subscriptionData[`${quotaType}_quota`];
      return quota === -1 || used < quota; // -1 表示无限制
    }
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

/**
 * 使用订阅上下文的 Hook
 */
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export default SubscriptionContext;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 版本检测 Hook
 * 
 * 功能：
 * 1. 定期检查服务器上的版本文件
 * 2. 当检测到新版本时触发回调
 * 3. 页面可见性变化时检查版本
 * 4. 支持用户忽略更新提示（1小时内不再提示）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger';

// 版本检测间隔（毫秒）- 默认 5 分钟
const CHECK_INTERVAL = 5 * 60 * 1000;

// 忽略更新后的静默期（毫秒）- 1 小时
const IGNORE_DURATION = 60 * 60 * 1000;

// 本地存储 key
const STORAGE_KEY_VERSION = 'app_current_version';
const STORAGE_KEY_IGNORE_UNTIL = 'app_version_ignore_until';

/**
 * 版本检测 Hook
 * @param {Object} options 配置选项
 * @param {number} options.checkInterval 检测间隔（毫秒），默认 5 分钟
 * @param {boolean} options.enabled 是否启用版本检测，默认 true
 * @returns {Object} { hasUpdate, isChecking, checkNow, ignoreUpdate, currentVersion, serverVersion }
 */
const useVersionCheck = (options = {}) => {
  const {
    checkInterval = CHECK_INTERVAL,
    enabled = true
  } = options;

  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [serverVersion, setServerVersion] = useState(null);
  
  const checkInProgressRef = useRef(false);
  const intervalRef = useRef(null);

  /**
   * 检查是否在忽略期内
   */
  const isInIgnorePeriod = useCallback(() => {
    try {
      const ignoreUntil = localStorage.getItem(STORAGE_KEY_IGNORE_UNTIL);
      if (ignoreUntil) {
        return Date.now() < parseInt(ignoreUntil, 10);
      }
    } catch (e) {
      // localStorage 不可用
    }
    return false;
  }, []);

  /**
   * 获取当前本地版本
   */
  const getLocalVersion = useCallback(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_VERSION);
    } catch (e) {
      return null;
    }
  }, []);

  /**
   * 保存当前版本到本地
   */
  const saveLocalVersion = useCallback((version) => {
    try {
      localStorage.setItem(STORAGE_KEY_VERSION, version);
    } catch (e) {
      // localStorage 不可用
    }
  }, []);

  /**
   * 检查版本更新
   */
  const checkVersion = useCallback(async () => {
    // 防止并发检查
    if (checkInProgressRef.current) {
      return;
    }

    // 如果在忽略期内，不检查
    if (isInIgnorePeriod()) {
      logger.log('[VersionCheck] In ignore period, skipping check');
      return;
    }

    checkInProgressRef.current = true;
    setIsChecking(true);

    try {
      // 添加时间戳防止缓存
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const fetchedVersion = data.version;

      setServerVersion(fetchedVersion);

      // 获取本地保存的版本
      const localVersion = getLocalVersion();

      if (!localVersion) {
        // 首次访问，保存当前版本
        saveLocalVersion(fetchedVersion);
        setCurrentVersion(fetchedVersion);
        logger.log('[VersionCheck] First visit, saved version:', fetchedVersion);
      } else if (localVersion !== fetchedVersion) {
        // 版本不一致，检测到更新
        setCurrentVersion(localVersion);
        setHasUpdate(true);
        logger.log('[VersionCheck] Update detected!', {
          local: localVersion,
          server: fetchedVersion
        });
      } else {
        // 版本一致
        setCurrentVersion(localVersion);
        setHasUpdate(false);
        logger.log('[VersionCheck] Version up to date:', localVersion);
      }
    } catch (error) {
      logger.error('[VersionCheck] Failed to check version:', error);
      // 检查失败不影响用户使用
    } finally {
      checkInProgressRef.current = false;
      setIsChecking(false);
    }
  }, [getLocalVersion, saveLocalVersion, isInIgnorePeriod]);

  /**
   * 用户忽略更新
   */
  const ignoreUpdate = useCallback(() => {
    try {
      const ignoreUntil = Date.now() + IGNORE_DURATION;
      localStorage.setItem(STORAGE_KEY_IGNORE_UNTIL, ignoreUntil.toString());
      setHasUpdate(false);
      logger.log('[VersionCheck] Update ignored until:', new Date(ignoreUntil).toISOString());
    } catch (e) {
      // localStorage 不可用
    }
  }, []);

  /**
   * 用户确认更新（刷新页面）
   */
  const confirmUpdate = useCallback(() => {
    // 更新本地版本号后刷新
    if (serverVersion) {
      saveLocalVersion(serverVersion);
    }
    // 清除忽略状态
    try {
      localStorage.removeItem(STORAGE_KEY_IGNORE_UNTIL);
    } catch (e) {
      // ignore
    }
    // 强制刷新页面
    window.location.reload();
  }, [serverVersion, saveLocalVersion]);

  // 启动定期检查
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 首次检查（延迟 3 秒，等待页面加载完成）
    const initialTimeout = setTimeout(() => {
      checkVersion();
    }, 3000);

    // 定期检查
    intervalRef.current = setInterval(() => {
      checkVersion();
    }, checkInterval);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, checkInterval, checkVersion]);

  // 页面可见性变化时检查
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        logger.log('[VersionCheck] Page became visible, checking version...');
        checkVersion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, checkVersion]);

  return {
    hasUpdate,
    isChecking,
    checkNow: checkVersion,
    ignoreUpdate,
    confirmUpdate,
    currentVersion,
    serverVersion
  };
};

export default useVersionCheck;

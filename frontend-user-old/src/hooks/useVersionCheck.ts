/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 版本检测 Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger';

const CHECK_INTERVAL = 5 * 60 * 1000;
const IGNORE_DURATION = 60 * 60 * 1000;

const STORAGE_KEY_VERSION = 'app_current_version';
const STORAGE_KEY_IGNORE_UNTIL = 'app_version_ignore_until';

export interface UseVersionCheckOptions {
  checkInterval?: number;
  enabled?: boolean;
}

export interface UseVersionCheckResult {
  hasUpdate: boolean;
  isChecking: boolean;
  checkNow: () => Promise<void>;
  ignoreUpdate: () => void;
  confirmUpdate: () => void;
  currentVersion: string | null;
  serverVersion: string | null;
}

const useVersionCheck = (options: UseVersionCheckOptions = {}): UseVersionCheckResult => {
  const { checkInterval = CHECK_INTERVAL, enabled = true } = options;

  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  const checkInProgressRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isInIgnorePeriod = useCallback((): boolean => {
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

  const getLocalVersion = useCallback((): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY_VERSION);
    } catch (e) {
      return null;
    }
  }, []);

  const saveLocalVersion = useCallback((version: string): void => {
    try {
      localStorage.setItem(STORAGE_KEY_VERSION, version);
    } catch (e) {
      // localStorage 不可用
    }
  }, []);

  const isPageJustLoaded = useCallback((): boolean => {
    return performance.now() < 10000;
  }, []);

  const checkVersion = useCallback(async (): Promise<void> => {
    if (checkInProgressRef.current) {
      return;
    }

    if (isInIgnorePeriod()) {
      logger.log('[VersionCheck] In ignore period, skipping check');
      return;
    }

    checkInProgressRef.current = true;
    setIsChecking(true);

    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { version: string };
      const fetchedVersion = data.version;

      setServerVersion(fetchedVersion);

      const localVersion = getLocalVersion();

      if (!localVersion) {
        saveLocalVersion(fetchedVersion);
        setCurrentVersion(fetchedVersion);
        logger.log('[VersionCheck] First visit, saved version:', fetchedVersion);
      } else if (localVersion !== fetchedVersion) {
        if (isPageJustLoaded()) {
          saveLocalVersion(fetchedVersion);
          setCurrentVersion(fetchedVersion);
          setHasUpdate(false);
          logger.log('[VersionCheck] Page just loaded, auto-updated version:', fetchedVersion);
        } else {
          setCurrentVersion(localVersion);
          setHasUpdate(true);
          logger.log('[VersionCheck] Update detected!', {
            local: localVersion,
            server: fetchedVersion,
          });
        }
      } else {
        setCurrentVersion(localVersion);
        setHasUpdate(false);
        logger.log('[VersionCheck] Version up to date:', localVersion);
      }
    } catch (error) {
      logger.error('[VersionCheck] Failed to check version:', error);
    } finally {
      checkInProgressRef.current = false;
      setIsChecking(false);
    }
  }, [getLocalVersion, saveLocalVersion, isInIgnorePeriod, isPageJustLoaded]);

  const ignoreUpdate = useCallback((): void => {
    try {
      const ignoreUntil = Date.now() + IGNORE_DURATION;
      localStorage.setItem(STORAGE_KEY_IGNORE_UNTIL, ignoreUntil.toString());
      setHasUpdate(false);
      logger.log('[VersionCheck] Update ignored until:', new Date(ignoreUntil).toISOString());
    } catch (e) {
      // localStorage 不可用
    }
  }, []);

  const confirmUpdate = useCallback((): void => {
    if (serverVersion) {
      saveLocalVersion(serverVersion);
    }
    try {
      localStorage.removeItem(STORAGE_KEY_IGNORE_UNTIL);
    } catch (e) {
      // ignore
    }
    window.location.reload();
  }, [serverVersion, saveLocalVersion]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const initialTimeout = setTimeout(() => {
      checkVersion();
    }, 3000);

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
    serverVersion,
  };
};

export default useVersionCheck;

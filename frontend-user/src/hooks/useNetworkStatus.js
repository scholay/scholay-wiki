/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useNetworkStatus - 网络状态监测 Hook
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * 网络状态 Hook
 * @returns {Object} 网络状态对象
 */
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    // 如果之前离线过，标记为恢复在线
    if (!isOnline) {
      setWasOffline(true);
      // 3秒后重置 wasOffline 状态
      setTimeout(() => setWasOffline(false), 3000);
    }
  }, [isOnline]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline, // 刚从离线恢复
  };
};

export default useNetworkStatus;


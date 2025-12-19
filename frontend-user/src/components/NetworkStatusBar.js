/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * NetworkStatusBar - 网络状态提示栏组件
 */

import React, { memo } from 'react';
import { useNetworkStatus } from '../hooks';
import './NetworkStatusBar.css';

const NetworkStatusBar = memo(() => {
  const { isOffline, wasOffline } = useNetworkStatus();

  if (!isOffline && !wasOffline) {
    return null;
  }

  return (
    <div className={`network-status-bar ${isOffline ? 'offline' : 'online'}`}>
      {isOffline ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>网络连接已断开，请检查您的网络设置</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>网络已恢复连接</span>
        </>
      )}
    </div>
  );
});

NetworkStatusBar.displayName = 'NetworkStatusBar';

export default NetworkStatusBar;


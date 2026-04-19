/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 版本更新提示条组件
 * 
 * 当检测到新版本时，在页面顶部显示一个不打扰的提示条，
 * 用户可以选择立即刷新或稍后再说。
 */

import React, { memo } from 'react';
import './VersionUpdateBar.css';

const VersionUpdateBar = memo(({ onRefresh, onDismiss }) => {
  return (
    <div className="version-update-bar">
      <div className="version-update-content">
        <div className="version-update-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9"/>
            <path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 9-9"/>
            <path d="m3 12 3-3"/>
            <path d="M3 12v3"/>
            <path d="m21 12-3 3"/>
            <path d="M21 12v-3"/>
          </svg>
        </div>
        <span className="version-update-text">
          发现新版本，刷新页面获取最新功能
        </span>
        <div className="version-update-actions">
          <button 
            className="version-update-btn version-update-btn-primary"
            onClick={onRefresh}
          >
            立即刷新
          </button>
          <button 
            className="version-update-btn version-update-btn-secondary"
            onClick={onDismiss}
          >
            稍后
          </button>
        </div>
      </div>
    </div>
  );
});

VersionUpdateBar.displayName = 'VersionUpdateBar';

export default VersionUpdateBar;

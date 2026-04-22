/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 版本更新提示组件
 *
 * 当检测到新版本时，在页面顶部居中显示一个浮动卡片提示，
 * 用户可选择立即刷新或暂时关闭。
 */

import React, { memo } from 'react';
import './VersionUpdateBar.css';

const VersionUpdateBar = memo(({ onRefresh, onDismiss }) => {
  return (
    <div className="vu-wrap" role="status" aria-live="polite">
      <div className="vu-card">
        <div className="vu-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4" />
            <path d="m16.24 7.76 2.83-2.83" />
            <path d="M18 12h4" />
            <path d="m16.24 16.24 2.83 2.83" />
            <path d="M12 18v4" />
            <path d="m7.76 16.24-2.83 2.83" />
            <path d="M6 12H2" />
            <path d="m7.76 7.76-2.83-2.83" />
          </svg>
        </div>

        <div className="vu-copy">
          <div className="vu-title">新版本已上线</div>
          <div className="vu-desc">刷新页面即可使用最新功能</div>
        </div>

        <div className="vu-actions">
          <button
            type="button"
            className="vu-btn vu-btn-primary"
            onClick={onRefresh}
          >
            立即刷新
          </button>
          <button
            type="button"
            className="vu-btn vu-btn-close"
            onClick={onDismiss}
            aria-label="稍后提醒"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

VersionUpdateBar.displayName = 'VersionUpdateBar';

export default VersionUpdateBar;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import './CTABanner.css';

const CTABanner = () => {
  const handleOpenGuide = () => {
    // 调用FloatingGuide的打开方法
    if (window.openFloatingGuide) {
      window.openFloatingGuide();
    }
  };

  const handleGoToHome = () => {
    // 跳转到首页
    window.location.href = '/';
  };

  return (
    <div className="cta-banner" onClick={handleGoToHome} style={{ cursor: 'pointer' }}>
      <div className="cta-banner-content">
        <div className="cta-banner-left">
          <span className="cta-banner-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
            AI 功能
          </span>
          <span className="cta-banner-text">
            <strong>探索 Scholay AI 学术搜索</strong> - 智能文献检索、深度论文分析、引用图谱可视化
          </span>
        </div>
        <div className="cta-banner-right">
          <button 
            className="cta-banner-btn primary"
            onClick={(e) => {
              e.stopPropagation(); // 阻止冒泡，避免触发横幅的点击
              handleOpenGuide();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
            </svg>
            <span>观看演示</span>
          </button>
          <button 
            className="cta-banner-btn secondary"
            onClick={(e) => {
              e.stopPropagation(); // 阻止冒泡
              handleGoToHome();
            }}
          >
            <span>立即体验</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CTABanner;
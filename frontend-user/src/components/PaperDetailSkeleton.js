/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import './PaperDetailSkeleton.css';

const PaperDetailSkeleton = () => {
  return (
    <div className="paper-detail-skeleton">
      {/* DOI 和 Corpus ID */}
      <div className="pds-meta-ids">
        <div className="pds-meta-id skeleton-shimmer"></div>
        <div className="pds-meta-id skeleton-shimmer"></div>
      </div>

      {/* 标题 */}
      <div className="pds-title skeleton-shimmer"></div>
      <div className="pds-title-second skeleton-shimmer"></div>

      {/* 作者和出版信息 */}
      <div className="pds-pub-meta">
        <div className="pds-author skeleton-shimmer"></div>
        <div className="pds-author skeleton-shimmer"></div>
        <div className="pds-author skeleton-shimmer"></div>
        <div className="pds-venue skeleton-shimmer"></div>
      </div>

      {/* TLDR */}
      <div className="pds-tldr">
        <div className="pds-tldr-badge skeleton-shimmer"></div>
        <div className="pds-tldr-text skeleton-shimmer"></div>
        <div className="pds-tldr-text skeleton-shimmer" style={{ width: '80%' }}></div>
      </div>

      {/* 摘要 */}
      <div className="pds-section">
        <div className="pds-section-title skeleton-shimmer"></div>
        <div className="pds-abstract-line skeleton-shimmer"></div>
        <div className="pds-abstract-line skeleton-shimmer"></div>
        <div className="pds-abstract-line skeleton-shimmer"></div>
        <div className="pds-abstract-line skeleton-shimmer" style={{ width: '70%' }}></div>
      </div>

      {/* 操作按钮 */}
      <div className="pds-actions">
        <div className="pds-action-btn skeleton-shimmer"></div>
        <div className="pds-action-btn skeleton-shimmer"></div>
        <div className="pds-action-btn skeleton-shimmer"></div>
        <div className="pds-action-btn skeleton-shimmer"></div>
      </div>

      {/* Tabs */}
      <div className="pds-tabs">
        <div className="pds-tab skeleton-shimmer"></div>
        <div className="pds-tab skeleton-shimmer"></div>
        <div className="pds-tab skeleton-shimmer"></div>
      </div>

      {/* 论文列表骨架 */}
      <div className="pds-papers-list">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="pds-paper-item">
            <div className="pds-paper-title skeleton-shimmer"></div>
            <div className="pds-paper-authors skeleton-shimmer"></div>
            <div className="pds-paper-abstract skeleton-shimmer"></div>
            <div className="pds-paper-abstract skeleton-shimmer" style={{ width: '85%' }}></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PaperDetailSkeleton;


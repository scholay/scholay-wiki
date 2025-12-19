/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { memo } from 'react';
import './PaperListSkeleton.css';

const PaperListSkeleton = memo(() => {
  // Create an array of 10 skeleton items
  const skeletonItems = Array(10).fill(null);

  return (
    <div className="paper-list-skeleton">
      {skeletonItems.map((_, index) => (
        <div key={index} className="skeleton-paper-card">
          <div className="skeleton-content">
          <div className="skeleton-header">
            <div className="skeleton-title skeleton-shimmer"></div>
            <div className="skeleton-title-second skeleton-shimmer"></div>
          </div>
          <div className="skeleton-meta">
            <div className="skeleton-authors skeleton-shimmer"></div>
          </div>
          <div className="skeleton-abstract">
            <div className="skeleton-line skeleton-shimmer"></div>
              <div className="skeleton-line skeleton-shimmer" style={{ width: '90%' }}></div>
          </div>
          <div className="skeleton-footer">
            <div className="skeleton-badge skeleton-shimmer"></div>
            <div className="skeleton-badge skeleton-shimmer"></div>
            <div className="skeleton-badge skeleton-shimmer"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

PaperListSkeleton.displayName = 'PaperListSkeleton';

export default PaperListSkeleton;

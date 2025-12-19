/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperDetailTabs - 论文详情标签页组件
 * 用于显示引用文献、参考文献、相似论文
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

const TAB_CONFIG = {
  citations: {
    label: '引用文献',
    icon: null,
  },
  references: {
    label: '参考文献',
    icon: null,
  },
  similar: {
    label: '相似论文',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
      </svg>
    ),
  },
};

const PaperDetailTabs = memo(({
  activeTab = 'citations',
  onTabChange,
  citationCount = 0,
  referenceCount = 0,
  similarCount = 0,
  className = '',
}) => {
  const counts = {
    citations: citationCount,
    references: referenceCount,
    similar: similarCount,
  };

  return (
    <div className={`epd-tabs ${className}`}>
      {Object.entries(TAB_CONFIG).map(([key, config]) => (
        <button
          key={key}
          className={`epd-tab ${key === 'similar' ? 'epd-tab-similar' : ''} ${activeTab === key ? 'active' : ''}`}
          onClick={() => onTabChange(key)}
        >
          {config.icon}
          {config.label}
          {counts[key] > 0 && (
            <span className={`epd-tab-count ${key === 'similar' ? 'epd-tab-count-similar' : ''}`}>
              {counts[key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
});

PaperDetailTabs.displayName = 'PaperDetailTabs';

PaperDetailTabs.propTypes = {
  activeTab: PropTypes.oneOf(['citations', 'references', 'similar']),
  onTabChange: PropTypes.func.isRequired,
  citationCount: PropTypes.number,
  referenceCount: PropTypes.number,
  similarCount: PropTypes.number,
  className: PropTypes.string,
};

export default PaperDetailTabs;


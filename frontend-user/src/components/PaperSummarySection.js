/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperSummarySection - 论文摘要/TLDR 显示组件
 * 支持 TLDR 和 Abstract 切换，展开/折叠功能
 */

import React, { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';

const PaperSummarySection = memo(({
  paper,
  truncateLength = 100,
  bufferLength = 120,
  className = '',
}) => {
  const [mode, setMode] = useState(null); // null 表示使用默认模式
  const [isExpanded, setIsExpanded] = useState(false);

  const hasTldr = !!paper?.tldr?.text;
  const hasAbstract = !!paper?.abstract;

  // 如果两者都没有，不渲染
  if (!hasTldr && !hasAbstract) {
    return null;
  }

  // 确定当前显示模式：优先 TLDR
  const currentMode = mode || (hasTldr ? 'tldr' : 'abstract');
  const showTldr = currentMode === 'tldr' && hasTldr;
  const content = showTldr ? paper.tldr.text : paper.abstract;

  const handleToggleMode = useCallback((e) => {
    e.stopPropagation();
    setMode(prev => {
      const current = prev || (hasTldr ? 'tldr' : 'abstract');
      return current === 'tldr' ? 'abstract' : 'tldr';
    });
    setIsExpanded(false); // 切换时重置展开状态
  }, [hasTldr]);

  const handleToggleExpand = useCallback((e) => {
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  }, []);

  // 判断是否需要截断
  const needsTruncate = content && content.length > bufferLength;
  const displayContent = needsTruncate && !isExpanded
    ? content.substring(0, truncateLength) + '...'
    : content;

  return (
    <div className={`paper-summary-section ${className}`}>
      <div className="paper-summary-header">
        <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
          {showTldr ? 'TLDR' : 'Abstract'}
        </span>
        {/* 切换按钮 - 只有两者都有时才显示 */}
        {hasTldr && hasAbstract && (
          <button 
            className="summary-toggle-btn"
            onClick={handleToggleMode}
          >
            {showTldr ? '显示摘要' : '显示TLDR'}
          </button>
        )}
      </div>
      <span className="summary-text">
        {displayContent}
      </span>
      {needsTruncate && (
        <button 
          className="expand-btn"
          onClick={handleToggleExpand}
        >
          {isExpanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  );
});

PaperSummarySection.displayName = 'PaperSummarySection';

PaperSummarySection.propTypes = {
  paper: PropTypes.shape({
    tldr: PropTypes.shape({
      text: PropTypes.string,
    }),
    abstract: PropTypes.string,
  }),
  truncateLength: PropTypes.number,
  bufferLength: PropTypes.number,
  className: PropTypes.string,
};

PaperSummarySection.defaultProps = {
  truncateLength: 100,
  bufferLength: 120,
  className: '',
};

export default PaperSummarySection;


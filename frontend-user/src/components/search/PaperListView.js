/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperListView - 论文列表视图组件
 * 从 SearchResultsPage.js 提取，渲染论文列表
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import SimplePaperItem from './SimplePaperItem';
import PaperListSkeleton from './PaperListSkeleton';

/**
 * PaperListView 组件
 */
const PaperListView = memo(({
  papers,
  loading,
  total,
  currentPage,
  papersPerPage,
  selectedPaperId,
  analysisResults,
  selectedDimensions,
  onSelectPaper,
  onCite,
  expandedTldrs,
  expandedAbstracts,
  onToggleTldr,
  onToggleAbstract,
}) => {
  if (loading) {
    return <PaperListSkeleton count={10} />;
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="no-results">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
          <path d="M8 8l6 6M14 8l-6 6" strokeLinecap="round"/>
        </svg>
        <h3>未找到相关论文</h3>
        <p>请尝试使用不同的关键词或调整筛选条件</p>
      </div>
    );
  }

  const startIndex = (currentPage - 1) * papersPerPage + 1;

  return (
    <div className="papers-list">
      {papers.map((paper, index) => (
        <SimplePaperItem
          key={paper.paperId || index}
          paper={paper}
          index={startIndex + index}
          isSelected={selectedPaperId === paper.paperId}
          onClick={() => onSelectPaper(paper)}
          onCite={() => onCite(paper)}
          analysisResult={analysisResults?.[paper.paperId]}
          selectedDimensions={selectedDimensions}
          expandedTldr={expandedTldrs?.[paper.paperId]}
          expandedAbstract={expandedAbstracts?.[paper.paperId]}
          onToggleTldr={() => onToggleTldr?.(paper.paperId)}
          onToggleAbstract={() => onToggleAbstract?.(paper.paperId)}
        />
      ))}
    </div>
  );
});

PaperListView.displayName = 'PaperListView';

PaperListView.propTypes = {
  papers: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  total: PropTypes.number,
  currentPage: PropTypes.number,
  papersPerPage: PropTypes.number,
  selectedPaperId: PropTypes.string,
  analysisResults: PropTypes.object,
  selectedDimensions: PropTypes.array,
  onSelectPaper: PropTypes.func.isRequired,
  onCite: PropTypes.func,
  expandedTldrs: PropTypes.object,
  expandedAbstracts: PropTypes.object,
  onToggleTldr: PropTypes.func,
  onToggleAbstract: PropTypes.func,
};

PaperListView.defaultProps = {
  loading: false,
  total: 0,
  currentPage: 1,
  papersPerPage: 10,
  selectedDimensions: [],
  analysisResults: {},
  expandedTldrs: {},
  expandedAbstracts: {},
};

export default PaperListView;


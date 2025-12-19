/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperListWithPagination - 带分页的论文列表组件
 * 用于引用文献、参考文献、相似论文等场景
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import SimplePaperItem from './SimplePaperItem';

/**
 * 简单分页组件
 */
const SimplePagination = memo(({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  disabled 
}) => {
  if (totalPages <= 1) return null;

  // 计算要显示的页码
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= maxVisible; i++) pages.push(i);
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i);
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
    }
    
    return pages;
  };

  return (
    <div className="epd-pagination">
      <button
        className="epd-pagination-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || disabled}
      >
        上一页
      </button>
      <div className="epd-pagination-pages">
        {getPageNumbers().map(pageNum => (
          <button
            key={pageNum}
            className={`epd-pagination-page ${currentPage === pageNum ? 'active' : ''}`}
            onClick={() => onPageChange(pageNum)}
            disabled={disabled}
          >
            {pageNum}
          </button>
        ))}
      </div>
      <button
        className="epd-pagination-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || disabled}
      >
        下一页
      </button>
    </div>
  );
});

SimplePagination.displayName = 'SimplePagination';

/**
 * 带分页的论文列表
 */
const PaperListWithPagination = memo(({
  papers = [],
  currentPage = 1,
  totalPages = 1,
  loading = false,
  selectedPaperId = null,
  onSelectPaper,
  onCitePaper,
  onPageChange,
  emptyText = '暂无数据',
  loadingText = '加载中...',
  showIndex = true,
  startIndex = 0,
}) => {
  // 加载状态
  if (loading && papers.length === 0) {
    return (
      <div className="epd-loading-inline">
        <div className="epd-loading-spinner"></div>
        <span>{loadingText}</span>
      </div>
    );
  }

  // 空状态
  if (papers.length === 0) {
    return <p className="epd-empty-text">{emptyText}</p>;
  }

  return (
    <>
      <div className="epd-papers-list">
        {papers.map((paper, idx) => (
          <SimplePaperItem
            key={paper?.paperId || idx}
            paper={paper}
            index={showIndex ? startIndex + idx : undefined}
            isSelected={selectedPaperId === paper?.paperId}
            onSelect={onSelectPaper}
            onCite={onCitePaper}
          />
        ))}
      </div>
      
      <SimplePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={loading}
      />
    </>
  );
});

PaperListWithPagination.displayName = 'PaperListWithPagination';

PaperListWithPagination.propTypes = {
  papers: PropTypes.array,
  currentPage: PropTypes.number,
  totalPages: PropTypes.number,
  loading: PropTypes.bool,
  selectedPaperId: PropTypes.string,
  onSelectPaper: PropTypes.func,
  onCitePaper: PropTypes.func,
  onPageChange: PropTypes.func.isRequired,
  emptyText: PropTypes.string,
  loadingText: PropTypes.string,
  showIndex: PropTypes.bool,
  startIndex: PropTypes.number,
};

export default PaperListWithPagination;


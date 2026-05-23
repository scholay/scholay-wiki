/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ResultsToolbar - 搜索结果工具栏组件
 * 从 SearchResultsPage.js 提取，包含筛选、排序、视图切换功能
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * 排序选项
 */
const SORT_OPTIONS = [
  { value: 'relevance', label: '相关度' },
  { value: 'citationCount:desc', label: '引用数↓' },
  { value: 'citationCount:asc', label: '引用数↑' },
  { value: 'publicationDate:desc', label: '最新发表' },
  { value: 'publicationDate:asc', label: '最早发表' },
];

/**
 * ResultsToolbar 组件
 */
const ResultsToolbar = memo(({
  total,
  loading,
  showFilters,
  onToggleFilters,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
  filterTags,
  onRemoveFilter,
  onClearAllFilters,
}) => {
  return (
    <div className="results-toolbar">
      {/* 左侧：结果统计和筛选按钮 */}
      <div className="toolbar-left">
        <span className="results-count">
          {loading ? '搜索中...' : `找到 ${total.toLocaleString()} 篇论文`}
        </span>
        
        <button 
          className={`filter-toggle-btn ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
          onClick={onToggleFilters}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span>筛选</span>
          {hasActiveFilters && <span className="filter-badge" />}
        </button>
      </div>

      {/* 中间：活动筛选标签 */}
      {filterTags && filterTags.length > 0 && (
        <div className="active-filters">
          {filterTags.map((tag, index) => (
            <span key={index} className="filter-tag">
              {tag.label}
              <button onClick={() => onRemoveFilter(tag.type, tag.value)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </span>
          ))}
          <button className="clear-all-filters" onClick={onClearAllFilters}>
            清除全部
          </button>
        </div>
      )}

      {/* 右侧：排序和视图切换 */}
      <div className="toolbar-right">
        {/* 排序选择器 */}
        <div className="sort-selector">
          <label>排序：</label>
          <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 视图切换 */}
        <div className="view-toggle">
          <button 
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="列表视图"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button 
            className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => onViewModeChange('table')}
            title="表格视图"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

ResultsToolbar.displayName = 'ResultsToolbar';

ResultsToolbar.propTypes = {
  total: PropTypes.number.isRequired,
  loading: PropTypes.bool,
  showFilters: PropTypes.bool,
  onToggleFilters: PropTypes.func.isRequired,
  sortBy: PropTypes.string,
  onSortChange: PropTypes.func.isRequired,
  viewMode: PropTypes.string,
  onViewModeChange: PropTypes.func.isRequired,
  hasActiveFilters: PropTypes.bool,
  filterTags: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.string,
    value: PropTypes.any,
    label: PropTypes.string,
  })),
  onRemoveFilter: PropTypes.func,
  onClearAllFilters: PropTypes.func,
};

ResultsToolbar.defaultProps = {
  loading: false,
  showFilters: false,
  sortBy: 'relevance',
  viewMode: 'list',
  hasActiveFilters: false,
  filterTags: [],
};

export default ResultsToolbar;


/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SearchHeader - 搜索结果页头部组件
 * 从 SearchResultsPage.js 提取，包含 Logo、搜索框、AI 分析按钮
 */

import React, { memo, useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import SearchSuggestions from '../SearchSuggestions';

/**
 * 搜索示例数据
 */
const SEARCH_EXAMPLES = [
  '搜索论文标题、作者、关键词...',
  '示例：深度学习在医学影像诊断中的应用',
  '示例：量子纠缠在量子通信中的研究',
  '示例：CRISPR基因编辑技术的伦理问题',
  '示例：碳纳米管在新能源电池中的应用',
  '示例：行为经济学对消费决策的影响',
  '示例：气候变化对海洋生态系统的影响',
  '示例：人工智能在药物研发中的应用',
  '示例：区块链技术在供应链管理中的创新',
  '示例：纳米机器人在精准医疗中的前景',
  '示例：社交媒体对青少年心理健康的影响'
];

/**
 * SearchHeader 组件
 */
const SearchHeader = memo(({
  searchQuery,
  setSearchQuery,
  onSearch,
  onSelectPaper,
  onSelectAuthor,
  viewMode,
  setViewMode,
  loading,
  papersCount,
  selectedDimensions,
  showDimensionDropdown,
  setShowDimensionDropdown,
  onClearDimensions,
  dimensionDropdownRef,
  renderDimensionDropdown,
}) => {
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isInputSingleLine, setIsInputSingleLine] = useState(true);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);

  // 轮播搜索示例
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex(prev => (prev + 1) % SEARCH_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      onSearch(e);
    }
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    if (e.target.value.trim().length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleInputFocus = (e) => {
    setIsInputSingleLine(false);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    if (searchQuery.trim().length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      setShowSuggestions(false);
      if (searchQuery.trim()) {
        handleSearch(e);
      }
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleTableSearchClick = () => {
    setViewMode('list');
    setTimeout(() => {
      const textarea = document.querySelector('.results-chat-input');
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    }, 100);
  };

  return (
    <div className="results-search-header">
      {/* 左侧 Logo */}
      <div className="results-logo" onClick={() => navigate('/')}>
        <span className="results-logo-text">Scholay</span>
      </div>
      
      {/* 搜索区域 */}
      <div 
        className={`search-results-centered-area ${viewMode === 'table' ? 'table-mode' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {viewMode === 'table' ? (
          // 表格模式下的简化搜索词展示
          <div className="srp-table-search-display" onClick={handleTableSearchClick}>
            <div className="srp-table-search-content">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <span className="srp-table-search-query">{searchQuery}</span>
            </div>
            <span className="srp-table-search-hint">点击修改搜索</span>
          </div>
        ) : (
          // 列表模式下的完整搜索表单
          <form onSubmit={handleSearch} className="results-composer-wrapper">
            <div className="results-composer-input-area">
              <textarea
                ref={textareaRef}
                className={`results-chat-input ${isInputSingleLine ? 'single-line' : ''}`}
                placeholder={SEARCH_EXAMPLES[currentExampleIndex]}
                value={searchQuery}
                maxLength={1000}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button type="submit" className="btn-send" disabled={!searchQuery.trim() || loading}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            <SearchSuggestions
              query={searchQuery}
              onSelectPaper={onSelectPaper}
              onSelectAuthor={onSelectAuthor}
              onClose={() => setShowSuggestions(false)}
              visible={showSuggestions}
              inputRef={textareaRef}
            />
          </form>
        )}
      </div>
      
      {/* 右侧 AI 分析按钮区域 */}
      {viewMode === 'list' && papersCount > 0 && (
        <div className="search-header-right" ref={dimensionDropdownRef}>
          {selectedDimensions.length > 0 ? (
            <div className="dimension-active">
              <span className="dimension-active-label">
                <Sparkles size={14} />
                <span>{selectedDimensions.length} 个维度</span>
              </span>
              <button 
                className="dimension-edit-btn"
                onClick={() => setShowDimensionDropdown(!showDimensionDropdown)}
                title="编辑维度"
              >
                <ChevronDown size={14} className={showDimensionDropdown ? 'rotate' : ''} />
              </button>
              <button 
                className="dimension-clear-btn"
                onClick={onClearDimensions}
                title="清除所有"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button 
              className="ai-analysis-btn"
              onClick={() => setShowDimensionDropdown(!showDimensionDropdown)}
            >
              <Sparkles size={16} />
              <span>AI 分析</span>
              <ChevronDown size={14} className={showDimensionDropdown ? 'rotate' : ''} />
            </button>
          )}
          
          {/* 维度选择下拉框 */}
          {showDimensionDropdown && renderDimensionDropdown?.()}
        </div>
      )}
    </div>
  );
});

SearchHeader.displayName = 'SearchHeader';

SearchHeader.propTypes = {
  searchQuery: PropTypes.string.isRequired,
  setSearchQuery: PropTypes.func.isRequired,
  onSearch: PropTypes.func.isRequired,
  onSelectPaper: PropTypes.func,
  onSelectAuthor: PropTypes.func,
  viewMode: PropTypes.string.isRequired,
  setViewMode: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  papersCount: PropTypes.number,
  selectedDimensions: PropTypes.array,
  showDimensionDropdown: PropTypes.bool,
  setShowDimensionDropdown: PropTypes.func,
  onClearDimensions: PropTypes.func,
  dimensionDropdownRef: PropTypes.object,
  renderDimensionDropdown: PropTypes.func,
};

SearchHeader.defaultProps = {
  loading: false,
  papersCount: 0,
  selectedDimensions: [],
  showDimensionDropdown: false,
};

export default SearchHeader;


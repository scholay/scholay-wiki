/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SearchForm - 搜索表单组件
 */

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import SearchSuggestions from './SearchSuggestions';

// 搜索示例数据
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
  '示例：社交媒体对青少年心理健康的影响',
];

const SearchForm = memo(({
  value,
  onChange,
  onSubmit,
  onSelectPaper,
  onSelectAuthor,
  loading = false,
  placeholder,
  className = '',
  maxLength = 1000,
  showSuggestionsOnFocus = true,
  autoFocus = false,
}) => {
  const textareaRef = useRef(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isSingleLine, setIsSingleLine] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);

  // 轮播占位符
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex(prev => (prev + 1) % SEARCH_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // 处理输入变化
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // 自动调整高度
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    
    // 显示搜索建议
    if (showSuggestionsOnFocus && newValue.trim().length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [onChange, showSuggestionsOnFocus]);

  // 处理聚焦
  const handleFocus = useCallback((e) => {
    setIsSingleLine(false);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    
    if (showSuggestionsOnFocus && value.trim().length >= 2) {
      setShowSuggestions(true);
    }
  }, [value, showSuggestionsOnFocus]);

  // 处理失焦
  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  // 处理键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      setShowSuggestions(false);
      if (value.trim()) {
        onSubmit(e);
      }
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [isComposing, value, onSubmit]);

  // 处理表单提交
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (value.trim()) {
      onSubmit(e);
    }
  }, [value, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className={`results-composer-wrapper ${className}`}>
      <div className="results-composer-input-area">
        <textarea
          ref={textareaRef}
          className={`results-chat-input ${isSingleLine ? 'single-line' : ''}`}
          placeholder={placeholder || SEARCH_EXAMPLES[currentExampleIndex]}
          value={value}
          maxLength={maxLength}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <button 
          type="submit" 
          className="btn-send" 
          disabled={!value.trim() || loading}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      {/* 搜索建议下拉框 */}
      {showSuggestionsOnFocus && (
        <SearchSuggestions
          query={value}
          onSelectPaper={onSelectPaper}
          onSelectAuthor={onSelectAuthor}
          onClose={() => setShowSuggestions(false)}
          visible={showSuggestions}
          inputRef={textareaRef}
        />
      )}
    </form>
  );
});

SearchForm.displayName = 'SearchForm';

SearchForm.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSelectPaper: PropTypes.func,
  onSelectAuthor: PropTypes.func,
  loading: PropTypes.bool,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  maxLength: PropTypes.number,
  showSuggestionsOnFocus: PropTypes.bool,
  autoFocus: PropTypes.bool,
};

export default SearchForm;


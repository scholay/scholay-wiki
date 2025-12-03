/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { publicScholarAPI } from '../services/api';
import './SearchSuggestions.css';

/**
 * SearchSuggestions Component
 * 显示搜索建议下拉框，包含论文标题匹配和作者搜索结果
 * 
 * Props:
 * - query: 当前搜索查询
 * - onSelectPaper: 选择论文建议时的回调 (paper) => void
 * - onSelectAuthor: 选择作者建议时的回调 (author) => void
 * - onClose: 关闭下拉框的回调
 * - visible: 是否显示下拉框
 * - inputRef: 输入框的ref，用于定位下拉框
 */
const SearchSuggestions = ({ 
  query, 
  onSelectPaper, 
  onSelectAuthor, 
  onClose, 
  visible,
  inputRef
}) => {
  const [suggestions, setSuggestions] = useState({ papers: [], authors: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // 计算总建议数量
  const totalSuggestions = suggestions.papers.length + suggestions.authors.length;

  // 获取搜索建议
  const fetchSuggestions = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions({ papers: [], authors: [] });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await publicScholarAPI.getSearchSuggestions(searchQuery.trim(), 5, 5);
      if (response.data.code === 0 && response.data.data) {
        setSuggestions({
          papers: response.data.data.papers || [],
          authors: response.data.data.authors || []
        });
      } else {
        setSuggestions({ papers: [], authors: [] });
      }
    } catch (err) {
      console.error('Failed to fetch search suggestions:', err);
      setError('获取搜索建议失败');
      setSuggestions({ papers: [], authors: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // 防抖处理查询变化
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!visible || !query || query.trim().length < 2) {
      setSuggestions({ papers: [], authors: [] });
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300); // 300ms 防抖

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, visible, fetchSuggestions]);

  // 重置选中索引当建议变化时
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          inputRef?.current && !inputRef.current.contains(event.target)) {
        onClose?.();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose, inputRef]);

  // 键盘导航
  const handleKeyDown = useCallback((event) => {
    if (!visible || totalSuggestions === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => 
          prev < totalSuggestions - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : totalSuggestions - 1
        );
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0) {
          const papersCount = suggestions.papers.length;
          if (selectedIndex < papersCount) {
            onSelectPaper?.(suggestions.papers[selectedIndex]);
          } else {
            onSelectAuthor?.(suggestions.authors[selectedIndex - papersCount]);
          }
        }
        break;
      case 'Escape':
        onClose?.();
        break;
      default:
        break;
    }
  }, [visible, totalSuggestions, selectedIndex, suggestions, onSelectPaper, onSelectAuthor, onClose]);

  // 绑定键盘事件到输入框
  useEffect(() => {
    const input = inputRef?.current;
    if (input && visible) {
      input.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (input) {
        input.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [inputRef, visible, handleKeyDown]);

  // 处理论文选择
  const handlePaperClick = (paper) => {
    onSelectPaper?.(paper);
    onClose?.();
  };

  // 处理作者选择
  const handleAuthorClick = (author) => {
    onSelectAuthor?.(author);
    onClose?.();
  };

  // 计算弹窗最大高度，确保不超出视口底部
  const [maxHeight, setMaxHeight] = useState(400);

  useEffect(() => {
    if (visible && dropdownRef.current) {
      const updateMaxHeight = () => {
        const dropdown = dropdownRef.current;
        if (dropdown) {
          const rect = dropdown.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          // 计算弹窗顶部到视口底部的距离，留出20px的边距
          const availableHeight = viewportHeight - rect.top - 20;
          // 限制在100-500px之间
          setMaxHeight(Math.max(100, Math.min(500, availableHeight)));
        }
      };
      
      // 初始计算
      setTimeout(updateMaxHeight, 0);
      
      // 监听窗口大小变化
      window.addEventListener('resize', updateMaxHeight);
      return () => window.removeEventListener('resize', updateMaxHeight);
    }
  }, [visible, totalSuggestions]);

  // 不显示时返回null
  if (!visible) return null;

  // 查询太短时不显示
  if (query?.trim().length < 2) return null;

  // 加载中时不显示弹窗（等结果返回后再显示）
  if (loading) return null;

  // 没有任何结果时不显示弹窗
  if (totalSuggestions === 0) return null;

  return (
    <div className="search-suggestions-dropdown" ref={dropdownRef} style={{ maxHeight: `${maxHeight}px` }}>
      {error && (
        <div className="suggestions-error">
          {error}
        </div>
      )}

      {/* 可滚动的内容区域 */}
      <div className="suggestions-content">
        {suggestions.papers.length > 0 && (
        <div className="suggestions-section">
          <div className="suggestions-section-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <span>论文匹配</span>
          </div>
          <div className="suggestions-list">
            {suggestions.papers.map((paper, index) => (
              <div
                key={paper.id}
                className={`suggestion-item paper-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handlePaperClick(paper)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="suggestion-content">
                  <div className="suggestion-title">{paper.title}</div>
                  <div className="suggestion-meta">{paper.authorsYear}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        {suggestions.authors.length > 0 && (
        <div className="suggestions-section">
          <div className="suggestions-section-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>作者</span>
          </div>
          <div className="suggestions-list">
            {suggestions.authors.map((author, index) => {
              const actualIndex = suggestions.papers.length + index;
              return (
                <div
                  key={author.authorId}
                  className={`suggestion-item author-item ${selectedIndex === actualIndex ? 'selected' : ''}`}
                  onClick={() => handleAuthorClick(author)}
                  onMouseEnter={() => setSelectedIndex(actualIndex)}
                >
                  <div className="suggestion-content">
                    <div className="suggestion-title">{author.name}</div>
                    {(author.affiliations?.length > 0 || author.paperCount > 0) && (
                      <div className="suggestion-meta">
                        {author.affiliations?.[0] && <span>{author.affiliations[0]}</span>}
                        {author.paperCount > 0 && (
                          <span className="author-stats">
                            {author.paperCount} 篇论文
                            {author.citationCount > 0 && ` · ${author.citationCount} 次引用`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* 固定在底部的提示 */}
      {query?.trim().length >= 2 && (
        <div className="suggestions-footer">
          <span>按 Enter 搜索 "{query}"</span>
        </div>
      )}
    </div>
  );
};

export default SearchSuggestions;


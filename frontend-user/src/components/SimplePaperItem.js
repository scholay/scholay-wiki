/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SimplePaperItem - 简化版论文列表项组件
 * 用于引用、参考文献、相似论文等列表
 * 使用 React.memo 优化，避免不必要的重渲染
 */

import React, { memo, useCallback } from 'react';

/**
 * 简化版论文列表项组件
 * @param {Object} props
 * @param {Object} props.paper - 论文数据
 * @param {number} props.index - 论文索引
 * @param {boolean} props.isSelected - 是否选中
 * @param {Function} props.onSelect - 选中回调
 * @param {Function} props.onCite - 引用回调
 * @param {Function} props.onViewDetail - 查看详情回调
 * @param {string} props.className - 额外的 CSS 类名
 */
const SimplePaperItem = memo(({
  paper,
  index,
  isSelected,
  onSelect,
  onCite,
  onViewDetail,
  className = '',
}) => {
  const handleSelect = useCallback(() => {
    onSelect?.(paper);
  }, [paper, onSelect]);

  const handleCite = useCallback((e) => {
    e.stopPropagation();
    onCite?.(paper);
  }, [paper, onCite]);

  const handleViewDetail = useCallback((e) => {
    e.stopPropagation();
    onViewDetail?.(paper);
  }, [paper, onViewDetail]);

  if (!paper) return null;

  return (
    <div
      className={`search-result-paper-item ${isSelected ? 'selected' : ''} ${className}`}
      onClick={handleSelect}
    >
      <div className="search-result-paper-content">
        <h3 className="search-result-paper-title">
          {paper.title || '无标题'}
        </h3>
        
        {/* 作者列表 */}
        {paper.authors && paper.authors.length > 0 && (
          <div className="search-result-paper-authors-row">
            <div className="search-result-paper-author-tags">
              {paper.authors.slice(0, 3).map((author, idx) => (
                <span key={idx} className="author-tag">{author.name}</span>
              ))}
              {paper.authors.length > 3 && (
                <span className="author-tag author-more">+{paper.authors.length - 3}</span>
              )}
            </div>
          </div>
        )}
        
        {/* 期刊/年份 */}
        {(paper.venue || paper.year) && (
          <p className="search-result-paper-venue-date">
            {paper.venue && <span className="search-result-venue-name">{paper.venue}</span>}
            {paper.venue && paper.year && ' · '}
            {paper.year && <span className="pub-year">{paper.year}</span>}
          </p>
        )}
        
        {/* 底部元信息 */}
        <div className="search-result-paper-meta">
          {paper.citationCount !== undefined && (
            <>
              <span className="citation-count">
                <span className="citation-number">{paper.citationCount}</span>
                <span className="citation-label">被引</span>
              </span>
              <span className="meta-divider"></span>
            </>
          )}
          
          {/* PDF 链接 */}
          {paper.openAccessPdf?.url && (
            <a
              href={paper.openAccessPdf.url}
              target="_blank"
              rel="noreferrer"
              className="search-result-paper-pdf-link"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              PDF
            </a>
          )}
          
          {/* 引用按钮 */}
          {onCite && (
            <button
              className="search-result-paper-cite-btn"
              onClick={handleCite}
              title="引用"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>
              </svg>
              引用
            </button>
          )}
          
          {/* 详情按钮 */}
          {onViewDetail && (
            <button
              className="search-result-paper-detail-btn"
              onClick={handleViewDetail}
              title="查看详情"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              详情
            </button>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数
  return (
    prevProps.paper?.paperId === nextProps.paper?.paperId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.index === nextProps.index
  );
});

SimplePaperItem.displayName = 'SimplePaperItem';

export default SimplePaperItem;


/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperListItem - 论文列表项组件
 * 使用 React.memo 优化，避免不必要的重渲染
 */

import React, { memo, useState, useCallback } from 'react';

/**
 * 论文列表项组件
 * @param {Object} props
 * @param {Object} props.paper - 论文数据
 * @param {number} props.index - 论文索引
 * @param {boolean} props.isSelected - 是否选中
 * @param {Function} props.onPaperClick - 点击论文回调
 * @param {Function} props.onCite - 引用回调
 * @param {Function} props.onViewDetail - 查看详情回调
 * @param {Object} props.analysisResults - 分析结果
 * @param {boolean} props.isAnalyzing - 是否正在分析
 * @param {Array} props.selectedDimensions - 选中的分析维度
 * @param {number} props.startIndex - 起始索引（用于显示序号）
 */
const PaperListItem = memo(({
  paper,
  index,
  isSelected,
  onPaperClick,
  onCite,
  onViewDetail,
  analysisResults,
  isAnalyzing,
  selectedDimensions,
  startIndex = 1,
}) => {
  // 本地状态 - TLDR/摘要展开
  const [expandedTldr, setExpandedTldr] = useState(false);
  const [expandedAbstract, setExpandedAbstract] = useState(false);
  const [showAbstractMode, setShowAbstractMode] = useState(
    paper.tldr?.text ? 'tldr' : 'abstract'
  );

  const toggleTldrExpand = useCallback(() => {
    setExpandedTldr(prev => !prev);
  }, []);

  const toggleAbstractExpand = useCallback(() => {
    setExpandedAbstract(prev => !prev);
  }, []);

  const toggleMode = useCallback((e) => {
    e.stopPropagation();
    setShowAbstractMode(prev => prev === 'tldr' ? 'abstract' : 'tldr');
  }, []);

  const handlePaperClick = useCallback(() => {
    onPaperClick?.(paper);
  }, [paper, onPaperClick]);

  const handleCite = useCallback((e) => {
    e.stopPropagation();
    onCite?.(paper);
  }, [paper, onCite]);

  const handleViewDetail = useCallback((e) => {
    e.stopPropagation();
    onViewDetail?.(paper);
  }, [paper, onViewDetail]);

  // 计算 TLDR/摘要显示内容
  const hasTldr = paper.tldr?.text;
  const hasAbstract = paper.abstract;
  const currentMode = showAbstractMode;
  const showTldr = currentMode === 'tldr' && hasTldr;
  const showAbstract = currentMode === 'abstract' && hasAbstract;
  const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
  const isExpanded = showTldr ? expandedTldr : expandedAbstract;

  const paperResults = analysisResults?.[paper.paperId];
  const hasError = paperResults?._error;

  return (
    <div
      className={`unified-table-row ${isSelected ? 'selected' : ''}`}
      data-paper-index={index}
    >
      {/* 论文信息列 - 第一列 */}
      <div className="unified-cell-paper">
        <div className="search-result-paper-number">{startIndex + index}</div>
        <div className="search-result-paper-content">
          <h3 
            className="search-result-paper-title" 
            onClick={handlePaperClick}
          >
            {paper.title}
          </h3>

          {/* 作者列表 */}
          {paper.authors && paper.authors.length > 0 && (
            <div className="search-result-paper-authors-row">
              <div className="search-result-paper-author-tags">
                {paper.authors.slice(0, 4).map((author, idx) => (
                  <span key={idx} className="author-tag">{author.name}</span>
                ))}
                {paper.authors.length > 4 && (
                  <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                )}
              </div>
              {/* 研究领域 */}
              {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                <span className="search-result-paper-fields">
                  {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                </span>
              )}
            </div>
          )}

          {/* 期刊/会议 + 日期 */}
          {(paper.venue || paper.publicationDate || paper.year) && (
            <p className="search-result-paper-venue-date">
              {paper.venue && (
                <span className="search-result-venue-name">{paper.venue}</span>
              )}
              {paper.venue && (paper.publicationDate || paper.year) && ' · '}
              {(paper.publicationDate || paper.year) && (
                <span className="pub-date pub-year">
                  {paper.publicationDate 
                    ? new Date(paper.publicationDate).getFullYear() 
                    : paper.year}
                </span>
              )}
            </p>
          )}

          {/* TLDR / 摘要 */}
          {(hasTldr || hasAbstract) && (
            <div className="paper-summary-section">
              <div className="paper-summary-header">
                <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
                  {showTldr ? 'TLDR' : 'Abstract'}
                </span>
                {hasTldr && hasAbstract && (
                  <button 
                    className="summary-toggle-btn"
                    onClick={toggleMode}
                  >
                    {showTldr ? '显示摘要' : '显示TLDR'}
                  </button>
                )}
              </div>
              <span className="summary-text">
                {isExpanded || content.length <= 120
                  ? content 
                  : content.substring(0, 100) + '...'
                }
              </span>
              {content.length > 120 && (
                <button 
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showTldr) {
                      toggleTldrExpand();
                    } else {
                      toggleAbstractExpand();
                    }
                  }}
                >
                  {isExpanded ? '收起' : '展开'}
                </button>
              )}
            </div>
          )}

          {/* 底部元信息和操作 */}
          <div className="search-result-paper-meta">
            {/* 被引用数 */}
            {paper.citationCount !== undefined && (
              <>
                <span className="citation-count">
                  <span className="citation-number">{paper.citationCount}</span>
                  <span className="citation-label">被引</span>
                </span>
                <span className="meta-divider"></span>
              </>
            )}
            
            {/* DOI 链接 */}
            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="search-result-paper-doi-link"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                DOI
              </a>
            )}
            
            {/* PDF 链接 */}
            {paper.openAccessPdf?.url && (
              <a
                href={paper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="search-result-paper-pdf-link"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                PDF
              </a>
            )}
            
            {/* 引用按钮 */}
            <button
              className="search-result-paper-cite-btn"
              onClick={handleCite}
              title="引用"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>
              </svg>
              引用
            </button>
            
            {/* 查看详情按钮 */}
            <button
              className="search-result-paper-detail-btn"
              onClick={handleViewDetail}
              title="查看详情"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
                <path d="M11 8v6M8 11h6"/>
              </svg>
              详情
            </button>
          </div>
        </div>
      </div>

      {/* 分析结果列 */}
      {selectedDimensions && selectedDimensions.length > 0 && selectedDimensions.map(dim => (
        <div key={dim.key} className="unified-cell-analysis">
          {isAnalyzing ? (
            <div className="analysis-loading">
              <div className="analysis-loading-spinner"></div>
            </div>
          ) : hasError ? (
            <span className="analysis-error">分析失败</span>
          ) : paperResults?.[dim.key] ? (
            <p className="analysis-cell-text">{paperResults[dim.key]}</p>
          ) : (
            <span className="analysis-empty">-</span>
          )}
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键属性变化时重渲染
  return (
    prevProps.paper.paperId === nextProps.paper.paperId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isAnalyzing === nextProps.isAnalyzing &&
    prevProps.startIndex === nextProps.startIndex &&
    prevProps.index === nextProps.index &&
    // 浅比较分析结果
    JSON.stringify(prevProps.analysisResults?.[prevProps.paper.paperId]) === 
    JSON.stringify(nextProps.analysisResults?.[nextProps.paper.paperId]) &&
    // 浅比较选中的维度
    JSON.stringify(prevProps.selectedDimensions?.map(d => d.key)) === 
    JSON.stringify(nextProps.selectedDimensions?.map(d => d.key))
  );
});

PaperListItem.displayName = 'PaperListItem';

export default PaperListItem;


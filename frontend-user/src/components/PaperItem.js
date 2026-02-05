/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperItem - 论文列表项组件
 * 用于在搜索结果中显示单篇论文的信息
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { FileText, ExternalLink } from 'lucide-react';

/**
 * 格式化引用数
 */
const formatCitationCount = (count) => {
  if (count === undefined || count === null) return '-';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

/**
 * 截断文本
 */
const truncateText = (text, maxLength = 200) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * PaperItem 组件
 */
const PaperItem = memo(({
  paper,
  index,
  isSelected,
  showAbstract = true,
  showTldr = true,
  abstractMode = 'tldr', // 'tldr' 或 'abstract'
  isExpanded = false,
  onSelect,
  onCite,
  onAuthorClick,
  onToggleExpand,
  onToggleMode,
  analysisResults,
  selectedDimensions,
  onAnalyze,
  isAnalyzing
}) => {
  const handleClick = () => {
    if (onSelect) {
      onSelect(paper);
    }
  };

  const handleCiteClick = (e) => {
    e.stopPropagation();
    if (onCite) {
      onCite(paper);
    }
  };

  const handleAuthorClick = (e, author) => {
    e.stopPropagation();
    if (onAuthorClick && author.authorId) {
      onAuthorClick(author);
    }
  };

  const handleToggleExpand = (e) => {
    e.stopPropagation();
    if (onToggleExpand) {
      onToggleExpand(paper.paperId);
    }
  };

  const handleToggleMode = (e) => {
    e.stopPropagation();
    if (onToggleMode) {
      onToggleMode(paper.paperId);
    }
  };

  // 获取显示内容
  const displayContent = abstractMode === 'tldr' 
    ? (paper.tldr?.text || paper.abstract)
    : paper.abstract;

  const hasAlternativeContent = abstractMode === 'tldr' 
    ? !!paper.abstract 
    : !!paper.tldr?.text;

  return (
    <div 
      className={`paper-item ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      {/* 序号 */}
      <div className="paper-number">{index + 1}</div>
      
      {/* 主要内容 */}
      <div className="paper-content">
        {/* 标题 */}
        <h3 className="paper-title">
          {paper.title}
          {paper.isOpenAccess && (
            <span className="open-access-badge" title="开放获取">OA</span>
          )}
        </h3>
        
        {/* 作者 */}
        {paper.authors && paper.authors.length > 0 && (
          <div className="paper-authors">
            {paper.authors.slice(0, 5).map((author, idx) => (
              <span 
                key={author.authorId || idx}
                className={`author-name ${author.authorId ? 'clickable' : ''}`}
                onClick={(e) => handleAuthorClick(e, author)}
              >
                {author.name}
                {idx < Math.min(paper.authors.length, 5) - 1 && ', '}
              </span>
            ))}
            {paper.authors.length > 5 && (
              <span className="author-more">等 {paper.authors.length} 位作者</span>
            )}
          </div>
        )}
        
        {/* 期刊/会议和年份 */}
        <div className="paper-meta">
          {paper.venue && <span className="paper-venue">{paper.venue}</span>}
          {paper.year && <span className="paper-year">{paper.year}</span>}
          {paper.citationCount !== undefined && (
            <span className="paper-citations">
              引用: {formatCitationCount(paper.citationCount)}
            </span>
          )}
        </div>
        
        {/* 摘要/TLDR */}
        {(showAbstract || showTldr) && displayContent && (
          <div className="paper-summary">
            <div className="summary-header">
              <span className="summary-label">
                {abstractMode === 'tldr' ? 'TLDR' : '摘要'}
              </span>
              {hasAlternativeContent && (
                <button 
                  className="summary-toggle"
                  onClick={handleToggleMode}
                >
                  切换到{abstractMode === 'tldr' ? '摘要' : 'TLDR'}
                </button>
              )}
            </div>
            <p className={`summary-text ${isExpanded ? 'expanded' : ''}`}>
              {isExpanded ? displayContent : truncateText(displayContent, 200)}
            </p>
            {displayContent.length > 200 && (
              <button className="expand-toggle" onClick={handleToggleExpand}>
                {isExpanded ? '收起' : '展开'}
              </button>
            )}
          </div>
        )}
        
        {/* 研究领域 */}
        {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
          <div className="paper-fields">
            {paper.fieldsOfStudy.slice(0, 3).map((field, idx) => (
              <span key={idx} className="field-tag">{field}</span>
            ))}
            {paper.fieldsOfStudy.length > 3 && (
              <span className="field-more">+{paper.fieldsOfStudy.length - 3}</span>
            )}
          </div>
        )}
        
        {/* AI 分析结果 */}
        {selectedDimensions && selectedDimensions.length > 0 && (
          <div className="paper-analysis">
            {selectedDimensions.map(dimension => {
              const result = analysisResults?.[paper.paperId]?.[dimension.key];
              const analyzing = isAnalyzing?.[paper.paperId]?.has(dimension.key);
              
              return (
                <div key={dimension.key} className="analysis-item">
                  <span className="analysis-label">{dimension.name}:</span>
                  {analyzing ? (
                    <span className="analysis-loading">分析中...</span>
                  ) : result ? (
                    <span className="analysis-result">{result}</span>
                  ) : (
                    <button 
                      className="analyze-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnalyze?.(paper.paperId, dimension.key);
                      }}
                    >
                      分析
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 操作按钮 */}
      <div className="paper-actions">
        <button 
          className="action-btn cite-btn"
          onClick={handleCiteClick}
          title="引用"
        >
          <FileText size={16} />
        </button>
        {paper.openAccessPdf?.url && (
          <a 
            href={paper.openAccessPdf.url}
            target="_blank"
            rel="noopener"
            className="action-btn pdf-btn"
            onClick={(e) => e.stopPropagation()}
            title="查看 PDF"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  );
});

PaperItem.displayName = 'PaperItem';

PaperItem.propTypes = {
  paper: PropTypes.shape({
    paperId: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    abstract: PropTypes.string,
    authors: PropTypes.arrayOf(PropTypes.shape({
      authorId: PropTypes.string,
      name: PropTypes.string
    })),
    year: PropTypes.number,
    citationCount: PropTypes.number,
    venue: PropTypes.string,
    isOpenAccess: PropTypes.bool,
    fieldsOfStudy: PropTypes.arrayOf(PropTypes.string),
    tldr: PropTypes.shape({
      text: PropTypes.string
    }),
    openAccessPdf: PropTypes.shape({
      url: PropTypes.string
    })
  }).isRequired,
  index: PropTypes.number.isRequired,
  isSelected: PropTypes.bool,
  showAbstract: PropTypes.bool,
  showTldr: PropTypes.bool,
  abstractMode: PropTypes.oneOf(['tldr', 'abstract']),
  isExpanded: PropTypes.bool,
  onSelect: PropTypes.func,
  onCite: PropTypes.func,
  onAuthorClick: PropTypes.func,
  onToggleExpand: PropTypes.func,
  onToggleMode: PropTypes.func,
  analysisResults: PropTypes.object,
  selectedDimensions: PropTypes.array,
  onAnalyze: PropTypes.func,
  isAnalyzing: PropTypes.object
};

export default PaperItem;


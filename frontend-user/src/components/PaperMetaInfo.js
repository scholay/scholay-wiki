/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperMetaInfo - 论文元信息组件
 * 显示引用数、DOI、PDF 链接、Cite 按钮等
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

const PaperMetaInfo = memo(({
  paper,
  onCite,
  showCitation = true,
  showDOI = true,
  showPDF = true,
  showCiteButton = true,
  className = '',
}) => {
  const handleCiteClick = (e) => {
    e.stopPropagation();
    onCite?.(paper);
  };

  const handleLinkClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div className={`search-result-paper-meta ${className}`}>
      {/* 被引用数 */}
      {showCitation && paper.citationCount !== undefined && (
        <>
          <span className="citation-count">
            <span className="citation-number">{paper.citationCount}</span>
            <span className="citation-label">被引</span>
          </span>
          <span className="meta-divider">|</span>
        </>
      )}
      
      {/* DOI 链接 */}
      {showDOI && paper.externalIds?.DOI && (
        <>
          <a
            href={`https://doi.org/${paper.externalIds.DOI}`}
            target="_blank"
            rel="noopener noreferrer"
            className="paper-doi-link"
            onClick={handleLinkClick}
          >
            DOI
          </a>
          <span className="meta-divider">|</span>
        </>
      )}
      
      {/* PDF 链接 */}
      {showPDF && paper.openAccessPdf?.url && (
        <>
          <a
            href={paper.openAccessPdf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="paper-pdf-link"
            onClick={handleLinkClick}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            PDF
          </a>
          <span className="meta-divider">|</span>
        </>
      )}
      
      {/* Cite 按钮 */}
      {showCiteButton && (
        <button 
          className="paper-cite-btn"
          onClick={handleCiteClick}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
          </svg>
          Cite
        </button>
      )}
    </div>
  );
});

PaperMetaInfo.displayName = 'PaperMetaInfo';

PaperMetaInfo.propTypes = {
  paper: PropTypes.shape({
    citationCount: PropTypes.number,
    externalIds: PropTypes.shape({
      DOI: PropTypes.string,
    }),
    openAccessPdf: PropTypes.shape({
      url: PropTypes.string,
    }),
  }).isRequired,
  onCite: PropTypes.func,
  showCitation: PropTypes.bool,
  showDOI: PropTypes.bool,
  showPDF: PropTypes.bool,
  showCiteButton: PropTypes.bool,
  className: PropTypes.string,
};

PaperMetaInfo.defaultProps = {
  showCitation: true,
  showDOI: true,
  showPDF: true,
  showCiteButton: true,
  className: '',
};

export default PaperMetaInfo;


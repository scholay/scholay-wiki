import React, { useState } from 'react';
import PDFViewer from './PDFViewer';
import './PaperPreview.css';

const PaperPreview = ({ paper, onClose, width, onResizeMouseDown, onResizeTouchStart, isResizing }) => {
  const [showDetails, setShowDetails] = useState(false);
  const containerStyle = width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined;

  if (!paper) {
    // 保留空间但隐藏所有内容
    return (
      <div className="paper-preview empty" style={containerStyle}>
        {/* 完全留白,不显示任何内容 */}
      </div>
    );
  }

  const hasPDF = paper.openAccessPdf && paper.openAccessPdf.url;

  return (
    <div className="paper-preview" style={containerStyle}>
      {/* 拖拽分隔条 - 在预览区域内渲染 */}
      <div
        className={`resize-handle ${isResizing ? 'resizing' : ''}`}
        onMouseDown={onResizeMouseDown}
        onTouchStart={onResizeTouchStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整预览区域宽度"
      >
        <div className="resize-handle-line" />
      </div>
      <div className="paper-preview-header">
        <div className="header-left">
          <h3>{hasPDF ? 'PDF预览' : '论文详情'}</h3>
          {hasPDF && (
            <button
              className={`toggle-view-btn ${showDetails ? 'active' : ''}`}
              onClick={() => setShowDetails(!showDetails)}
              title={showDetails ? '查看PDF' : '查看详情'}
            >
              {showDetails ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span>PDF</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <span>详情</span>
                </>
              )}
            </button>
          )}
        </div>
        <button className="close-preview-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="paper-preview-content">
        {hasPDF && !showDetails ? (
          <PDFViewer pdfUrl={paper.openAccessPdf.url} paperTitle={paper.title} />
        ) : (
          <div className="paper-details">
            <h2 className="paper-title">{paper.title}</h2>

            {paper.authors && paper.authors.length > 0 && (
              <div className="detail-section">
                <h4>作者</h4>
                <div className="authors-list">
                  {paper.authors.map((author, index) => (
                    <span key={index} className="author-name">
                      {author.name}
                      {index < paper.authors.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {paper.year && (
              <div className="detail-section">
                <h4>发表年份</h4>
                <p>{paper.year}</p>
              </div>
            )}

            {paper.venue && (
              <div className="detail-section">
                <h4>会议/期刊</h4>
                <p>{paper.venue}</p>
              </div>
            )}

            {paper.publicationDate && (
              <div className="detail-section">
                <h4>发表日期</h4>
                <p>{paper.publicationDate}</p>
              </div>
            )}

            {paper.abstract && (
              <div className="detail-section">
                <h4>摘要</h4>
                <p className="abstract-text">{paper.abstract}</p>
              </div>
            )}

            {paper.tldr && paper.tldr.text && (
              <div className="detail-section tldr-section">
                <h4>TL;DR (AI生成摘要)</h4>
                <p className="tldr-text">{paper.tldr.text}</p>
              </div>
            )}

            <div className="detail-section metrics-section">
              <h4>学术指标</h4>
              <div className="metrics-grid">
                {paper.citationCount !== undefined && (
                  <div className="metric-item">
                    <span className="metric-label">引用数</span>
                    <span className="metric-value">{paper.citationCount}</span>
                  </div>
                )}
                {paper.referenceCount !== undefined && (
                  <div className="metric-item">
                    <span className="metric-label">参考文献</span>
                    <span className="metric-value">{paper.referenceCount}</span>
                  </div>
                )}
                {paper.influentialCitationCount !== undefined && (
                  <div className="metric-item">
                    <span className="metric-label">有影响力引用</span>
                    <span className="metric-value">{paper.influentialCitationCount}</span>
                  </div>
                )}
              </div>
            </div>

            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <div className="detail-section">
                <h4>研究领域</h4>
                <div className="fields-tags">
                  {paper.fieldsOfStudy.map((field, index) => (
                    <span key={index} className="field-tag">{field}</span>
                  ))}
                </div>
              </div>
            )}

            {paper.url && (
              <div className="detail-section">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="external-link-btn"
                >
                  在 Semantic Scholar 查看
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            )}

            {!hasPDF && paper.isOpenAccess === false && (
              <div className="no-pdf-notice">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>此论文没有开放获取的PDF</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaperPreview;

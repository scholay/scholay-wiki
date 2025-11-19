import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PDFViewer from './PDFViewer';
import './PaperPreview.css';

const PaperPreview = ({ paper, onClose, width, onResizeMouseDown, onResizeTouchStart, isResizing }) => {
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'pdf'，默认展示详情
  const containerStyle = width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined;

  // 当切换论文时，重置为详情 tab
  useEffect(() => {
    if (paper) {
      setActiveTab('details');
    }
  }, [paper?.paperId]);

  if (!paper) {
    return (
      <div className="paper-preview empty" style={containerStyle}>
      </div>
    );
  }

  const hasPDF = paper.openAccessPdf && paper.openAccessPdf.url;

  return (
    <div className="paper-preview" style={containerStyle}>
      {/* 拖拽分隔条 */}
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

      {/* 顶部标签栏 */}
      <div className="preview-tabs">
        <div className="tabs-left">
          {hasPDF && (
            <>
              <button
                className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                详情
              </button>
            <button
                className={`tab-btn ${activeTab === 'pdf' ? 'active' : ''}`}
                onClick={() => setActiveTab('pdf')}
            >
                PDF预览
              </button>
                </>
              )}
          {!hasPDF && (
            <span className="tab-title">论文详情</span>
          )}
        </div>
        <button className="close-btn" onClick={onClose} title="关闭">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* 论文标题 */}
      <div className="preview-title-bar">
        <h2>{paper.title}</h2>
        {(activeTab === 'details' || !hasPDF) && (
          <Link 
            to={`/paper/${paper.paperId}`} 
            className="view-detail-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看详情
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </Link>
        )}
      </div>

      {/* 内容区域 */}
      <div className="preview-content">
        {hasPDF && activeTab === 'pdf' ? (
          <PDFViewer pdfUrl={paper.openAccessPdf.url} paperTitle={paper.title} />
        ) : (
          <div className="details-content">
            {/* 作者 */}
            {paper.authors && paper.authors.length > 0 && (
              <div className="detail-row">
                <span className="detail-label">作者</span>
                <span className="detail-value">
                  {paper.authors.map(a => a.name).join(', ')}
                    </span>
              </div>
            )}

            {/* 发表年份 */}
            {paper.year && (
              <div className="detail-row">
                <span className="detail-label">发表年份</span>
                <span className="detail-value">{paper.year}</span>
              </div>
            )}

            {/* 发表日期 */}
            {paper.publicationDate && (
              <div className="detail-row">
                <span className="detail-label">发表日期</span>
                <span className="detail-value">{paper.publicationDate}</span>
              </div>
            )}

            {/* 会议/期刊 */}
            {paper.venue && (
              <div className="detail-row">
                <span className="detail-label">会议/期刊</span>
                <span className="detail-value">{paper.venue}</span>
              </div>
            )}

            {/* 研究领域 */}
            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <div className="detail-row">
                <span className="detail-label">研究领域</span>
                <div className="field-tags">
                  {paper.fieldsOfStudy.map((field, index) => (
                    <span key={index} className="field-tag">{field}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 学术指标 */}
            <div className="metrics-row">
              <span className="detail-label">学术指标</span>
              <div className="metrics-items">
                {paper.citationCount !== undefined && (
                  <div className="metric">
                    <span className="metric-num">{paper.citationCount}</span>
                    <span className="metric-name">引用数</span>
                  </div>
                )}
                {paper.referenceCount !== undefined && (
                  <div className="metric">
                    <span className="metric-num">{paper.referenceCount}</span>
                    <span className="metric-name">参考文献</span>
                  </div>
                )}
                {paper.influentialCitationCount !== undefined && (
                  <div className="metric">
                    <span className="metric-num">{paper.influentialCitationCount}</span>
                    <span className="metric-name">有影响力引用</span>
                  </div>
                )}
              </div>
            </div>

            {/* TL;DR */}
            {paper.tldr && paper.tldr.text && (
              <div className="detail-block tldr-block">
                <span className="block-label">TLDR</span>
                <p className="block-text">{paper.tldr.text}</p>
              </div>
            )}

            {/* 摘要 */}
            {paper.abstract && (
              <div className="detail-block">
                <span className="block-label">摘要</span>
                <p className="block-text abstract-text">{paper.abstract}</p>
              </div>
            )}

            {/* 无 PDF 提示 */}
            {!hasPDF && paper.isOpenAccess === false && (
              <div className="no-pdf-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                此论文没有开放获取的 PDF
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaperPreview;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import PDFViewer from './PDFViewer';
import './PaperPreview.css';

const PaperPreview = memo(({ paper, onClose, width, onResizeMouseDown, onResizeTouchStart, isResizing, isMobileModal = false, isDrawerMode = false, onClick, pdfAvailability }) => {
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'pdf'，默认展示详情
  const containerStyle = width && !isMobileModal && !isDrawerMode ? { width: typeof width === 'number' ? `${width}px` : width } : undefined;

  // 检查用户是否点击了"获取PDF"按钮
  const shouldOpenPdf = pdfAvailability?.shouldOpenPdfTab?.(paper?.paperId);
  const clearPdfRequest = pdfAvailability?.clearPdfRequest;

  // 判断是否有 PDF 可用（开放获取或有 DOI 可尝试获取）
  const hasOpenAccessPdf = paper?.openAccessPdf && paper.openAccessPdf.url;
  const doi = paper?.externalIds?.DOI;
  // 有 DOI 就显示 PDF tab（用户可以点击尝试获取）
  const hasPDF = hasOpenAccessPdf || doi;

  // 当切换论文时，检查是否应该显示 PDF tab
  useEffect(() => {
    if (paper) {
      // 如果用户点击了"获取PDF"按钮，直接显示 PDF tab
      if (shouldOpenPdf) {
        setActiveTab('pdf');
        // 使用 setTimeout 延迟清除，避免触发重新渲染导致 tab 切换
        setTimeout(() => {
          if (clearPdfRequest) {
            clearPdfRequest(paper.paperId);
          }
        }, 100);
      } else {
        // 切换到新论文时，默认显示详情
        setActiveTab('details');
      }
    }
    // 只在 paperId 变化时执行，不依赖 shouldOpenPdf 避免循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.paperId]);

  // 单独处理"获取PDF"按钮点击（paperId 不变但 shouldOpenPdf 变为 true）
  useEffect(() => {
    if (paper && shouldOpenPdf && activeTab !== 'pdf') {
      setActiveTab('pdf');
      setTimeout(() => {
        if (clearPdfRequest) {
          clearPdfRequest(paper.paperId);
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenPdf]);

  if (!paper) {
    return (
      <div className="paper-preview empty" style={containerStyle}>
      </div>
    );
  }

  return (
    <div 
      className={`paper-preview ${isMobileModal ? 'mobile-modal' : ''} ${isDrawerMode ? 'drawer-mode' : ''}`} 
      style={containerStyle}
      onClick={onClick}
    >
      {/* 拖拽分隔条 - 移动端弹窗模式和抽屉模式下隐藏 */}
      {!isMobileModal && !isDrawerMode && (
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
      )}

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
            to={`/search-results?paperId=${paper.paperId}`} 
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
          <PDFViewer 
            pdfUrl={hasOpenAccessPdf ? paper.openAccessPdf.url : null} 
            paperTitle={paper.title}
            doi={doi}
            isCheckedPdf={!hasOpenAccessPdf && doi}
          />
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
});

export default PaperPreview;

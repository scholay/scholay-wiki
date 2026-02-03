/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PDF 预览组件
 * 基于 react-pdf 实现
 */

import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// react-pdf 10.x 使用新的样式导入方式
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PdfPreview.css';

// 设置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

function PdfPreview({ pdfUrl, isCompiling, error, onCompile, engineStatus }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState(null);
  
  // 引擎状态文本
  const getEngineStatusText = () => {
    switch (engineStatus) {
      case 'loading':
        return '编译引擎加载中...';
      case 'ready':
        return '引擎就绪';
      case 'compiling':
        return '编译中...';
      case 'error':
        return '引擎加载失败';
      default:
        return '等待加载';
    }
  };

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((error) => {
    console.error('PDF load error:', error);
    setLoadError('PDF 加载失败');
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleZoomReset = useCallback(() => {
    setScale(1.0);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, numPages || 1));
  }, [numPages]);

  // 渲染空状态（无 PDF）
  const renderEmptyState = () => (
    <div className="pdf-preview-empty">
      <div className="pdf-preview-empty-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>
      <h3>PDF 预览</h3>
      <p>点击"编译"按钮生成 PDF</p>
      {engineStatus && engineStatus !== 'ready' && (
        <p className="pdf-preview-engine-status">
          {engineStatus === 'loading' && (
            <>
              <span className="pdf-preview-status-loading" />
              {getEngineStatusText()}
            </>
          )}
          {engineStatus === 'unloaded' && '首次编译需加载引擎（约2MB）'}
        </p>
      )}
      <button 
        className="pdf-preview-compile-btn"
        onClick={onCompile}
        disabled={isCompiling || engineStatus === 'loading'}
      >
        {isCompiling ? '编译中...' : engineStatus === 'loading' ? '引擎加载中...' : '编译 PDF'}
      </button>
    </div>
  );

  // 渲染编译中状态
  const renderCompiling = () => (
    <div className="pdf-preview-loading">
      <div className="pdf-preview-spinner" />
      <p>正在编译 LaTeX 文档...</p>
    </div>
  );

  // 渲染错误状态
  const renderError = () => (
    <div className="pdf-preview-error">
      <div className="pdf-preview-error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3>编译错误</h3>
      <p>{error || loadError || '未知错误'}</p>
      <button 
        className="pdf-preview-compile-btn"
        onClick={onCompile}
        disabled={isCompiling}
      >
        重新编译
      </button>
    </div>
  );

  // 渲染 PDF 内容
  const renderPdf = () => (
    <div className="pdf-preview-document">
      <Document
        file={pdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<div className="pdf-preview-loading"><div className="pdf-preview-spinner" /></div>}
      >
        <Page
          pageNumber={currentPage}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      </Document>
    </div>
  );

  return (
    <div className="pdf-preview">
      {/* 工具栏 */}
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-toolbar-group">
          <button
            className="pdf-preview-toolbar-btn"
            onClick={handleZoomOut}
            disabled={!pdfUrl || scale <= 0.5}
            title="缩小"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <span className="pdf-preview-zoom-label" onClick={handleZoomReset}>
            {Math.round(scale * 100)}%
          </span>
          <button
            className="pdf-preview-toolbar-btn"
            onClick={handleZoomIn}
            disabled={!pdfUrl || scale >= 3.0}
            title="放大"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
        </div>

        {pdfUrl && numPages && (
          <div className="pdf-preview-toolbar-group">
            <button
              className="pdf-preview-toolbar-btn"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              title="上一页"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="pdf-preview-page-label">
              {currentPage} / {numPages}
            </span>
            <button
              className="pdf-preview-toolbar-btn"
              onClick={handleNextPage}
              disabled={currentPage >= numPages}
              title="下一页"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="pdf-preview-content">
        {isCompiling && renderCompiling()}
        {!isCompiling && (error || loadError) && renderError()}
        {!isCompiling && !error && !loadError && !pdfUrl && renderEmptyState()}
        {!isCompiling && !error && !loadError && pdfUrl && renderPdf()}
      </div>
    </div>
  );
}

export default PdfPreview;

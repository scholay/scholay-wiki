/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PDF 预览组件
 * 基于 react-pdf 实现，支持上下滚动翻页
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// react-pdf 10.x 使用新的样式导入方式
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PdfPreview.css';

// 设置 PDF.js worker（从 pdfjs 目录加载）
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

function PdfPreview({ 
  pdfUrl, 
  isCompiling, 
  error, 
  onCompile, 
  engineStatus,
  onAiFixError,  // 新增：让 AI 修复错误的回调
  lastSuccessfulPdf,  // 新增：上一次成功的 PDF URL
}) {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState(null);
  const [showError, setShowError] = useState(false);
  const containerRef = useRef(null);
  
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

  // 决定要显示的 PDF URL：如果有错误但有上一次成功的 PDF，显示上一次的
  const displayPdfUrl = useMemo(() => {
    if (error && lastSuccessfulPdf) {
      return lastSuccessfulPdf;
    }
    return pdfUrl;
  }, [pdfUrl, error, lastSuccessfulPdf]);

  // 当有错误时显示错误提示
  useEffect(() => {
    if (error) {
      setShowError(true);
    }
  }, [error]);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((err) => {
    console.error('PDF load error:', err);
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

  // 让 AI 修复错误
  const handleAiFixError = useCallback(() => {
    setShowError(false);
    if (onAiFixError && error) {
      onAiFixError(error);
    }
  }, [error, onAiFixError]);

  // 关闭错误提示
  const handleDismissError = useCallback(() => {
    setShowError(false);
  }, []);

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

  // 渲染错误状态（全屏，没有上一次的 PDF 时显示）
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
      <p className="pdf-preview-error-text">{error || loadError || '未知错误'}</p>
      <div className="pdf-preview-error-actions">
        <button 
          className="pdf-preview-compile-btn"
          onClick={onCompile}
          disabled={isCompiling}
        >
          重新编译
        </button>
        {onAiFixError && (
          <button 
            className="pdf-preview-fix-btn"
            onClick={handleAiFixError}
            disabled={isCompiling}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            让 AI 修复
          </button>
        )}
      </div>
    </div>
  );

  // 渲染 PDF 内容（滚动显示所有页面）
  const renderPdf = () => (
    <div className="pdf-preview-document" ref={containerRef}>
      <Document
        file={displayPdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<div className="pdf-preview-loading"><div className="pdf-preview-spinner" /></div>}
      >
        {/* 渲染所有页面，支持滚动翻页 */}
        {Array.from({ length: numPages || 0 }, (_, index) => (
          <div key={`page-${index + 1}`} className="pdf-preview-page-wrapper">
            <Page
              pageNumber={index + 1}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
            <div className="pdf-preview-page-number">
              {index + 1} / {numPages}
            </div>
          </div>
        ))}
      </Document>
    </div>
  );

  // 渲染错误提示条（有上一次的 PDF 时显示在顶部）
  const renderErrorBanner = () => (
    showError && error && (
      <div className="pdf-preview-error-banner">
        <div className="pdf-preview-error-banner-content">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="pdf-preview-error-banner-text">
            编译失败: {error.substring(0, 100)}{error.length > 100 ? '...' : ''}
          </span>
        </div>
        <div className="pdf-preview-error-banner-actions">
          {onAiFixError && (
            <button 
              className="pdf-preview-banner-fix-btn"
              onClick={handleAiFixError}
              disabled={isCompiling}
            >
              AI 修复
            </button>
          )}
          <button 
            className="pdf-preview-banner-dismiss-btn"
            onClick={handleDismissError}
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    )
  );

  return (
    <div className="pdf-preview">
      {/* 工具栏 */}
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-toolbar-group">
          <button
            className="pdf-preview-toolbar-btn"
            onClick={handleZoomOut}
            disabled={!displayPdfUrl || scale <= 0.5}
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
            disabled={!displayPdfUrl || scale >= 3.0}
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

        {displayPdfUrl && numPages && (
          <div className="pdf-preview-toolbar-group">
            <span className="pdf-preview-page-label">
              共 {numPages} 页
            </span>
          </div>
        )}

        {/* 编译按钮 */}
        <div className="pdf-preview-toolbar-group">
          <button
            className="pdf-preview-toolbar-compile-btn"
            onClick={onCompile}
            disabled={isCompiling || engineStatus === 'loading'}
            title="编译"
          >
            {isCompiling ? (
              <span className="pdf-preview-toolbar-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            )}
            <span>{isCompiling ? '编译中' : '编译'}</span>
          </button>
        </div>
      </div>

      {/* 错误提示条 */}
      {renderErrorBanner()}

      {/* 内容区域 */}
      <div className="pdf-preview-content">
        {isCompiling && !displayPdfUrl && renderCompiling()}
        {/* 如果有 PDF 正在编译，显示覆盖层 */}
        {isCompiling && displayPdfUrl && (
          <div className="pdf-preview-compiling-overlay">
            <div className="pdf-preview-spinner" />
            <p>正在编译...</p>
          </div>
        )}
        {!isCompiling && (error || loadError) && !displayPdfUrl && renderError()}
        {!displayPdfUrl && !isCompiling && !error && !loadError && renderEmptyState()}
        {displayPdfUrl && !loadError && renderPdf()}
      </div>
    </div>
  );
}

export default PdfPreview;

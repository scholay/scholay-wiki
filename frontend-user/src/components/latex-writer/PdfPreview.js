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

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  onAiFixError,  // 让 AI 修复错误的回调
  latexContent,  // LaTeX 源码内容
  fileName = 'document',  // 文件名（用于导出）
}) {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState(null);
  const [showError, setShowError] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef(null);
  const exportMenuRef = useRef(null);
  
  // 直接使用当前的 PDF URL（编译失败时保持原有显示）
  const displayPdfUrl = pdfUrl;

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

  // 点击外部关闭导出菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  // 下载 LaTeX 源码
  const handleDownloadLatex = useCallback(() => {
    if (!latexContent) {
      alert('没有可导出的内容');
      return;
    }
    
    const blob = new Blob([latexContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.tex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [latexContent, fileName]);

  // 导出为 Word（通过后端 API）
  const handleExportWord = useCallback(async () => {
    if (!latexContent) {
      alert('没有可导出的内容');
      return;
    }
    
    setIsExporting(true);
    setShowExportMenu(false);
    
    try {
      const response = await fetch('/api/v1/user/latex-writer/export/word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`,
        },
        body: JSON.stringify({ 
          content: latexContent,
          filename: fileName 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '导出失败');
      }
      
      // 下载文件
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export to Word failed:', err);
      alert(`导出 Word 失败: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [latexContent, fileName]);

  // 渲染编译中状态（首次加载和手动编译都用这个）
  const renderCompiling = () => (
    <div className="pdf-preview-loading">
      <div className="pdf-preview-spinner" />
      <p>正在编译...</p>
    </div>
  );

  // 渲染空状态（编译完成后没有 PDF 时显示）
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

  // eslint-disable-next-line no-unused-vars
  const [currentPage, setCurrentPage] = useState(1);

  // 下载 PDF
  const handleDownload = useCallback(() => {
    if (displayPdfUrl) {
      const link = document.createElement('a');
      link.href = displayPdfUrl;
      link.download = 'document.pdf';
      link.click();
    }
  }, [displayPdfUrl]);

  return (
    <div className="pdf-preview">
      {/* 工具栏 */}
      <div className="pdf-preview-toolbar">
        {/* 编译按钮 */}
        <button
          className="pdf-preview-toolbar-compile-btn"
          onClick={onCompile}
          disabled={isCompiling || engineStatus === 'loading'}
          title="编译 (Ctrl+Enter)"
        >
          {isCompiling ? (
            <span className="pdf-preview-toolbar-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22 6 12 13 2 6"/>
            </svg>
          )}
          <span>{isCompiling ? '编译中' : '编译'}</span>
        </button>

        <div className="pdf-preview-toolbar-divider" />

        {/* 页码显示 */}
        {displayPdfUrl && numPages && (
          <div className="pdf-preview-page-label">
            {currentPage} / {numPages} 页
          </div>
        )}

        <div className="pdf-preview-toolbar-spacer" />

        {/* 缩放控制 */}
        <div className="pdf-preview-toolbar-group">
          <span className="pdf-preview-zoom-label" onClick={handleZoomReset} title="重置缩放">
            {Math.round(scale * 100)}%
          </span>
          <button
            className="pdf-preview-toolbar-btn"
            onClick={handleZoomOut}
            disabled={!displayPdfUrl || scale <= 0.5}
            title="缩小"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button
            className="pdf-preview-toolbar-btn"
            onClick={handleZoomIn}
            disabled={!displayPdfUrl || scale >= 3.0}
            title="放大"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="pdf-preview-toolbar-divider" />

        {/* 下载按钮 */}
        <button
          className="pdf-preview-download-btn"
          onClick={handleDownload}
          disabled={!displayPdfUrl}
          title="下载 PDF"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        {/* 导出菜单 */}
        <div className="pdf-preview-export-wrapper" ref={exportMenuRef}>
          <button
            className={`pdf-preview-export-btn ${showExportMenu ? 'active' : ''}`}
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={!latexContent || isExporting}
            title="导出"
          >
            {isExporting ? (
              <div className="pdf-preview-export-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1"/>
                <polyline points="8 8 12 4 16 8"/>
                <line x1="12" y1="4" x2="12" y2="16"/>
              </svg>
            )}
            <span className="pdf-preview-export-text">导出</span>
            <svg className="pdf-preview-export-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          
          {showExportMenu && (
            <div className="pdf-preview-export-menu">
              <button 
                className="pdf-preview-export-item"
                onClick={handleDownloadLatex}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <span>下载 LaTeX 源码 (.tex)</span>
              </button>
              <button 
                className="pdf-preview-export-item"
                onClick={handleExportWord}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M9 15l2 2 4-4"/>
                </svg>
                <span>导出为 Word (.docx)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 错误提示条 */}
      {renderErrorBanner()}

      {/* 内容区域 */}
      <div className="pdf-preview-content">
        {/* 编译中状态 */}
        {isCompiling && !displayPdfUrl && renderCompiling()}
        {/* 如果有 PDF 正在编译，显示覆盖层 */}
        {isCompiling && displayPdfUrl && (
          <div className="pdf-preview-compiling-overlay">
            <div className="pdf-preview-spinner" />
            <p>正在编译...</p>
          </div>
        )}
        {/* 错误状态 */}
        {!isCompiling && (error || loadError) && !displayPdfUrl && renderError()}
        {/* 空状态（没有 PDF 且未在编译） */}
        {!displayPdfUrl && !isCompiling && !error && !loadError && renderEmptyState()}
        {/* 显示 PDF */}
        {displayPdfUrl && !loadError && renderPdf()}

      </div>
    </div>
  );
}

export default PdfPreview;

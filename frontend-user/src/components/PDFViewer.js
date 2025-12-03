/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PDFViewer.css';

// 为 PDF.js 指定静态 worker 文件
const publicBase = process.env.PUBLIC_URL || '';
const pdfWorkerSrc = `${publicBase}/pdf.worker.min.mjs`;
const pdfAssetsBase = `${publicBase}/pdfjs`;
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const PDFViewer = React.memo(({ pdfUrl, paperTitle }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [autoOpenOnError, setAutoOpenOnError] = useState(() => {
    // 从 localStorage 读取用户偏好
    const saved = localStorage.getItem('pdf_auto_open_on_error');
    return saved === 'true';
  });
  const contentRef = useRef(null);
  const documentRef = useRef(null);
  const hasAutoOpenedRef = useRef(false); // 防止重复打开

  // 使用外部预览服务，使用 useMemo 确保只在 pdfUrl 变化时重新计算
  const proxyUrl = useMemo(
    () => `https://filepreview.scholay.com/api/preview?url=${encodeURIComponent(pdfUrl)}`,
    [pdfUrl]
  );

  // 只在 pdfUrl 原始值变化时重置状态
  useEffect(() => {
    setNumPages(null);
    setIsLoading(true);
    setError(null);
    setScale(1.0);
    setIsUnmounted(false);
    hasAutoOpenedRef.current = false; // 重置自动打开标记
  }, [pdfUrl]);

  // 切换自动打开设置
  const toggleAutoOpen = () => {
    const newValue = !autoOpenOnError;
    setAutoOpenOnError(newValue);
    localStorage.setItem('pdf_auto_open_on_error', String(newValue));
  };

  // 组件卸载时的清理
  useEffect(() => {
    return () => {
      setIsUnmounted(true);
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    if (isUnmounted) return;
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  };

  const onPageRenderSuccess = () => {
    if (isUnmounted) return;
    // 当第一页渲染完成后,初始化滚动位置到中心
    if (contentRef.current) {
      setTimeout(() => {
        if (contentRef.current) {
        const container = contentRef.current;
        container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
        }
      }, 100);
    }
  };

  const onDocumentLoadError = (error) => {
    if (isUnmounted) return;
    console.error('PDF加载失败:', error);
    setError('PDF 暂时无法加载，请点击下方按钮在新窗口中查看');
    setIsLoading(false);
    
    // 如果开启了自动打开，且还未自动打开过，则自动在新窗口打开
    if (autoOpenOnError && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 配置PDF加载选项 - 使用 useMemo 避免每次渲染都创建新对象
  const pdfOptions = useMemo(() => ({
    withCredentials: false,
  }), []);

  const documentOptions = useMemo(() => ({
    cMapUrl: `${pdfAssetsBase}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfAssetsBase}/standard_fonts/`,
  }), []);

  // 创建稳定的 file 对象，避免 Document 组件因对象引用变化而重新挂载
  const fileConfig = useMemo(() => ({
    url: proxyUrl,
    ...pdfOptions
  }), [proxyUrl, pdfOptions]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 5.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  return (
    <div className="pdf-viewer">
      {/* 工具栏 */}
      <div className="pdf-toolbar">
        <div className="pdf-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="pdf-title">{paperTitle || 'PDF预览'}</span>
        </div>

        <div className="pdf-controls">
          {/* 缩放控制 */}
          <div className="zoom-controls">
            <button
              className="control-btn"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              title="缩小"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button
              className="control-btn"
              onClick={handleZoomIn}
              disabled={scale >= 5.0}
              title="放大"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <button
              className="control-btn"
              onClick={handleResetZoom}
              title="重置缩放"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>

          <div className="divider"></div>

          {numPages && (
            <div className="page-controls">
              <span className="page-info">共 {numPages} 页</span>
            </div>
          )}

          <div className="divider"></div>

          {/* 外部打开 */}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="control-btn external-btn"
            title="在新窗口打开"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>

      {/* PDF 内容区域 */}
      <div ref={contentRef} className={`pdf-content ${isLoading ? 'pdf-content--loading' : ''}`}>
        {isLoading && !error && (
          <div className="pdf-skeleton-overlay" aria-hidden="true">
            <div className="pdf-skeleton">
              {Array.from({ length: Math.min(numPages || 3, 3) }, (_, index) => (
                <div className="pdf-skeleton-page" key={`skeleton_${index}`}>
                  <div className="pdf-skeleton-shimmer" />
                </div>
              ))}
              <span className="pdf-skeleton-text">正在准备PDF预览…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="pdf-error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{error}</p>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="fallback-link">
              在新窗口打开PDF
            </a>
            <label className="auto-open-toggle">
              <input
                type="checkbox"
                checked={autoOpenOnError}
                onChange={toggleAutoOpen}
              />
              <span className="toggle-label">加载失败时自动打开</span>
            </label>
          </div>
        )}

        {!error && (
          <Document
            file={fileConfig}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
            error=""
            className="pdf-document"
            options={documentOptions}
          >
              {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
                .map(pageNumber => (
                  <Page
                    key={`page_${pageNumber}`}
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="pdf-page"
                    loading=""
                    error=""
                    onRenderSuccess={pageNumber === 1 ? onPageRenderSuccess : undefined}
                  />
                ))}
          </Document>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数：只在 pdfUrl 或 paperTitle 实际变化时才重新渲染
  return prevProps.pdfUrl === nextProps.pdfUrl &&
         prevProps.paperTitle === nextProps.paperTitle;
});

export default PDFViewer;

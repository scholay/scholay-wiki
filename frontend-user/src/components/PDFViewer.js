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
import { trackPDFPreview, EntryPoint } from '../utils/usageTracker';
import './PDFViewer.css';

// 使用 CDN 版本的 PDF.js worker（与 pdfjs-dist 版本匹配）
const PDFJS_VERSION = pdfjs.version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// PDF 资源路径（仍使用本地 cmaps 和 fonts）
const publicBase = process.env.PUBLIC_URL || '';
const pdfAssetsBase = `${publicBase}/pdfjs`;

// PDF 服务配置
const PDF_API_URL = 'https://pdf.scholay.com/api/v1/pdf';
const SCIHUB_BASE_URL = 'https://sci-hub.box';

// 生成 Sci-Hub URL
const getSciHubUrl = (doi) => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

const PDFViewer = React.memo(({ pdfUrl, paperTitle, doi, isCheckedPdf = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [pdfData, setPdfData] = useState(null); // 存储 PDF blob 数据
  const [isFetchingDoi, setIsFetchingDoi] = useState(false); // DOI API 请求中
  const [useFallback, setUseFallback] = useState(false); // 是否使用备用方案
  const [autoOpenOnError, setAutoOpenOnError] = useState(() => {
    // 从 localStorage 读取用户偏好
    const saved = localStorage.getItem('pdf_auto_open_on_error');
    return saved === 'true';
  });
  const contentRef = useRef(null);
  const hasAutoOpenedRef = useRef(false); // 防止重复打开
  const abortControllerRef = useRef(null); // 用于取消请求

  // 备用：使用外部预览服务（当 DOI API 不可用时）
  const proxyUrl = useMemo(
    () => pdfUrl ? `https://filepreview.scholay.com/api/preview?url=${encodeURIComponent(pdfUrl)}` : null,
    [pdfUrl]
  );

  // Sci-Hub 链接（当 PDF 加载失败时显示）
  const sciHubUrl = useMemo(() => getSciHubUrl(doi), [doi]);

  // 通过 DOI 获取 PDF
  useEffect(() => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 重置状态
    setNumPages(null);
    setIsLoading(true);
    setError(null);
    setScale(1.0);
    setIsUnmounted(false);
    setPdfData(null);
    setUseFallback(false);
    hasAutoOpenedRef.current = false;

    // 记录PDF预览使用统计
    if (pdfUrl) {
      trackPDFPreview(pdfUrl, EntryPoint.PAPER_DETAIL_PAGE);
    }

    // 如果有 DOI，使用新的 PDF API
    // 对于已检测的 PDF（isCheckedPdf），必须使用 DOI API
    if (doi) {
      setIsFetchingDoi(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fetchPdfByDoi = async () => {
        try {
          const response = await fetch(PDF_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ doi }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`PDF API 返回错误: ${response.status}`);
          }

          const blob = await response.blob();
          
          if (!controller.signal.aborted) {
            // 将 blob 转换为 ArrayBuffer 给 react-pdf 使用
            const arrayBuffer = await blob.arrayBuffer();
            setPdfData({ data: arrayBuffer });
            setIsFetchingDoi(false);
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // 请求被取消，忽略
          }
          console.warn('DOI PDF API 失败:', err);
          
          if (!controller.signal.aborted) {
            // 如果是已检测的 PDF（非开放获取），没有备用方案，显示错误
            if (isCheckedPdf || !pdfUrl) {
              setPdfData(null);
              setUseFallback(false);
              setIsFetchingDoi(false);
              setIsLoading(false);
              setError('PDF 加载失败，请尝试通过 Sci-Hub 获取');
            } else {
              // DOI API 失败，回退到代理服务
              setPdfData(null);
              setUseFallback(true);
              setIsFetchingDoi(false);
            }
          }
        }
      };

      fetchPdfByDoi();

      return () => {
        controller.abort();
      };
    } else if (pdfUrl) {
      // 没有 DOI 但有 pdfUrl，使用备用方案
      setUseFallback(true);
    } else {
      // 既没有 DOI 也没有 pdfUrl
      setIsLoading(false);
      setError('没有可用的 PDF 来源');
    }
  }, [pdfUrl, doi, isCheckedPdf]);

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
      // 取消正在进行的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
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
  // 优先使用 DOI API 返回的数据，否则使用代理服务
  const fileConfig = useMemo(() => {
    if (pdfData) {
      // 使用从 DOI API 获取的数据
      return pdfData;
    }
    if (useFallback) {
      // 回退到代理服务
      return {
        url: proxyUrl,
        ...pdfOptions
      };
    }
    // 还在请求中，返回 null
    return null;
  }, [pdfData, useFallback, proxyUrl, pdfOptions]);

  // 是否可以渲染 PDF Document
  const canRenderDocument = !isFetchingDoi && fileConfig !== null;

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
          {(pdfUrl || sciHubUrl) && (
            <a
              href={pdfUrl || sciHubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="control-btn external-btn"
              title={pdfUrl ? "在新窗口打开" : "通过 Sci-Hub 打开"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
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
            
            {/* 如果有原始 PDF URL，显示打开链接 */}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="fallback-link">
                在新窗口打开PDF
              </a>
            )}
            
            {/* 如果有 DOI，显示 Sci-Hub 链接 */}
            {sciHubUrl && (
              <a href={sciHubUrl} target="_blank" rel="noopener noreferrer" className="fallback-link scihub-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                通过 Sci-Hub 获取
              </a>
            )}
            
            {pdfUrl && (
              <label className="auto-open-toggle">
                <input
                  type="checkbox"
                  checked={autoOpenOnError}
                  onChange={toggleAutoOpen}
                />
                <span className="toggle-label">加载失败时自动打开</span>
              </label>
            )}
          </div>
        )}

        {!error && canRenderDocument && (
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
  // 自定义比较函数：只在关键 props 变化时才重新渲染
  return prevProps.pdfUrl === nextProps.pdfUrl &&
         prevProps.paperTitle === nextProps.paperTitle &&
         prevProps.doi === nextProps.doi &&
         prevProps.isCheckedPdf === nextProps.isCheckedPdf;
});

export default PDFViewer;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { trackPDFPreview, EntryPoint } from '../../utils/usageTracker';
import logger from '../../utils/logger';
import { PDF_PREVIEW_ENDPOINT } from '../../config/site';
import { PDFToolbar, TranslatePanel } from '.';
import './PDFViewer.css';

// PDF 资源路径
const publicBase = process.env.PUBLIC_URL || '';
const pdfAssetsBase = `${publicBase}/pdfjs`;

// 使用 CDN 加载 worker（更可靠）
const PDFJS_VERSION = pdfjs.version;

// 优先使用 jsDelivr CDN（国内访问更快），unpkg 作为备用
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// 内存优化配置：只渲染可见页面附近的页面
const PAGES_TO_RENDER_BEFORE = 1;  // 当前页之前渲染的页数（减少以加快首次渲染）
const PAGES_TO_RENDER_AFTER = 2;   // 当前页之后渲染的页面
const MAX_RENDERED_PAGES = 6;      // 最大同时渲染的页数（减少以加快渲染）

// PDF 服务配置
// 使用本地后端接口（通过 Nginx 代理）
const PDF_API_URL = '/api/v1/pdf';
const SCIHUB_BASE_URL = 'https://sci-hub.box';

// 生成 Sci-Hub URL
const getSciHubUrl = (doi) => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

// PDFViewer 组件
// pdfUrl: 开放获取的 PDF URL（可选）
// paperTitle: 论文标题
// doi: 论文 DOI（必填，用于后端获取 PDF）
// isCheckedPdf: 是否为已检测的非开放获取 PDF
const PDFViewer = React.memo(({ pdfUrl, paperTitle, doi, isCheckedPdf = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(true); // 页面渲染中状态
  const [error, setError] = useState(null);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null); // 存储 PDF Blob 数据（不存储 ArrayBuffer，避免 detached）
  const [isFetchingDoi, setIsFetchingDoi] = useState(false); // DOI API 请求中
  const [useFallback, setUseFallback] = useState(false); // 是否使用备用方案
  const [enableTextLayer, setEnableTextLayer] = useState(false); // 延迟启用文本层
  const [autoOpenOnError, setAutoOpenOnError] = useState(() => {
    // 从 localStorage 读取用户偏好
    const saved = localStorage.getItem('pdf_auto_open_on_error');
    return saved === 'true';
  });
  const [isFullscreen, setIsFullscreen] = useState(false); // 全屏预览状态
  const [fullscreenScale, setFullscreenScale] = useState(1.2); // 全屏模式独立缩放
  const [showTranslateTip, setShowTranslateTip] = useState(() => {
    // 从 localStorage 读取翻译提示关闭偏好
    return localStorage.getItem('pdf_translate_tip_dismissed') !== 'true';
  });
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1); // 当前可见页面（用于懒加载优化）
  const contentRef = useRef(null);
  const fullscreenContentRef = useRef(null);
  const hasAutoOpenedRef = useRef(false); // 防止重复打开
  const abortControllerRef = useRef(null); // 用于取消请求

  // 计算需要渲染的页面范围（内存优化：只渲染可见页面附近的页面）
  const pagesToRender = useMemo(() => {
    if (!numPages) return [];

    // 对于小型 PDF（<=10页），渲染所有页面
    if (numPages <= MAX_RENDERED_PAGES) {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }

    // 对于大型 PDF，只渲染当前可见页面附近的页面
    const startPage = Math.max(1, currentVisiblePage - PAGES_TO_RENDER_BEFORE);
    const endPage = Math.min(numPages, currentVisiblePage + PAGES_TO_RENDER_AFTER);

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [numPages, currentVisiblePage]);

  // 监听滚动以更新当前可见页面（用于懒加载）
  useEffect(() => {
    const container = isFullscreen ? fullscreenContentRef.current : contentRef.current;
    if (!container || !numPages || numPages <= MAX_RENDERED_PAGES) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const pages = container.querySelectorAll('.pdf-page');
        if (pages.length === 0) {
          ticking = false;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 2;

        let closestPage = 1;
        let closestDistance = Infinity;

        pages.forEach((page) => {
          const pageRect = page.getBoundingClientRect();
          const pageCenter = pageRect.top + pageRect.height / 2;
          const distance = Math.abs(pageCenter - containerCenter);

          if (distance < closestDistance) {
            closestDistance = distance;
            // 从 data 属性或页面顺序获取页码
            const pageNumber = parseInt(page.dataset?.pageNumber || '1', 10);
            if (!isNaN(pageNumber)) {
              closestPage = pageNumber;
            }
          }
        });

        setCurrentVisiblePage(closestPage);
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isFullscreen, numPages]);

  // 备用：使用外部预览服务（当 DOI API 不可用时）
  const proxyUrl = useMemo(
    () => pdfUrl ? `${PDF_PREVIEW_ENDPOINT}?url=${encodeURIComponent(pdfUrl)}` : null,
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
    setIsRendering(true);
    setError(null);
    setScale(1.0);
    setIsUnmounted(false);
    setPdfBlob(null);
    setUseFallback(false);
    setEnableTextLayer(false);
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
          // 构建请求体，如果有 pdfUrl 则传递给后端作为优先来源
          const requestBody = { doi };
          if (pdfUrl) {
            requestBody.pdf_url = pdfUrl;
          }

          const response = await fetch(PDF_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`PDF API 返回错误: ${response.status}`);
          }

          // 读取自定义响应头（来源和缓存状态）
          const pdfSource = response.headers.get('X-PDF-Source');
          const cacheStatus = response.headers.get('X-Cache');
          logger.log('[PDFViewer] PDF Source:', pdfSource, 'Cache:', cacheStatus);

          const blob = await response.blob();

          if (!controller.signal.aborted) {
            // 验证 Blob 有效性
            if (!blob || blob.size === 0) {
              throw new Error('PDF 数据为空');
            }

            // 检查是否为 PDF 类型（允许 application/pdf 或 application/octet-stream）
            const validTypes = ['application/pdf', 'application/octet-stream', ''];
            if (!validTypes.includes(blob.type)) {
              logger.warn('PDF Blob 类型:', blob.type, '大小:', blob.size);
            }

            logger.log('[PDFViewer] PDF 数据获取成功, 大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

            // 存储 Blob，后续需要时再转换为 ArrayBuffer
            setPdfBlob(blob);
            setIsFetchingDoi(false);
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // 请求被取消，忽略
          }
          logger.warn('DOI PDF API 失败:', err);

          if (!controller.signal.aborted) {
            // 如果是已检测的 PDF（非开放获取），没有备用方案，显示错误
            if (isCheckedPdf || !pdfUrl) {
              setPdfBlob(null);
              setUseFallback(false);
              setIsFetchingDoi(false);
              setIsLoading(false);
              setError('PDF 加载失败，请尝试通过 Sci-Hub 获取');
            } else {
              // DOI API 失败，回退到代理服务
              setPdfBlob(null);
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

  // 组件卸载时的清理（内存优化：清理 PDF Blob）
  useEffect(() => {
    return () => {
      setIsUnmounted(true);
      // 取消正在进行的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 清理 PDF Blob 以释放内存
      setPdfBlob(null);
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    if (isUnmounted) return;
    logger.log('[PDFViewer] PDF 解析成功, 总页数:', numPages);
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    // 延迟启用文本层，让页面先快速渲染出来
    setTimeout(() => {
      if (!isUnmounted) {
        setEnableTextLayer(true);
      }
    }, 500);
  };

  const onPageRenderSuccess = useCallback(() => {
    if (isUnmounted) return;
    // 标记渲染完成
    setIsRendering(false);
    // 当第一页渲染完成后,初始化滚动位置到中心
    if (contentRef.current) {
      setTimeout(() => {
        if (contentRef.current) {
          const container = contentRef.current;
          container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
        }
      }, 50);
    }
  }, [isUnmounted]);

  const onDocumentLoadError = (error) => {
    if (isUnmounted) return;
    console.error('[PDFViewer] PDF 解析失败:', error);
    console.error('[PDFViewer] 错误详情:', error?.message || error);

    // 提供更详细的错误信息
    let errorMessage = 'PDF 暂时无法加载';
    if (error?.message?.includes('Invalid PDF')) {
      errorMessage = 'PDF 文件格式无效';
    } else if (error?.message?.includes('Missing PDF')) {
      errorMessage = 'PDF 文件损坏或不完整';
    } else if (error?.message?.includes('password')) {
      errorMessage = 'PDF 文件需要密码';
    }

    setError(`${errorMessage}，请点击下方按钮在新窗口中查看`);
    setIsLoading(false);
    setIsRendering(false);

    // 如果开启了自动打开，且还未自动打开过，则自动在新窗口打开
    if (autoOpenOnError && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      window.open(pdfUrl, '_blank', 'noopener');
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

  // 从 Blob 创建 Object URL，避免 ArrayBuffer detached 问题
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (pdfBlob) {
      logger.log('[PDFViewer] 创建 Blob URL, Blob 大小:', pdfBlob.size);
      const url = URL.createObjectURL(pdfBlob);
      logger.log('[PDFViewer] Blob URL 已创建:', url);
      setBlobUrl(url);
      return () => {
        logger.log('[PDFViewer] 清理 Blob URL');
        URL.revokeObjectURL(url);
      };
    } else {
      setBlobUrl(null);
    }
  }, [pdfBlob]);

  // 创建稳定的 file 对象，避免 Document 组件因对象引用变化而重新挂载
  // 优先使用 DOI API 返回的数据（Blob URL），否则使用代理服务
  const fileConfig = useMemo(() => {
    if (blobUrl) {
      logger.log('[PDFViewer] 使用 Blob URL 加载 PDF');
      // 使用从 DOI API 获取的 Blob URL
      return {
        url: blobUrl,
        ...pdfOptions
      };
    }
    if (useFallback) {
      logger.log('[PDFViewer] 使用代理服务加载 PDF');
      // 回退到代理服务
      return {
        url: proxyUrl,
        ...pdfOptions
      };
    }
    // 还在请求中，返回 null
    return null;
  }, [blobUrl, useFallback, proxyUrl, pdfOptions]);

  // 是否可以渲染 PDF Document
  const canRenderDocument = !isFetchingDoi && fileConfig !== null;

  // Debug: 监控渲染条件
  useEffect(() => {
    logger.log('[PDFViewer] 渲染条件:', {
      isFetchingDoi,
      hasFileConfig: fileConfig !== null,
      canRenderDocument,
      hasBlobUrl: !!blobUrl,
      useFallback,
      isLoading,
      error
    });
  }, [isFetchingDoi, fileConfig, canRenderDocument, blobUrl, useFallback, isLoading, error]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 5.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  // 下载 PDF（使用已有数据，不重复请求）
  const handleDownload = useCallback(() => {
    if (!pdfBlob) return;

    // 直接使用 Blob 创建下载链接
    const url = URL.createObjectURL(pdfBlob);

    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    // 清理文件名中的特殊字符
    const safeName = (paperTitle || 'paper').replace(/[<>:"/\\|?*]/g, '_');
    link.download = `${safeName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }, [pdfBlob, paperTitle]);

  // 打开全屏预览
  const handleOpenFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setFullscreenScale(1.2); // 全屏模式默认更大的缩放
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
  }, []);

  // 关闭全屏预览
  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
    // 恢复背景滚动
    document.body.style.overflow = '';
  }, []);

  // ESC 键关闭全屏
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleCloseFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, handleCloseFullscreen]);

  // 全屏模式缩放控制
  const handleFullscreenZoomIn = () => {
    setFullscreenScale(prev => Math.min(prev + 0.2, 5.0));
  };

  const handleFullscreenZoomOut = () => {
    setFullscreenScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleFullscreenResetZoom = () => {
    setFullscreenScale(1.2);
  };

  // 关闭翻译提示条（并持久化用户偏好）
  const handleCloseTip = useCallback(() => {
    setShowTranslateTip(false);
    localStorage.setItem('pdf_translate_tip_dismissed', 'true');
  }, []);

  return (
    <div className="pdf-viewer">
      {/* 工具栏 */}
      <PDFToolbar
        paperTitle={paperTitle}
        scale={scale}
        numPages={numPages}
        pdfBlob={pdfBlob}
        pdfUrl={pdfUrl}
        sciHubUrl={sciHubUrl}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onOpenFullscreen={handleOpenFullscreen}
        onDownload={handleDownload}
      />

      {/* PDF 内容区域 */}
      <div ref={contentRef} className={`pdf-content ${isLoading || isRendering ? 'pdf-content--loading' : ''}`}>
        {(isLoading || (isRendering && numPages)) && !error && (
          <div className="pdf-skeleton-overlay" aria-hidden="true">
            <div className="pdf-skeleton">
              {Array.from({ length: Math.min(numPages || 3, 3) }, (_, index) => (
                <div className="pdf-skeleton-page" key={`skeleton_${index}`}>
                  <div className="pdf-skeleton-shimmer" />
                </div>
              ))}
              <span className="pdf-skeleton-text">
                {isFetchingDoi ? '正在获取PDF数据…' :
                 isLoading ? '正在解析PDF…' :
                 '正在渲染页面…'}
              </span>
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
              <a href={pdfUrl} target="_blank" rel="noopener" className="fallback-link">
                在新窗口打开PDF
              </a>
            )}

            {/* 如果有 DOI，显示 Sci-Hub 链接 */}
            {sciHubUrl && (
              <a href={sciHubUrl} target="_blank" rel="noopener" className="fallback-link scihub-link">
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

        {!error && canRenderDocument && !isFullscreen && (
          <Document
            file={fileConfig}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
            error=""
            className="pdf-document"
            options={documentOptions}
          >
              {/* 内存优化：只渲染可见页面附近的页面，使用占位符保持滚动位置 */}
              {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
                .map(pageNumber => {
                  const shouldRender = pagesToRender.includes(pageNumber);
                  if (!shouldRender) {
                    // 渲染占位符以保持滚动高度
                    return (
                      <div
                        key={`placeholder_${pageNumber}`}
                        className="pdf-page-placeholder"
                        style={{
                          height: `${Math.round(800 * scale)}px`,
                          width: `${Math.round(600 * scale)}px`,
                        }}
                        data-page-number={pageNumber}
                      />
                    );
                  }
                  return (
                    <Page
                      key={`page_${pageNumber}`}
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={enableTextLayer}
                      renderAnnotationLayer={enableTextLayer}
                      className="pdf-page"
                      loading=""
                      error=""
                      onRenderSuccess={pageNumber === 1 ? onPageRenderSuccess : undefined}
                      data-page-number={pageNumber}
                    />
                  );
                })}
          </Document>
        )}

        {/* 非全屏：划词翻译面板（含提示条 + 翻译弹窗） */}
        {!isFullscreen && (
          <TranslatePanel
            containerRef={contentRef}
            active={!!numPages && !error}
            isFullscreen={false}
            showTip={showTranslateTip && !!numPages}
            onDismissTip={handleCloseTip}
          />
        )}
      </div>

      {/* 全屏预览弹窗 */}
      {isFullscreen && numPages && createPortal(
        <div className="pdf-fullscreen-overlay" onClick={handleCloseFullscreen}>
          <div className="pdf-fullscreen-modal" onClick={(e) => e.stopPropagation()}>
            {/* 全屏工具栏 */}
            <div className="pdf-fullscreen-toolbar">
              <div className="pdf-fullscreen-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{paperTitle || 'PDF预览'}</span>
              </div>

              <div className="pdf-fullscreen-controls">
                {/* 缩放控制 */}
                <button
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenZoomOut}
                  disabled={fullscreenScale <= 0.5}
                  title="缩小"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </button>
                <span className="fullscreen-zoom-level">{Math.round(fullscreenScale * 100)}%</span>
                <button
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenZoomIn}
                  disabled={fullscreenScale >= 5.0}
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
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenResetZoom}
                  title="重置缩放"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>

                <div className="fullscreen-divider"></div>

                {numPages && (
                  <span className="fullscreen-page-info">共 {numPages} 页</span>
                )}

                <div className="fullscreen-divider"></div>

                {/* 下载按钮 */}
                <button
                  className="fullscreen-control-btn"
                  onClick={handleDownload}
                  title="下载 PDF"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>

                {/* 关闭按钮 */}
                <button
                  className="fullscreen-control-btn fullscreen-close-btn"
                  onClick={handleCloseFullscreen}
                  title="关闭 (ESC)"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* 全屏 PDF 内容 */}
            <div ref={fullscreenContentRef} className="pdf-fullscreen-content">
              <Document
                file={fileConfig}
                loading=""
                error=""
                className="pdf-document"
                options={documentOptions}
              >
                {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
                  .map(pageNumber => (
                    <Page
                      key={`fullscreen_page_${pageNumber}`}
                      pageNumber={pageNumber}
                      scale={fullscreenScale}
                      renderTextLayer={enableTextLayer}
                      renderAnnotationLayer={enableTextLayer}
                      className="pdf-page"
                      loading=""
                      error=""
                    />
                  ))}
              </Document>

              {/* 全屏：划词翻译面板（含提示条 + 翻译弹窗） */}
              <TranslatePanel
                containerRef={fullscreenContentRef}
                active={!!numPages}
                isFullscreen={true}
                showTip={showTranslateTip}
                onDismissTip={handleCloseTip}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
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

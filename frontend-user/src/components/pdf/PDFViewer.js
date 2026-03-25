/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { trackPDFPreview, trackPDFSelectionTranslate, EntryPoint } from '../../utils/usageTracker';
import { usePaperTranslation, isPrimarilyChinese } from '../../hooks/usePaperTranslation';
import PDFToolbar from './PDFToolbar';
import PDFTranslateTip from './PDFTranslateTip';
import PDFTranslatePopup from './PDFTranslatePopup';
import PDFFullscreenModal from './PDFFullscreenModal';
import '../PDFViewer.css';

const publicBase = import.meta.env.BASE_URL || '';
const pdfAssetsBase = `${publicBase}/pdfjs`;

const PDFJS_VERSION = pdfjs.version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

const PAGES_TO_RENDER_BEFORE = 1;
const PAGES_TO_RENDER_AFTER = 2;
const MAX_RENDERED_PAGES = 6;

const PDF_API_URL = '/api/v1/pdf';
const SCIHUB_BASE_URL = 'https://sci-hub.box';

const getSciHubUrl = (doi) => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

const PDFViewer = React.memo(({ pdfUrl, paperTitle, doi, isCheckedPdf = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState(null);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [isFetchingDoi, setIsFetchingDoi] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [enableTextLayer, setEnableTextLayer] = useState(false);
  const [autoOpenOnError, setAutoOpenOnError] = useState(() => {
    const saved = localStorage.getItem('pdf_auto_open_on_error');
    return saved === 'true';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenScale, setFullscreenScale] = useState(1.2);
  const [showTranslateTip, setShowTranslateTip] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState(null);
  const [showTranslatePopup, setShowTranslatePopup] = useState(false);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const contentRef = useRef(null);
  const hasAutoOpenedRef = useRef(false);
  const abortControllerRef = useRef(null);
  
  const translation = usePaperTranslation();

  // 计算需要渲染的页面范围
  const pagesToRender = useMemo(() => {
    if (!numPages) return [];
    if (numPages <= MAX_RENDERED_PAGES) {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    const startPage = Math.max(1, currentVisiblePage - PAGES_TO_RENDER_BEFORE);
    const endPage = Math.min(numPages, currentVisiblePage + PAGES_TO_RENDER_AFTER);
    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [numPages, currentVisiblePage]);

  // 监听滚动以更新当前可见页面（普通模式）
  useEffect(() => {
    if (isFullscreen) return;
    const container = contentRef.current;
    if (!container || !numPages || numPages <= MAX_RENDERED_PAGES) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const pages = container.querySelectorAll('.pdf-page');
        if (pages.length === 0) { ticking = false; return; }
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
            const pageNumber = parseInt(page.dataset?.pageNumber || '1', 10);
            if (!isNaN(pageNumber)) closestPage = pageNumber;
          }
        });
        setCurrentVisiblePage(closestPage);
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isFullscreen, numPages]);

  const proxyUrl = useMemo(
    () => pdfUrl ? `https://filepreview.scholay.com/api/preview?url=${encodeURIComponent(pdfUrl)}` : null,
    [pdfUrl]
  );

  const sciHubUrl = useMemo(() => getSciHubUrl(doi), [doi]);

  // 通过 DOI 获取 PDF
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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

    if (pdfUrl) {
      trackPDFPreview(pdfUrl, EntryPoint.PAPER_DETAIL_PAGE);
    }

    if (doi) {
      setIsFetchingDoi(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fetchPdfByDoi = async () => {
        try {
          const requestBody = { doi };
          if (pdfUrl) requestBody.pdf_url = pdfUrl;
          
          const response = await fetch(PDF_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) throw new Error(`PDF API 返回错误: ${response.status}`);

          const blob = await response.blob();
          
          if (!controller.signal.aborted) {
            if (!blob || blob.size === 0) throw new Error('PDF 数据为空');
            const validTypes = ['application/pdf', 'application/octet-stream', ''];
            if (!validTypes.includes(blob.type)) {
              console.warn('PDF Blob 类型:', blob.type, '大小:', blob.size);
            }
            setPdfBlob(blob);
            setIsFetchingDoi(false);
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('DOI PDF API 失败:', err);
          
          if (!controller.signal.aborted) {
            if (isCheckedPdf || !pdfUrl) {
              setPdfBlob(null);
              setUseFallback(false);
              setIsFetchingDoi(false);
              setIsLoading(false);
              setError('PDF 加载失败，请尝试通过 Sci-Hub 获取');
            } else {
              setPdfBlob(null);
              setUseFallback(true);
              setIsFetchingDoi(false);
            }
          }
        }
      };

      fetchPdfByDoi();
      return () => { controller.abort(); };
    } else if (pdfUrl) {
      setUseFallback(true);
    } else {
      setIsLoading(false);
      setError('没有可用的 PDF 来源');
    }
  }, [pdfUrl, doi, isCheckedPdf]);

  const toggleAutoOpen = () => {
    const newValue = !autoOpenOnError;
    setAutoOpenOnError(newValue);
    localStorage.setItem('pdf_auto_open_on_error', String(newValue));
  };

  useEffect(() => {
    return () => {
      setIsUnmounted(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setPdfBlob(null);
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    if (isUnmounted) return;
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    setTimeout(() => {
      if (!isUnmounted) setEnableTextLayer(true);
    }, 500);
  };

  const onPageRenderSuccess = useCallback(() => {
    if (isUnmounted) return;
    setIsRendering(false);
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
    
    let errorMessage = 'PDF 暂时无法加载';
    if (error?.message?.includes('Invalid PDF')) errorMessage = 'PDF 文件格式无效';
    else if (error?.message?.includes('Missing PDF')) errorMessage = 'PDF 文件损坏或不完整';
    else if (error?.message?.includes('password')) errorMessage = 'PDF 文件需要密码';
    
    setError(`${errorMessage}，请点击下方按钮在新窗口中查看`);
    setIsLoading(false);
    setIsRendering(false);
    
    if (autoOpenOnError && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      window.open(pdfUrl, '_blank', 'noopener');
    }
  };

  const pdfOptions = useMemo(() => ({ withCredentials: false }), []);

  const documentOptions = useMemo(() => ({
    cMapUrl: `${pdfAssetsBase}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfAssetsBase}/standard_fonts/`,
  }), []);

  const [blobUrl, setBlobUrl] = useState(null);
  
  useEffect(() => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBlobUrl(null);
    }
  }, [pdfBlob]);

  const fileConfig = useMemo(() => {
    if (blobUrl) return { url: blobUrl, ...pdfOptions };
    if (useFallback) return { url: proxyUrl, ...pdfOptions };
    return null;
  }, [blobUrl, useFallback, proxyUrl, pdfOptions]);

  const canRenderDocument = !isFetchingDoi && fileConfig !== null;

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 5.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setScale(1.0);

  const handleDownload = useCallback(() => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = (paperTitle || 'paper').replace(/[<>:"/\\|?*]/g, '_');
    link.download = `${safeName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [pdfBlob, paperTitle]);

  const handleOpenFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setFullscreenScale(1.2);
    document.body.style.overflow = 'hidden';
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
    document.body.style.overflow = '';
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) handleCloseFullscreen();
    };
    if (isFullscreen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleCloseFullscreen]);

  const handleFullscreenZoomIn = () => setFullscreenScale(prev => Math.min(prev + 0.2, 5.0));
  const handleFullscreenZoomOut = () => setFullscreenScale(prev => Math.max(prev - 0.2, 0.5));
  const handleFullscreenResetZoom = () => setFullscreenScale(1.2);

  const handleCloseTip = useCallback(() => {
    setShowTranslateTip(false);
    localStorage.setItem('pdf_translate_tip_dismissed', 'true');
  }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem('pdf_translate_tip_dismissed');
    if (dismissed === 'true') setShowTranslateTip(false);
  }, []);

  const handleTextSelection = useCallback((containerRef, mouseX, mouseY) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    
    if (text && text.length > 0 && text.length < 2000) {
      if (!isPrimarilyChinese(text)) {
        const container = containerRef?.current;
        const containerRect = container?.getBoundingClientRect() || { top: 0, left: 0 };
        const scrollTop = container?.scrollTop || 0;
        const scrollLeft = container?.scrollLeft || 0;
        
        setSelectedText(text);
        setSelectionPosition({
          top: mouseY - containerRect.top + scrollTop + 8,
          left: mouseX - containerRect.left + scrollLeft,
        });
        setShowTranslatePopup(true);
      } else {
        setShowTranslatePopup(false);
        setSelectedText('');
      }
    } else {
      setShowTranslatePopup(false);
      setSelectedText('');
    }
  }, []);

  const currentTranslationKey = selectionPosition?.translationKey;
  const translationState = currentTranslationKey 
    ? translation.getTranslationState(currentTranslationKey)
    : { status: 'idle', text: '', error: '' };

  const handleTranslate = useCallback(() => {
    if (selectedText) {
      const key = `pdf_selection_${Date.now()}`;
      translation.translate(key, selectedText);
      setSelectionPosition(prev => prev ? { ...prev, translationKey: key } : null);
      trackPDFSelectionTranslate(selectedText, isFullscreen);
    }
  }, [selectedText, translation, isFullscreen]);

  const handleCloseTranslatePopup = useCallback(() => {
    setShowTranslatePopup(false);
    setSelectedText('');
    setSelectionPosition(null);
  }, []);

  // 普通模式的文本选择事件
  useEffect(() => {
    const handleMouseUp = (e) => {
      if (e.target.closest('.pdf-translate-popup')) return;
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      setTimeout(() => {
        if (!isFullscreen) handleTextSelection(contentRef, mouseX, mouseY);
      }, 10);
    };

    const handleMouseDown = (e) => {
      if (e.target.closest('.pdf-translate-popup')) return;
      if (translationState.status !== 'translating') setShowTranslatePopup(false);
    };

    const container = contentRef.current;
    if (container && !isFullscreen) {
      container.addEventListener('mouseup', handleMouseUp);
      container.addEventListener('mousedown', handleMouseDown);
    }

    return () => {
      if (container) {
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('mousedown', handleMouseDown);
      }
    };
  }, [isFullscreen, handleTextSelection, translationState.status]);

  return (
    <div className="pdf-viewer">
      <PDFToolbar
        paperTitle={paperTitle}
        numPages={numPages}
        scale={scale}
        pdfBlob={pdfBlob}
        pdfUrl={pdfUrl}
        sciHubUrl={sciHubUrl}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onDownload={handleDownload}
        onOpenFullscreen={handleOpenFullscreen}
      />

      {showTranslateTip && numPages && (
        <PDFTranslateTip onClose={handleCloseTip} />
      )}

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
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="fallback-link">
                在新窗口打开PDF
              </a>
            )}
            {sciHubUrl && (
              <a href={sciHubUrl} target="_blank" rel="noreferrer" className="fallback-link scihub-link">
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
                <input type="checkbox" checked={autoOpenOnError} onChange={toggleAutoOpen} />
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
            {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
              .map(pageNumber => {
                const shouldRender = pagesToRender.includes(pageNumber);
                if (!shouldRender) {
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

        {showTranslatePopup && selectionPosition && !isFullscreen && (
          <PDFTranslatePopup
            selectionPosition={selectionPosition}
            translationState={translationState}
            selectedText={selectedText}
            onTranslate={handleTranslate}
            onClose={handleCloseTranslatePopup}
          />
        )}
      </div>

      {isFullscreen && numPages && (
        <PDFFullscreenModal
          numPages={numPages}
          fileConfig={fileConfig}
          documentOptions={documentOptions}
          enableTextLayer={enableTextLayer}
          paperTitle={paperTitle}
          fullscreenScale={fullscreenScale}
          showTranslateTip={showTranslateTip}
          showTranslatePopup={showTranslatePopup}
          selectionPosition={selectionPosition}
          translationState={translationState}
          selectedText={selectedText}
          onZoomIn={handleFullscreenZoomIn}
          onZoomOut={handleFullscreenZoomOut}
          onResetZoom={handleFullscreenResetZoom}
          onDownload={handleDownload}
          onClose={handleCloseFullscreen}
          onCloseTip={handleCloseTip}
          onTranslate={handleTranslate}
          onCloseTranslatePopup={handleCloseTranslatePopup}
          onTextSelection={handleTextSelection}
          onCurrentVisiblePageChange={setCurrentVisiblePage}
          translationStatus={translationState.status}
        />
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.pdfUrl === nextProps.pdfUrl &&
         prevProps.paperTitle === nextProps.paperTitle &&
         prevProps.doi === nextProps.doi &&
         prevProps.isCheckedPdf === nextProps.isCheckedPdf;
});

export default PDFViewer;

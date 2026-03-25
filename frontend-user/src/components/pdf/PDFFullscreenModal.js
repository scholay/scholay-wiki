import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page } from 'react-pdf';
import PDFTranslateTip from './PDFTranslateTip';
import PDFTranslatePopup from './PDFTranslatePopup';

const PDFFullscreenModal = ({
  numPages,
  fileConfig,
  documentOptions,
  enableTextLayer,
  paperTitle,
  fullscreenScale,
  showTranslateTip,
  showTranslatePopup,
  selectionPosition,
  translationState,
  selectedText,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onDownload,
  onClose,
  onCloseTip,
  onTranslate,
  onCloseTranslatePopup,
  onTextSelection,
  onCurrentVisiblePageChange,
  translationStatus,
}) => {
  const contentRef = useRef(null);

  // 监听滚动以更新当前可见页面
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !numPages) return;

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
        onCurrentVisiblePageChange?.(closestPage);
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [numPages, onCurrentVisiblePageChange]);

  // 文本选择事件
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleMouseUp = (e) => {
      if (e.target.closest('.pdf-translate-popup')) return;
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      setTimeout(() => onTextSelection(contentRef, mouseX, mouseY), 10);
    };

    const handleMouseDown = (e) => {
      if (e.target.closest('.pdf-translate-popup')) return;
      if (translationStatus !== 'translating') {
        onCloseTranslatePopup();
      }
    };

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mousedown', handleMouseDown);
    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onTextSelection, onCloseTranslatePopup, translationStatus]);

  return createPortal(
    <div className="pdf-fullscreen-overlay" onClick={onClose}>
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
            <button className="fullscreen-control-btn" onClick={onZoomOut} disabled={fullscreenScale <= 0.5} title="缩小">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <span className="fullscreen-zoom-level">{Math.round(fullscreenScale * 100)}%</span>
            <button className="fullscreen-control-btn" onClick={onZoomIn} disabled={fullscreenScale >= 5.0} title="放大">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <button className="fullscreen-control-btn" onClick={onResetZoom} title="重置缩放">
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

            <button className="fullscreen-control-btn" onClick={onDownload} title="下载 PDF">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>

            <button className="fullscreen-control-btn fullscreen-close-btn" onClick={onClose} title="关闭 (ESC)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {showTranslateTip && (
          <PDFTranslateTip onClose={onCloseTip} isFullscreen />
        )}

        {/* 全屏 PDF 内容 */}
        <div ref={contentRef} className="pdf-fullscreen-content">
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

          {showTranslatePopup && selectionPosition && (
            <PDFTranslatePopup
              selectionPosition={selectionPosition}
              translationState={translationState}
              selectedText={selectedText}
              onTranslate={onTranslate}
              onClose={onCloseTranslatePopup}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PDFFullscreenModal;

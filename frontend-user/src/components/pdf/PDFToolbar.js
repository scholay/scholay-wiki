/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';

/**
 * PDF 工具栏组件
 * 包含缩放控制、页数信息、全屏按钮、下载按钮、外部打开链接
 */
const PDFToolbar = React.memo(({
  paperTitle,
  scale,
  numPages,
  pdfBlob,
  pdfUrl,
  sciHubUrl,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  onDownload,
}) => {
  return (
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
            onClick={onZoomOut}
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
            onClick={onZoomIn}
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
            onClick={onResetZoom}
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

        {/* 放大查看按钮 - PDF 加载成功后显示 */}
        {pdfBlob && numPages && (
          <button
            className="control-btn fullscreen-btn"
            onClick={onOpenFullscreen}
            title="放大查看"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        )}

        {/* 下载按钮 - PDF 数据存在时显示 */}
        {pdfBlob && (
          <button
            className="control-btn download-btn"
            onClick={onDownload}
            title="下载 PDF"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        )}

        {/* 外部打开 */}
        {(pdfUrl || sciHubUrl) && (
          <a
            href={pdfUrl || sciHubUrl}
            target="_blank"
            rel="noopener"
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
  );
});

PDFToolbar.displayName = 'PDFToolbar';

export default PDFToolbar;

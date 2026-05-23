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
 * 翻译提示条组件
 */
const TranslateTip = React.memo(({ onClose, isFullscreen }) => {
  return (
    <div className={`pdf-translate-tip${isFullscreen ? ' pdf-translate-tip-fullscreen' : ''}`}>
      <div className="pdf-translate-tip-content">
        <span className="pdf-translate-tip-new">NEW</span>
        <svg className="pdf-translate-tip-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
          <path d="M21.5 12.5L18 22l-1.5-4L12.5 16l9-3.5z"/>
        </svg>
        <span>划选英文内容可快速翻译</span>
      </div>
      <button className="pdf-translate-tip-close" onClick={onClose} title="不再提示">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
});

TranslateTip.displayName = 'TranslateTip';

/**
 * 翻译弹窗组件（显示翻译按钮和翻译结果）
 */
const TranslatePopup = React.memo(({
  selectionPosition,
  translationState,
  selectedText,
  onTranslate,
  onClose,
}) => {
  if (!selectionPosition) return null;

  return (
    <div
      className="pdf-translate-popup"
      style={{
        top: selectionPosition.top,
        left: selectionPosition.left,
      }}
    >
      {translationState.status === 'idle' ? (
        <button className="pdf-translate-btn" onClick={onTranslate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 8l6 6"/>
            <path d="M4 14l6-6 2-3"/>
            <path d="M2 5h12"/>
            <path d="M7 2v3"/>
            <path d="M22 22l-5-10-5 10"/>
            <path d="M14 18h6"/>
          </svg>
          翻译
        </button>
      ) : (
        <div className="pdf-translate-result">
          <div className="pdf-translate-result-header">
            <span className="pdf-translate-result-title">
              {translationState.status === 'translating' ? '翻译中...' : '翻译结果'}
            </span>
            <button className="pdf-translate-result-close" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="pdf-translate-result-content">
            {translationState.status === 'error' ? (
              <span className="pdf-translate-error">{translationState.error || '翻译失败'}</span>
            ) : (
              <span>{translationState.text || '...'}</span>
            )}
          </div>
          {selectedText && (
            <div className="pdf-translate-original">
              <span className="pdf-translate-original-label">原文：</span>
              <span className="pdf-translate-original-text">{selectedText.length > 100 ? selectedText.slice(0, 100) + '...' : selectedText}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TranslatePopup.displayName = 'TranslatePopup';

export { TranslateTip, TranslatePopup };

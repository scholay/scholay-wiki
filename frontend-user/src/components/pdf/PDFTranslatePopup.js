import React from 'react';

const PDFTranslatePopup = ({
  selectionPosition,
  translationState,
  selectedText,
  onTranslate,
  onClose,
}) => (
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
            <span className="pdf-translate-original-text">
              {selectedText.length > 100 ? selectedText.slice(0, 100) + '...' : selectedText}
            </span>
          </div>
        )}
      </div>
    )}
  </div>
);

export default PDFTranslatePopup;

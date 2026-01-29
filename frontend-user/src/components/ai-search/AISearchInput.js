/**
 * AI搜索输入框组件
 * 底部的搜索输入区域
 */
import React, { memo, forwardRef } from 'react';

/**
 * AI搜索输入组件
 */
const AISearchInput = forwardRef(({
  searchQuery,
  loading,
  isComposing,
  onSearchChange,
  onCompositionStart,
  onCompositionEnd,
  onSubmit,
}, ref) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      if (!loading && searchQuery.trim()) {
        onSubmit(e);
      }
    }
  };

  const handleChange = (e) => {
    onSearchChange(e.target.value);
    // 自动调整高度，保持最小高度为48px
    e.target.style.height = 'auto';
    const minHeight = 48;
    const newHeight = Math.max(minHeight, Math.min(e.target.scrollHeight, 200));
    e.target.style.height = newHeight + 'px';
  };

  return (
    <div className="as-bottom-input-container">
      <form onSubmit={onSubmit} className="advanced-bottom-composer-wrapper">
        {/* 输入区域 */}
        <div className="advanced-bottom-composer-input-area">
          <textarea
            ref={ref}
            className="advanced-bottom-chat-input"
            placeholder="继续追问或输入新的搜索需求..."
            value={searchQuery}
            maxLength={1000}
            onChange={handleChange}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={2}
          />
          <button type="submit" className="btn-send" disabled={loading || !searchQuery.trim()}>
            {loading ? (
              <div className="spinner-small"></div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
});

AISearchInput.displayName = 'AISearchInput';

export default memo(AISearchInput);

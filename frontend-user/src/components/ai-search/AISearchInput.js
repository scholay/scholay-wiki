/**
 * AI搜索输入框组件
 * 底部的搜索输入区域
 * 
 * 交互设计（VSCode 风格）：
 * - Enter: 发送消息
 * - Shift+Enter: 换行
 * - 默认 2 行高度，最多 3 行可见，超出后滚动
 * - 推荐问题以芯片形式显示在输入框上方
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
  suggestedQuestions = [],
  onSuggestionClick,
  isStreaming = false,
}, ref) => {
  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      if (!loading && searchQuery.trim()) {
        onSubmit(e);
      }
    }
    // Shift+Enter 自然换行，无需额外处理
  };

  const handleChange = (e) => {
    onSearchChange(e.target.value);
  };

  // 阻止表单默认提交行为
  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!loading && searchQuery.trim()) {
      onSubmit(e);
    }
  };

  // 点击推荐问题
  const handleSuggestionClick = (question) => {
    if (onSuggestionClick && !loading) {
      onSuggestionClick(question);
    }
  };

  // 是否显示推荐问题
  const showSuggestions = !isStreaming && !loading && suggestedQuestions && suggestedQuestions.length > 0;

  return (
    <div className="as-bottom-input-container">
      {/* 推荐问题芯片 */}
      {showSuggestions && (
        <div className="ai-suggestion-chips">
          {suggestedQuestions.slice(0, 3).map((question, index) => (
            <button
              key={index}
              className="ai-suggestion-chip"
              onClick={() => handleSuggestionClick(question)}
              disabled={loading}
              title={question}
            >
              <span className="chip-text">{question}</span>
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <form onSubmit={handleFormSubmit} className="ai-chat-input-wrapper">
        <textarea
          ref={ref}
          className="ai-chat-textarea"
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          value={searchQuery}
          maxLength={1000}
          onChange={handleChange}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        {/* 加载状态指示器 - 边框发光效果 */}
        {loading && <div className="ai-chat-loading-indicator" />}
      </form>
    </div>
  );
});

AISearchInput.displayName = 'AISearchInput';

export default memo(AISearchInput);

import React from 'react';

const ChatInput = ({
  inputRef,
  inputValue,
  setInputValue,
  isLoading,
  selectedText,
  onSend,
  onCancel,
  onKeyDown,
}) => (
  <div className="ai-chat-input-area">
    {isLoading && (
      <button className="ai-chat-cancel-btn" onClick={onCancel}>
        取消
      </button>
    )}
    <textarea
      ref={inputRef}
      className="ai-chat-input"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={selectedText ? '基于选中内容提问...' : '输入问题或指令...'}
      disabled={isLoading}
      rows={1}
    />
    <button
      className="ai-chat-send-btn"
      onClick={onSend}
      disabled={!inputValue.trim() || isLoading}
    >
      {isLoading ? (
        <span className="ai-chat-send-spinner" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      )}
    </button>
  </div>
);

export default ChatInput;

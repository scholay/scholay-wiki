/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ChatInputArea - 聊天输入区域组件
 * 从 AISearchView 中提取，用于处理用户输入
 */

import React, { memo, useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * ChatInputArea 组件 - 渲染聊天输入区域
 */
const ChatInputArea = memo(({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  maxLength,
}) => {
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef(null);

  // 自动调整高度
  const adjustHeight = (target) => {
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
  };

  // 重置高度当值变化时
  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight(textareaRef.current);
    }
  }, [value]);

  const handleChange = (e) => {
    onChange(e.target.value);
    adjustHeight(e.target);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      if (!loading && value.trim()) {
        onSubmit(e);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loading && value.trim()) {
      onSubmit(e);
    }
  };

  return (
    <div className="as-bottom-input-container">
      <form onSubmit={handleSubmit} className="advanced-bottom-composer-wrapper">
        {/* 输入区域 */}
        <div className="advanced-bottom-composer-input-area">
          <textarea
            ref={textareaRef}
            className="advanced-bottom-chat-input"
            placeholder={placeholder}
            value={value}
            maxLength={maxLength}
            onChange={handleChange}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
          />
          <button 
            type="submit" 
            className="btn-send" 
            disabled={loading || !value.trim()}
          >
            {loading ? (
              <div className="spinner-small"></div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
          </button>
        </div>

        {/* 底部操作栏 - 可扩展 */}
      </form>
    </div>
  );
});

ChatInputArea.displayName = 'ChatInputArea';

ChatInputArea.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  placeholder: PropTypes.string,
  maxLength: PropTypes.number,
};

ChatInputArea.defaultProps = {
  loading: false,
  placeholder: '输入你的问题...',
  maxLength: 1000,
};

export default ChatInputArea;


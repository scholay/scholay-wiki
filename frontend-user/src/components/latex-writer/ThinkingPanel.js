/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ThinkingPanel 组件
 * 展示 AI 思考过程的折叠面板，类似 Cursor 的 "Exploring" 风格
 * 
 * 功能：
 * 1. 可展开/收起的折叠面板
 * 2. 显示思考时间（如 "Thought for 19 seconds..."）
 * 3. 内容区域自动滚动到底部
 * 4. 流式输出时持续追加并自动滚动
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import './ThinkingPanel.css';

/**
 * ThinkingPanel 组件
 * @param {Object} props
 * @param {string} props.content - 思考内容
 * @param {boolean} props.isStreaming - 是否正在流式输出
 * @param {number} props.duration - 思考持续时间（秒），0 表示仍在进行
 * @param {boolean} props.defaultOpen - 默认是否展开
 */
function ThinkingPanel({ 
  content, 
  isStreaming = false, 
  duration = 0,
  defaultOpen = true 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const contentRef = useRef(null);
  const prevContentLengthRef = useRef(0);
  const startTimeRef = useRef(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, []);

  // 内容变化时自动滚动
  useEffect(() => {
    if (isOpen && content && content.length > prevContentLengthRef.current) {
      scrollToBottom();
    }
    prevContentLengthRef.current = content?.length || 0;
  }, [content, isOpen, scrollToBottom]);

  // 流式输出时，定时滚动以保持平滑
  useEffect(() => {
    if (isStreaming && isOpen) {
      const intervalId = setInterval(scrollToBottom, 100);
      return () => clearInterval(intervalId);
    }
  }, [isStreaming, isOpen, scrollToBottom]);

  // 流式输出时，实时更新秒数
  useEffect(() => {
    if (isStreaming) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      const intervalId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setLiveSeconds(elapsed);
      }, 1000);
      return () => clearInterval(intervalId);
    } else {
      // 停止流式时，重置开始时间
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  // 格式化持续时间显示
  const formatDuration = () => {
    if (isStreaming) {
      if (liveSeconds === 0) {
        return 'Thinking...';
      }
      return `Thinking for ${liveSeconds}s...`;
    }
    if (duration === 0) {
      return 'Thought';
    }
    if (duration === 1) {
      return 'Thought for 1 second';
    }
    return `Thought for ${duration} seconds`;
  };

  // 切换展开/收起
  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  if (!content) {
    return null;
  }

  return (
    <div className={`thinking-panel ${isOpen ? 'thinking-panel-open' : ''}`}>
      <div className="thinking-panel-header" onClick={toggleOpen}>
        <div className="thinking-panel-header-left">
          <span className={`thinking-panel-arrow ${isOpen ? 'thinking-panel-arrow-open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
          <span className="thinking-panel-title">
            {formatDuration()}
          </span>
          {isStreaming && (
            <span className="thinking-panel-streaming-indicator">
              <span className="thinking-panel-dot"></span>
              <span className="thinking-panel-dot"></span>
              <span className="thinking-panel-dot"></span>
            </span>
          )}
        </div>
      </div>
      
      {isOpen && (
        <div className="thinking-panel-content" ref={contentRef}>
          <pre className="thinking-panel-text">{content}</pre>
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;

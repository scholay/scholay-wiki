/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * CodePreview 组件
 * 展示 AI 生成的代码，显示 diff 统计，支持流式输出自动滚动
 * 
 * 功能：
 * 1. 代码头部显示文件类型和 diff 统计（如 LaTeX +57 -9）
 * 2. 流式输出时代码区域自动滚动到底部
 * 3. 应用到编辑器按钮
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { calculateCodeDiff } from './ai/MessageParser';
import './CodePreview.css';

/**
 * CodePreview 组件
 * @param {Object} props
 * @param {string} props.code - 新代码
 * @param {string} props.originalCode - 原始代码（用于计算 diff）
 * @param {boolean} props.isStreaming - 是否正在流式输出
 * @param {function} props.onApply - 应用代码的回调
 * @param {string} props.language - 代码语言（默认 LaTeX）
 * @param {Object} props.preCalculatedStats - 预计算的统计数据（用于历史消息）
 */
function CodePreview({ 
  code, 
  originalCode = '',
  isStreaming = false, 
  onApply,
  language = 'LaTeX',
  preCalculatedStats = null,
}) {
  const codeRef = useRef(null);
  const prevCodeLengthRef = useRef(0);

  // 计算 diff 统计
  const diffStats = useMemo(() => {
    // 如果有预计算的统计数据（来自历史消息），直接使用
    if (preCalculatedStats) {
      return preCalculatedStats;
    }
    // 否则动态计算
    if (!code) {
      return { added: 0, removed: 0, total: 0 };
    }
    return calculateCodeDiff(originalCode, code);
  }, [code, originalCode, preCalculatedStats]);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, []);

  // 代码变化时自动滚动（仅在流式输出时）
  useEffect(() => {
    if (isStreaming && code && code.length > prevCodeLengthRef.current) {
      scrollToBottom();
    }
    prevCodeLengthRef.current = code?.length || 0;
  }, [code, isStreaming, scrollToBottom]);

  // 流式输出时，定时滚动以保持平滑
  useEffect(() => {
    if (isStreaming) {
      const intervalId = setInterval(scrollToBottom, 100);
      return () => clearInterval(intervalId);
    }
  }, [isStreaming, scrollToBottom]);

  // 处理应用代码
  const handleApply = useCallback(() => {
    if (onApply && code) {
      onApply(code);
    }
  }, [onApply, code]);

  // 复制代码
  const handleCopy = useCallback(async () => {
    if (code) {
      try {
        await navigator.clipboard.writeText(code);
      } catch (err) {
        console.error('Failed to copy code:', err);
      }
    }
  }, [code]);

  if (!code) {
    return null;
  }

  const hasChanges = diffStats.added > 0 || diffStats.removed > 0;

  return (
    <div className="code-preview">
      <div className="code-preview-header">
        <div className="code-preview-info">
          <span className="code-preview-language">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {language}
          </span>
          {hasChanges && !isStreaming && (
            <span className="code-preview-stats">
              {diffStats.added > 0 && (
                <span className="code-preview-added">+{diffStats.added}</span>
              )}
              {diffStats.removed > 0 && (
                <span className="code-preview-removed">-{diffStats.removed}</span>
              )}
            </span>
          )}
          {isStreaming && (
            <span className="code-preview-streaming">
              <span className="code-preview-streaming-dot"></span>
              输出中...
            </span>
          )}
        </div>
        <div className="code-preview-actions">
          <button 
            className="code-preview-btn code-preview-btn-copy"
            onClick={handleCopy}
            title="复制代码"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          {onApply && (
            <button 
              className="code-preview-btn code-preview-btn-apply"
              onClick={handleApply}
              disabled={isStreaming}
              title="应用到编辑器"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              应用
            </button>
          )}
        </div>
      </div>
      <div className="code-preview-content" ref={codeRef}>
        <pre className="code-preview-code">{code}</pre>
        {isStreaming && <span className="code-preview-cursor">▋</span>}
      </div>
    </div>
  );
}

export default CodePreview;

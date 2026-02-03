/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX AI 对话组件
 * 
 * 功能：
 * 1. 与 AI 进行对话
 * 2. 显示对话历史
 * 3. 支持快捷操作
 * 4. 显示 diff 预览
 * 5. 应用或拒绝 AI 建议
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { latexAiAgent, LATEX_PROMPTS } from './LatexAiAgent';
import DiffViewer from './DiffViewer';
import './LatexAiChat.css';

/**
 * 消息气泡组件
 */
const MessageBubble = ({ message, onApplyChange, onRejectChange, currentContent }) => {
  const { role, content, type, originalContent, modifiedContent } = message;

  // 如果是 diff 类型消息
  if (type === 'diff' && originalContent && modifiedContent) {
    return (
      <div className="chat-message chat-message-diff">
        <DiffViewer
          originalContent={originalContent}
          modifiedContent={modifiedContent}
          onAccept={() => onApplyChange?.(modifiedContent)}
          onReject={onRejectChange}
          title="AI 建议的修改"
        />
      </div>
    );
  }

  return (
    <div className={`chat-message chat-message-${role}`}>
      <div className="chat-message-avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="chat-message-content">
        <div className="chat-message-text">{content}</div>
        {role === 'assistant' && content && (
          <div className="chat-message-actions">
            <button
              className="chat-action-btn"
              onClick={() => onApplyChange?.(latexAiAgent.extractLatexCode(content))}
              title="应用到编辑器"
            >
              应用修改
            </button>
            <button
              className="chat-action-btn secondary"
              onClick={() => navigator.clipboard.writeText(content)}
              title="复制内容"
            >
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 快捷操作按钮
 */
const QuickActions = ({ onAction, disabled }) => {
  const actions = Object.values(LATEX_PROMPTS).slice(0, 6); // 显示前6个

  return (
    <div className="quick-actions">
      <div className="quick-actions-title">快捷操作</div>
      <div className="quick-actions-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            className="quick-action-btn"
            onClick={() => onAction(action.id)}
            disabled={disabled}
            title={action.title}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <span className="quick-action-text">{action.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * LaTeX AI 对话组件
 */
function LatexAiChat({
  currentContent,
  selectedText,
  onApplyChange,
  onClose,
  className = '',
}) {
  // 状态
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(true);

  // 引用
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setShowQuickActions(false);
    setIsLoading(true);
    setStreamingContent('');

    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // 构建完整的提示词
    let fullPrompt = userMessage;
    if (selectedText) {
      fullPrompt = `当前选中的内容：\n\`\`\`latex\n${selectedText}\n\`\`\`\n\n用户请求：${userMessage}\n\n请根据用户请求修改选中的内容，并返回修改后的完整 LaTeX 代码。`;
    }

    try {
      let response = '';

      await latexAiAgent.chat(fullPrompt, {
        onStart: () => {
          setStreamingContent('');
        },
        onMessage: (msg) => {
          response += msg.content;
          setStreamingContent(response);
        },
        onStop: () => {
          setIsLoading(false);
          setStreamingContent('');

          // 判断是否应该显示 diff
          const extractedCode = latexAiAgent.extractLatexCode(response);
          const originalForDiff = selectedText || currentContent;

          // 如果提取出了 LaTeX 代码且与原内容不同
          if (extractedCode && extractedCode !== originalForDiff && originalForDiff) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: response,
              type: 'diff',
              originalContent: originalForDiff,
              modifiedContent: extractedCode,
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: response,
            }]);
          }
        },
        onError: (error) => {
          setIsLoading(false);
          setStreamingContent('');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `抱歉，发生错误：${error.message}`,
          }]);
        },
      }, true, currentContent);
    } catch (error) {
      setIsLoading(false);
      setStreamingContent('');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `抱歉，发生错误：${error.message}`,
      }]);
    }
  }, [inputValue, isLoading, selectedText, currentContent]);

  // 快捷操作
  const handleQuickAction = useCallback(async (actionId) => {
    const contentToProcess = selectedText || currentContent;
    if (!contentToProcess) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先选择要处理的内容，或在编辑器中输入内容。',
      }]);
      return;
    }

    const action = Object.values(LATEX_PROMPTS).find(a => a.id === actionId);
    if (!action) return;

    setShowQuickActions(false);
    setIsLoading(true);
    setStreamingContent('');

    // 添加用户操作消息
    setMessages(prev => [...prev, {
      role: 'user',
      content: `${action.icon} ${action.title}`,
    }]);

    try {
      let response = '';

      await latexAiAgent.chatWithPrompt(actionId, contentToProcess, {
        onStart: () => {
          setStreamingContent('');
        },
        onMessage: (msg) => {
          response += msg.content;
          setStreamingContent(response);
        },
        onStop: () => {
          setIsLoading(false);
          setStreamingContent('');

          const extractedCode = latexAiAgent.extractLatexCode(response);

          // 显示 diff
          if (extractedCode && extractedCode !== contentToProcess) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: response,
              type: 'diff',
              originalContent: contentToProcess,
              modifiedContent: extractedCode,
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: response,
            }]);
          }
        },
        onError: (error) => {
          setIsLoading(false);
          setStreamingContent('');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `抱歉，发生错误：${error.message}`,
          }]);
        },
      });
    } catch (error) {
      setIsLoading(false);
      setStreamingContent('');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `抱歉，发生错误：${error.message}`,
      }]);
    }
  }, [selectedText, currentContent]);

  // 应用修改
  const handleApplyChange = useCallback((newContent) => {
    onApplyChange?.(newContent);
    setMessages(prev => [...prev, {
      role: 'system',
      content: '✅ 修改已应用到编辑器',
    }]);
  }, [onApplyChange]);

  // 拒绝修改
  const handleRejectChange = useCallback(() => {
    setMessages(prev => [...prev, {
      role: 'system',
      content: '❌ 已放弃修改',
    }]);
  }, []);

  // 清空对话
  const handleClear = useCallback(() => {
    setMessages([]);
    latexAiAgent.resetConversation();
    setShowQuickActions(true);
  }, []);

  // 停止生成
  const handleStop = useCallback(() => {
    latexAiAgent.stop();
    setIsLoading(false);
    if (streamingContent) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: streamingContent + '\n\n(已停止生成)',
      }]);
      setStreamingContent('');
    }
  }, [streamingContent]);

  // 键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className={`latex-ai-chat ${className}`}>
      {/* 头部 */}
      <div className="chat-header">
        <div className="chat-header-title">
          <span className="chat-header-icon">🤖</span>
          <span>AI 写作助手</span>
        </div>
        <div className="chat-header-actions">
          <button
            className="chat-header-btn"
            onClick={handleClear}
            title="清空对话"
          >
            🗑️
          </button>
          {onClose && (
            <button
              className="chat-header-btn"
              onClick={onClose}
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {/* 选中内容提示 */}
        {selectedText && messages.length === 0 && (
          <div className="chat-selected-hint">
            <div className="chat-selected-label">已选中内容：</div>
            <pre className="chat-selected-content">{selectedText.slice(0, 200)}{selectedText.length > 200 ? '...' : ''}</pre>
          </div>
        )}

        {/* 快捷操作 */}
        {showQuickActions && messages.length === 0 && (
          <QuickActions onAction={handleQuickAction} disabled={isLoading} />
        )}

        {/* 消息列表 */}
        {messages.map((msg, index) => (
          <MessageBubble
            key={index}
            message={msg}
            currentContent={currentContent}
            onApplyChange={handleApplyChange}
            onRejectChange={handleRejectChange}
          />
        ))}

        {/* 流式输出 */}
        {streamingContent && (
          <div className="chat-message chat-message-assistant streaming">
            <div className="chat-message-avatar">🤖</div>
            <div className="chat-message-content">
              <div className="chat-message-text">{streamingContent}</div>
              <div className="streaming-indicator">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedText ? "描述你想对选中内容做的修改..." : "输入你的问题或要求..."}
          disabled={isLoading}
          rows={1}
        />
        <div className="chat-input-actions">
          {isLoading ? (
            <button
              className="chat-send-btn stop"
              onClick={handleStop}
              title="停止生成"
            >
              ⏹️
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              title="发送 (Enter)"
            >
              ➤
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LatexAiChat;

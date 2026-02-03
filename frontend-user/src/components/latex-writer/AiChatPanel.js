/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AI 对话面板组件
 * 使用 LaTeX AI Agent 系统
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../../utils/AuthContext';
import { LatexAiAgent, LatexCommands } from './ai';
import './AiChatPanel.css';

// 模型级别
const MODEL_LEVELS = [
  { id: 'low', label: '快速', description: '响应快，适合简单任务' },
  { id: 'mid', label: '标准', description: '平衡速度和质量' },
  { id: 'high', label: '高级', description: '最佳质量，适合复杂任务' },
];

function AiChatPanel({ selectedText, fullContent, onApplySuggestion, cursorPosition }) {
  const { isAuthenticated } = useAuth();
  
  // 状态
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelLevel, setModelLevel] = useState('mid');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  
  // 引用
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const agentRef = useRef(null);

  // 初始化 Agent
  useEffect(() => {
    agentRef.current = new LatexAiAgent({
      defaultModelLevel: modelLevel,
    });

    const agent = agentRef.current;

    agent.on('onStart', () => {
      setIsLoading(true);
      setCurrentResponse('');
    });

    agent.on('onMessage', (text, isComplete) => {
      setCurrentResponse(text);
      if (isComplete) {
        // 更新最后一条消息
        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: text,
              isStreaming: false
            };
          }
          return updated;
        });
      }
    });

    agent.on('onComplete', (fullText) => {
      setIsLoading(false);
      setCurrentResponse('');
      // 确保最终内容正确
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: fullText,
            isStreaming: false
          };
        }
        return updated;
      });
    });

    agent.on('onError', (error) => {
      setIsLoading(false);
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            role: 'assistant',
            content: `抱歉，请求出错: ${error.message}`,
            isError: true,
            isStreaming: false
          };
        }
        return updated;
      });
    });

    return () => {
      agent.destroy();
    };
  }, []);

  // 更新模型级别
  useEffect(() => {
    if (agentRef.current) {
      agentRef.current.updateConfig({ defaultModelLevel: modelLevel });
    }
  }, [modelLevel]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse, scrollToBottom]);

  // 获取快捷命令
  const quickCommands = useMemo(() => LatexCommands.getQuickCommands(), []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    
    if (!isAuthenticated) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先登录后再使用 AI 功能。',
        isError: true
      }]);
      return;
    }

    const prompt = inputValue.trim();
    setInputValue('');

    // 添加用户消息
    const userMessage = {
      role: 'user',
      content: prompt,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    };
    setMessages(prev => [...prev, userMessage]);
    
    // 添加助手消息占位
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    // 使用 Agent 发送
    await agentRef.current.chatWithContext(selectedText, prompt, {
      fullContent,
      modelLevel,
    });
  }, [inputValue, isLoading, isAuthenticated, selectedText, fullContent, modelLevel]);

  // 执行快捷命令
  const handleQuickCommand = useCallback(async (command) => {
    if (isLoading) return;
    
    if (!isAuthenticated) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先登录后再使用 AI 功能。',
        isError: true
      }]);
      return;
    }

    if (command.requiresSelection && !selectedText) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '此操作需要先选中文本。',
        isError: true
      }]);
      return;
    }

    // 添加用户消息
    setMessages(prev => [...prev, {
      role: 'user',
      content: `执行命令: ${command.name}`,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    }]);
    
    // 添加助手消息占位
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    setShowCommandMenu(false);

    // 使用 Agent 执行命令
    await agentRef.current.executeCommand(command.id, selectedText, {
      fullContent,
      modelLevel: command.modelLevel || modelLevel,
    });
  }, [isLoading, isAuthenticated, selectedText, fullContent, modelLevel]);

  // 取消请求
  const handleCancel = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.stop();
    }
    setIsLoading(false);
  }, []);

  // 应用建议到编辑器
  const handleApply = useCallback((content) => {
    // 提取代码块中的内容
    const codeBlockMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    const suggestion = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    onApplySuggestion?.(suggestion);
  }, [onApplySuggestion]);

  // 清空对话
  const handleClear = useCallback(() => {
    if (isLoading) {
      handleCancel();
    }
    setMessages([]);
  }, [isLoading, handleCancel]);

  // 键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 渲染消息内容（处理流式更新）
  const renderMessageContent = (msg, index) => {
    const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
    const displayContent = isLastAssistant && currentResponse ? currentResponse : msg.content;
    
    return displayContent || (msg.isStreaming && <span className="ai-chat-cursor">▋</span>);
  };

  return (
    <div className="ai-chat-panel">
      {/* 头部 */}
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
            <circle cx="12" cy="12" r="6"/>
          </svg>
          LaTeX AI 助手
        </div>
        <div className="ai-chat-header-actions">
          {/* 命令菜单 */}
          <div className="ai-chat-command-select">
            <button
              className="ai-chat-command-btn"
              onClick={() => setShowCommandMenu(!showCommandMenu)}
              disabled={isLoading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
              </svg>
              命令
            </button>
            {showCommandMenu && (
              <>
                <div className="ai-chat-menu-overlay" onClick={() => setShowCommandMenu(false)} />
                <div className="ai-chat-command-menu">
                  <div className="ai-chat-menu-section">
                    <div className="ai-chat-menu-title">快捷命令</div>
                    {quickCommands.map(cmd => (
                      <button
                        key={cmd.id}
                        className="ai-chat-menu-item"
                        onClick={() => handleQuickCommand(cmd)}
                        disabled={cmd.requiresSelection && !selectedText}
                      >
                        <span className="ai-chat-menu-icon" dangerouslySetInnerHTML={{ __html: cmd.icon }} />
                        <span>{cmd.name}</span>
                        {cmd.shortcut && <span className="ai-chat-menu-shortcut">{cmd.shortcut}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="ai-chat-menu-section">
                    <div className="ai-chat-menu-title">高级命令</div>
                    {LatexCommands.getAdvancedCommands().slice(0, 4).map(cmd => (
                      <button
                        key={cmd.id}
                        className="ai-chat-menu-item"
                        onClick={() => handleQuickCommand(cmd)}
                        disabled={cmd.requiresSelection && !selectedText}
                      >
                        <span className="ai-chat-menu-icon" dangerouslySetInnerHTML={{ __html: cmd.icon }} />
                        <span>{cmd.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 模型选择 */}
          <div className="ai-chat-model-select">
            <button
              className="ai-chat-model-btn"
              onClick={() => setShowModelMenu(!showModelMenu)}
            >
              {MODEL_LEVELS.find(m => m.id === modelLevel)?.label}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showModelMenu && (
              <>
                <div className="ai-chat-menu-overlay" onClick={() => setShowModelMenu(false)} />
                <div className="ai-chat-model-menu">
                  {MODEL_LEVELS.map(level => (
                    <button
                      key={level.id}
                      className={`ai-chat-model-item ${modelLevel === level.id ? 'active' : ''}`}
                      onClick={() => { setModelLevel(level.id); setShowModelMenu(false); }}
                    >
                      <span className="ai-chat-model-label">{level.label}</span>
                      <span className="ai-chat-model-desc">{level.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* 清空按钮 */}
          <button
            className="ai-chat-clear-btn"
            onClick={handleClear}
            title="清空对话"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 选中文本提示 */}
      {selectedText && (
        <div className="ai-chat-selection-hint">
          <span>已选中 {selectedText.length} 字符</span>
          <div className="ai-chat-quick-actions">
            {quickCommands.slice(0, 4).map(cmd => (
              <button
                key={cmd.id}
                className="ai-chat-quick-btn"
                onClick={() => handleQuickCommand(cmd)}
                disabled={isLoading}
                title={cmd.name}
              >
                {cmd.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="ai-chat-messages">
        {messages.length === 0 ? (
          <div className="ai-chat-empty">
            <p>输入问题或选中 LaTeX 代码后使用快捷命令</p>
            <div className="ai-chat-tips">
              <p>💡 提示：</p>
              <ul>
                <li>选中代码后可使用快捷命令（续写、润色、翻译等）</li>
                <li>点击消息中的"应用"可将修改插入编辑器</li>
                <li>支持自定义提问，AI 会根据上下文回答</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`ai-chat-message ${msg.role} ${msg.isError ? 'error' : ''} ${msg.isStreaming ? 'streaming' : ''}`}
            >
              {msg.context && (
                <div className="ai-chat-message-context">
                  <span className="ai-chat-context-label">选中内容:</span>
                  <pre>{msg.context.substring(0, 200)}{msg.context.length > 200 ? '...' : ''}</pre>
                </div>
              )}
              <div className="ai-chat-message-content">
                {renderMessageContent(msg, index)}
              </div>
              {msg.role === 'assistant' && !msg.isStreaming && !msg.isError && msg.content && (
                <div className="ai-chat-message-actions">
                  <button
                    className="ai-chat-action-btn"
                    onClick={() => handleApply(msg.content)}
                    title="应用到编辑器"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    应用
                  </button>
                  <button
                    className="ai-chat-action-btn"
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    title="复制"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    复制
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="ai-chat-input-area">
        {isLoading && (
          <button className="ai-chat-cancel-btn" onClick={handleCancel}>
            取消
          </button>
        )}
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedText ? '基于选中内容提问...' : '输入问题或指令...'}
          disabled={isLoading}
          rows={1}
        />
        <button
          className="ai-chat-send-btn"
          onClick={handleSend}
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
    </div>
  );
}

export default AiChatPanel;

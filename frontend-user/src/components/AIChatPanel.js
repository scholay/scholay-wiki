/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AIChatPanel - AI对话面板组件
 * 用于智能分析页面右侧的对话区域
 */

import React, { useRef, useEffect } from 'react';
import PaperCitationMarkdown from './PaperCitationMarkdown';
import './AIChatPanel.css';

/**
 * AIChatPanel 组件
 * @param {Object} props
 * @param {Array} props.messages - 消息列表
 * @param {string} props.streamingContent - 流式内容
 * @param {boolean} props.isStreaming - 是否正在流式传输
 * @param {boolean} props.showAIThinking - 是否显示AI思考动画
 * @param {boolean} props.isLoadingSuggestedQuestions - 是否正在加载推荐问题
 * @param {Function} props.onFollowUpQuestionClick - 点击延伸问题的回调
 * @param {Function} props.onCitationHover - 引文hover回调
 * @param {Function} props.onCitationLeave - 引文离开回调
 * @param {Function} props.onCitationClick - 引文点击回调
 * @param {string} props.searchQuery - 搜索输入内容
 * @param {Function} props.setSearchQuery - 设置搜索输入内容
 * @param {Function} props.onSearch - 搜索回调
 * @param {boolean} props.loading - 是否正在加载
 * @param {boolean} props.autoScroll - 是否自动滚动
 * @param {Function} props.setAutoScroll - 设置自动滚动
 */
const AIChatPanel = ({
  messages = [],
  streamingContent = '',
  isStreaming = false,
  showAIThinking = false,
  isLoadingSuggestedQuestions = false,
  onFollowUpQuestionClick,
  onCitationHover,
  onCitationLeave,
  onCitationClick,
  searchQuery = '',
  setSearchQuery,
  onSearch,
  loading = false
}) => {
  const chatMessagesRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [isComposing, setIsComposing] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const lastScrollTime = useRef(Date.now());

  // 滚动到底部
  const scrollToBottom = () => {
    if (!autoScroll) return;
    const container = chatMessagesRef.current;
    if (container) {
      lastScrollTime.current = Date.now();
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // 处理滚动事件
  const handleScroll = () => {
    if (!chatMessagesRef.current) return;
    const now = Date.now();
    if (now - lastScrollTime.current < 200) return;

    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (atBottom) {
      setAutoScroll(true);
    } else if (isStreaming) {
      setAutoScroll(false);
    }
  };

  // 自动滚动
  useEffect(() => {
    if (autoScroll && (isStreaming || messages.length > 0)) {
      scrollToBottom();
    }
  }, [messages, streamingContent, isStreaming, autoScroll]);

  // 监听滚动
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isStreaming]);

  // 处理搜索提交
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || loading) return;
    onSearch && onSearch(searchQuery);
  };

  return (
    <div className="ai-chat-panel">
      {/* 消息列表 */}
      <div className="ai-chat-messages" ref={chatMessagesRef}>
        {messages.map((message, msgIndex) => (
          <div 
            key={message.id || msgIndex} 
            className={`ai-chat-message ai-chat-message-${message.role}`}
            id={`chat-message-${msgIndex}`}
          >
            <div className="ai-chat-message-avatar">
              {message.role === 'user' ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              )}
            </div>
            <div className="ai-chat-message-content">
              {message.role === 'user' ? (
                <div className="ai-chat-message-text">{message.content}</div>
              ) : (
                <>
                  <div className="ai-chat-message-markdown">
                    <PaperCitationMarkdown
                      content={message.content}
                      onCitationHover={(paperIndex) => onCitationHover && onCitationHover(paperIndex, message.id)}
                      onCitationLeave={onCitationLeave}
                      onCitationClick={onCitationClick}
                    />
                  </div>
                  {/* 延伸问题 - 只在最后一条消息显示 */}
                  {msgIndex === messages.length - 1 && 
                   message.role === 'assistant' && 
                   'suggestedQuestions' in message && (
                    <div className="ai-chat-suggested-questions">
                      <div className="ai-chat-suggested-header">
                        <span>你可以继续提问</span>
                      </div>
                      <div className="ai-chat-suggested-list">
                        {(isLoadingSuggestedQuestions || !message.suggestedQuestions || message.suggestedQuestions.length === 0) ? (
                          <>
                            <div className="ai-chat-suggested-btn skeleton-loading"><span></span></div>
                            <div className="ai-chat-suggested-btn skeleton-loading"><span></span></div>
                            <div className="ai-chat-suggested-btn skeleton-loading"><span></span></div>
                          </>
                        ) : (
                          message.suggestedQuestions.map((question, index) => (
                            <button
                              key={index}
                              className="ai-chat-suggested-btn"
                              onClick={() => onFollowUpQuestionClick && onFollowUpQuestionClick(question)}
                              disabled={loading}
                            >
                              <span>{question}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {/* AI思考动画 */}
        {showAIThinking && (
          <div className="ai-chat-message ai-chat-message-assistant ai-thinking-skeleton">
            <div className="ai-chat-message-content">
              <div className="skeleton-line" style={{width: '90%'}}></div>
              <div className="skeleton-line" style={{width: '95%'}}></div>
              <div className="skeleton-line" style={{width: '80%'}}></div>
            </div>
          </div>
        )}

        {/* 流式内容 */}
        {isStreaming && streamingContent && !showAIThinking && (
          <div className="ai-chat-message ai-chat-message-assistant">
            <div className="ai-chat-message-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
            </div>
            <div className="ai-chat-message-content">
              <div className="ai-chat-message-markdown">
                <PaperCitationMarkdown
                  content={streamingContent}
                  onCitationHover={onCitationHover}
                  onCitationLeave={onCitationLeave}
                  onCitationClick={onCitationClick}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入框 */}
      <div className="ai-chat-input-container">
        <form onSubmit={handleSubmit} className="ai-chat-input-form">
          <textarea
            ref={textareaRef}
            className="ai-chat-input"
            placeholder="继续追问..."
            value={searchQuery}
            maxLength={1000}
            onChange={(e) => {
              setSearchQuery && setSearchQuery(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                e.preventDefault();
                if (!loading && searchQuery.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            disabled={loading}
            rows={1}
          />
          <button type="submit" className="ai-chat-send-btn" disabled={loading || !searchQuery.trim()}>
            {loading ? (
              <div className="spinner-small"></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIChatPanel;


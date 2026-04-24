/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { highlightOptions } from '../components/common/highlightLanguages';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../stores/sidebar.store';
import api from '../services/client';
import { conversationAPI } from '../services/conversation.api';
import { trackAIAssistantChat } from '../utils/usageTracker';
import logger from '../utils/logger';
import useMessageStream from '../hooks/useMessageStream';
import Logo from '../components/common/Logo';
import SEO from '../components/common/SEO';
import './styles/ChatPage.css';
import 'highlight.js/styles/github-dark.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('../components/auth/AuthModal'));

// Module-level plugin refs — stable across renders so ReactMarkdown can cache its internals
const REMARK_PLUGINS = [remarkGfm];
// eslint-disable-next-line react-hooks/exhaustive-deps
const REHYPE_PLUGINS = [[rehypeHighlight, highlightOptions]];

// Code Block Component with Copy Button (Memoized for performance)
const CodeBlock = React.memo(({ inline, className, children, ...props }) => {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef(null);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';

  const copyCode = React.useCallback(() => {
    const code = codeRef.current?.textContent;
    if (code) {
      navigator.clipboard.writeText(code.trim());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  }, []);

  if (inline) {
    return <code className="inline-code" {...props}>{children}</code>;
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{lang || 'text'}</span>
        <button onClick={copyCode} className="code-copy-btn">
          {isCopied ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy code
            </>
          )}
        </button>
      </div>
      <div className="code-block-content">
        <code ref={codeRef} className={className} {...props}>
          {children}
        </code>
      </div>
    </div>
  );
});

// ReactMarkdown components map — stable module-level ref
const MARKDOWN_COMPONENTS = { code: CodeBlock };

// User message — memoized so streamingContent ticks don't re-render history
const UserMessageItem = React.memo(function UserMessageItem({
  msg,
  isHovered,
  isEditing,
  anyEditing,
  editContent,
  setEditContent,
  onMouseEnter,
  onMouseLeave,
  onCopy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}) {
  if (isEditing) {
    return (
      <article className="message-group" data-role="user">
        <div className="message-wrapper">
          <div className="message-content-container">
            <div className="edit-container">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="edit-textarea"
                rows={4}
              />
              <div className="edit-buttons">
                <button onClick={onCancelEdit} className="edit-cancel">取消</button>
                <button onClick={() => onSaveEdit(msg.message_id)} className="edit-save">发送</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="message-group" data-role="user">
      <div className="message-wrapper">
        <div className="message-content-container">
          <div
            className="user-message-wrapper"
            onMouseEnter={() => onMouseEnter(msg.message_id)}
            onMouseLeave={onMouseLeave}
          >
            <div className="user-message-bubble">{msg.content}</div>
            {isHovered && !anyEditing && (
              <div className="hover-buttons">
                <button onClick={() => onCopy(msg.content)} className="hover-btn" title="Copy">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <button onClick={() => onStartEdit(msg)} className="hover-btn" title="Edit">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

// Assistant message — memoized; ReactMarkdown only reparses when this message's content changes
const AssistantMessageItem = React.memo(function AssistantMessageItem({
  msg,
  siblingEntry,
  anyEditing,
  onCopy,
  onRegenerate,
  onNavigateSibling,
}) {
  return (
    <article className="message-group" data-role="assistant">
      <div className="message-wrapper">
        <div className="message-content-container">
          <div className="message-avatar">
            <Logo size={24} className="assistant-logo" />
          </div>
          <div className="message-body">
            <div className="message-content">
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={MARKDOWN_COMPONENTS}
              >
                {msg.content}
              </ReactMarkdown>
            </div>

            {siblingEntry?.total > 1 && (
              <div className="branch-nav">
                <button
                  onClick={() => onNavigateSibling(msg.message_id, -1)}
                  className="branch-nav-btn"
                  title="Previous response"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <span className="branch-nav-count">
                  {(siblingEntry.currentIndex || 0) + 1} / {siblingEntry.total || 1}
                </span>
                <button
                  onClick={() => onNavigateSibling(msg.message_id, 1)}
                  className="branch-nav-btn"
                  title="Next response"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
            )}

            {!anyEditing && (
              <div className="hover-buttons">
                <button onClick={() => onCopy(msg.content)} className="hover-btn" title="Copy">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <button onClick={() => onRegenerate(msg.message_id)} className="hover-btn" title="Regenerate">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

// 面包屑 + 模型选择器（两处共用）
const ChatNavControls = ({
  navigate,
  modelLevel,
  setModelLevel,
  showModelDropdown,
  setShowModelDropdown,
  isStreaming,
  dropdownArrowStyle,
}) => {
  const modelLabel = modelLevel === 'low' ? '普通' : modelLevel === 'mid' ? '进阶' : '高级';
  const modelOptions = [
    { key: 'low', label: '普通' },
    { key: 'mid', label: '进阶' },
    { key: 'high', label: '高级' },
  ];
  return (
    <>
      <div className="chat-breadcrumb">
        <button className="chat-breadcrumb-link" onClick={() => navigate('/assistant')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          精品AI工具
        </button>
        <span className="chat-breadcrumb-separator">/</span>
        <span className="chat-breadcrumb-current">AI 聊天</span>
      </div>
      <div className="model-selector-simple">
        <button
          type="button"
          className="model-selector-simple-btn"
          onClick={() => setShowModelDropdown(!showModelDropdown)}
          disabled={isStreaming}
        >
          {modelLabel}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={dropdownArrowStyle}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {showModelDropdown && (
          <>
            <div className="model-dropdown-overlay" onClick={() => setShowModelDropdown(false)} />
            <div className="model-dropdown-menu">
              {modelOptions.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`model-dropdown-item ${modelLevel === opt.key ? 'active' : ''}`}
                  onClick={() => {
                    setModelLevel(opt.key);
                    setShowModelDropdown(false);
                  }}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { isMobile } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false); // Loading dots before streaming starts
  const [modelLevel, setModelLevel] = useState('low'); // 'low', 'mid', 'high' - AI chat model level
  const [showModelDropdown, setShowModelDropdown] = useState(false); // Model selector dropdown state
  const [showAuthModal, setShowAuthModal] = useState(false); // 登录弹窗
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [siblingInfo, setSiblingInfo] = useState({}); // Map of message_id -> {siblings, currentIndex, total}
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const hoverTimeoutRef = useRef(null); // 用于延迟显示hover按钮
  const scrollContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true); // 用户上滑后暂停自动滚动
  const scrollRafRef = useRef(null);
  // 保持对最新状态的引用，避免回调因依赖变化而频繁重建
  const messagesRef = useRef(messages);
  const siblingInfoRef = useRef(siblingInfo);
  const editContentRef = useRef(editContent);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { siblingInfoRef.current = siblingInfo; }, [siblingInfo]);
  useEffect(() => { editContentRef.current = editContent; }, [editContent]);

  // 先声明 loadSiblings, 以便在 stream 回调中引用
  const loadSiblings = useCallback(async (messageId) => {
    try {
      const response = await conversationAPI.getSiblingMessages(messageId);
      if (response.data.code === 0) {
        setSiblingInfo(prev => ({
          ...prev,
          [messageId]: {
            siblings: response.data.data.siblings,
            currentIndex: response.data.data.current_index,
            total: response.data.data.total
          }
        }));
      }
    } catch (error) {
      logger.error('Failed to load siblings:', error);
    }
  }, []);

  // SSE 流式处理 hook —— 解耦流解析逻辑
  const {
    startStream,
    abort: abortStream,
    isStreaming,
    streamedContent: streamingContent,
  } = useMessageStream({
    onConversationCreated: ({ conversationId, title }) => {
      setCurrentConversation({ id: conversationId, title });
    },
    onUserMessageCreated: (userMessageId) => {
      // 将临时用户消息替换为后端返回的真实 message_id
      setMessages(prev => prev.map(msg =>
        (msg.message_id.startsWith('temp-user-') || msg.message_id.startsWith('temp-'))
          ? { ...msg, message_id: userMessageId }
          : msg
      ));
    },
    onFirstChunk: () => {
      setIsWaitingForResponse(false);
    },
    onComplete: ({ messageId, parentMessageId, content, metadata }) => {
      const assistantMessage = {
        message_id: messageId,
        role: 'assistant',
        content,
        parent_message_id: parentMessageId,
        created_at: new Date().toISOString(),
        token_count: metadata?.token_count,
        finish_reason: metadata?.finish_reason,
      };
      setMessages(prev => [...prev, assistantMessage]);
      if (messageId) {
        loadSiblings(messageId);
      }
    },
    onError: (err) => {
      logger.error('Stream error:', err);
    },
  });

  // Memoize dropdown arrow style to prevent unnecessary re-renders
  const dropdownArrowStyle = useMemo(() => ({
    transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s ease'
  }), [showModelDropdown]);

  useEffect(() => {
    // 只在登录状态下加载对话历史
    if (isAuthenticated) {
      loadConversations();
    }
    
    // 清理hover定时器
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isAuthenticated]);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  const scrollToBottom = useCallback((smooth = false) => {
    if (!shouldAutoScrollRef.current) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollContainerRef.current
        || messagesEndRef.current?.parentElement?.parentElement;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }, []);

  // 监听用户滚动：上滑时暂停自动滚动；回到底部时恢复
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 40;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentConversation]);

  // 新消息 / 等待状态变化 → 重置自动滚动 + 平滑滚动
  useEffect(() => {
    shouldAutoScrollRef.current = true;
    scrollToBottom(true);
  }, [messages.length, isWaitingForResponse, scrollToBottom]);

  // 流式 chunk → 瞬时滚动（避免 smooth 动画堆积卡顿）
  useEffect(() => {
    if (streamingContent) scrollToBottom(false);
  }, [streamingContent, scrollToBottom]);

  useEffect(() => () => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = window.innerWidth >= 768 ? window.innerHeight * 0.55 : window.innerHeight * 0.45;
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [inputMessage]);

  const loadConversations = async () => {
    try {
      const response = await api.get('/user/conversations', {
        params: { page: 1, page_size: 50, conversation_type: 'chat' }
      });
      // Backend returns {code: 0, message, data}, not {success: true}
      if (response.data.code === 0 && response.data.data) {
        const convs = response.data.data.conversations || [];
        setConversations(convs);
      }
    } catch (error) {
      logger.error('Failed to load chat conversations:', error);
    }
  };

  const loadConversation = async (conversationId) => {
    try {
      setLoading(true);
      const response = await api.get(`/user/conversations/${conversationId}/history`);

      if (response.data.code === 0) {
        const data = response.data.data || {};
        const conversation = data.conversation || {};
        const loadedMessages = data.messages || [];

        setCurrentConversation({ id: conversationId });

        // Set model level from conversation metadata
        if (conversation.model_level) {
          setModelLevel(conversation.model_level);
        }

        setMessages(loadedMessages);

        // Load sibling info for all assistant messages
        loadedMessages.forEach(msg => {
          if (msg.role === 'assistant') {
            loadSiblings(msg.message_id);
          }
        });
      } else {
        logger.error('Failed to load conversation: invalid response code', response.data);
      }
    } catch (error) {
      logger.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  // 流式请求结束后统一的收尾
  const finalizeStream = () => {
    setIsWaitingForResponse(false);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);
  };

  const createNewConversation = async (content) => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    setIsWaitingForResponse(true);

    // Immediately add user message to UI (LibreChat style)
    const tempUserMessage = {
      message_id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      parent_message_id: null,
      created_at: new Date().toISOString()
    };
    setMessages([tempUserMessage]);

    await startStream('/api/v1/user/conversations/chat/new', {
      body: { content, model_level: modelLevel },
    });
    // Reload conversations to update sidebar history
    await loadConversations();
    finalizeStream();
  };

  const sendMessage = async (content) => {
    if (!content.trim()) return;

    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (!currentConversation) {
      await createNewConversation(content);
      return;
    }

    setIsWaitingForResponse(true);

    // Find the latest message ID to use as parent
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const parentMessageId = latestMessage?.message_id || null;

    const userMessage = {
      message_id: `temp-${Date.now()}`,
      role: 'user',
      content,
      parent_message_id: parentMessageId,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Scroll user message to top of viewport after a short delay
    setTimeout(() => {
      const messagesContainer = messagesEndRef.current?.parentElement;
      if (messagesContainer) {
        const userMessageElements = messagesContainer.querySelectorAll('[data-role="user"]');
        const lastUserMessage = userMessageElements[userMessageElements.length - 1];
        if (lastUserMessage) {
          lastUserMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);

    await startStream(`/api/v1/user/conversations/${currentConversation.id}/chat/stream`, {
      body: {
        content,
        parent_message_id: parentMessageId,
        model_level: modelLevel,
      },
    });
    finalizeStream();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && !isStreaming) {
      // 记录智能助手对话使用
      trackAIAssistantChat('智能助手对话');
      sendMessage(inputMessage);
      setInputMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px';
      }
    }
  };

  const stopStreaming = () => {
    abortStream();
    setIsWaitingForResponse(false);
  };

  const copyToClipboard = useCallback((content) => {
    navigator.clipboard.writeText(content);
  }, []);

  const regenerateMessage = useCallback(async (messageId) => {
    setIsWaitingForResponse(true);
    const messageIndex = messagesRef.current.findIndex(m => m.message_id === messageId);
    if (messageIndex >= 0) {
      setMessages(prev => prev.slice(0, messageIndex));
    }
    await startStream(`/api/v1/user/conversations/messages/${messageId}/regenerate`, {
      method: 'POST',
    });
    setIsWaitingForResponse(false);
  }, [startStream]);

  const startEditMessage = useCallback((message) => {
    setEditingMessage(message.message_id);
    setEditContent(message.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setEditContent('');
  }, []);

  const saveEdit = useCallback(async (messageId) => {
    const content = editContentRef.current;
    if (!content.trim()) return;

    setIsWaitingForResponse(true);
    setEditingMessage(null);

    const msgs = messagesRef.current;
    const messageIndex = msgs.findIndex(m => m.message_id === messageId);
    const editedMessage = msgs[messageIndex];
    const parentMessageId = messageIndex > 0 ? msgs[messageIndex - 1].message_id : null;

    if (messageIndex >= 0) {
      setMessages(prev => prev.slice(0, messageIndex));
    }

    const updatedUserMessage = {
      message_id: messageId,
      role: 'user',
      content,
      parent_message_id: parentMessageId,
      created_at: editedMessage?.created_at || new Date().toISOString()
    };
    setMessages(prev => [...prev, updatedUserMessage]);

    await startStream(`/api/v1/user/conversations/messages/${messageId}/edit`, {
      body: { content },
    });
    setIsWaitingForResponse(false);
    setEditContent('');
  }, [startStream]);

  const navigateToSibling = useCallback(async (messageId, direction) => {
    const info = siblingInfoRef.current[messageId];
    if (!info || info.total <= 1) return;

    let newIndex = info.currentIndex + direction;
    if (newIndex < 0) newIndex = info.total - 1;
    if (newIndex >= info.total) newIndex = 0;

    const targetMessage = info.siblings[newIndex];
    if (!targetMessage) return;

    try {
      const response = await conversationAPI.getBranchChain(targetMessage.message_id);
      if (response.data.code !== 0) {
        logger.error('Failed to load branch chain');
        return;
      }

      const branchChain = response.data.data;
      if (!branchChain || branchChain.length === 0) {
        logger.error('Empty branch chain returned');
        return;
      }

      const msgs = messagesRef.current;
      const messageIndex = msgs.findIndex(m => m.message_id === messageId);
      if (messageIndex < 0) return;

      const newMessages = msgs.slice(0, messageIndex);
      newMessages.push(...branchChain.slice(messageIndex));
      setMessages(newMessages);

      for (const msg of branchChain.slice(messageIndex)) {
        await loadSiblings(msg.message_id);
      }
    } catch (error) {
      logger.error('Failed to load branch chain:', error);
    }
  }, [loadSiblings]);

  const handleUserMouseEnter = useCallback((messageId) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredMessage(messageId), 1000);
  }, []);

  const handleUserMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredMessage(null);
  }, []);

  const deleteConversation = async (conversationId) => {
    try {
      await conversationAPI.deleteConversation(conversationId);
      await loadConversations();
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      logger.error('Failed to delete conversation:', error);
    }
  };

  const renameConversation = async (conversationId, newTitle) => {
    try {
      await api.put(`/user/conversations/${conversationId}/title`, { title: newTitle });
      // 更新本地conversations列表
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId ? { ...conv, title: newTitle } : conv
        )
      );
    } catch (error) {
      logger.error('Failed to rename conversation:', error);
    }
  };


  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  return (
    <div className="chat-page-wrapper chat-page">
      <SEO
        title="AI 智能助手 - Scholay | 学术问答与研究对话"
        description="Scholay AI 智能助手，提供多模型学术问答、研究讨论和知识探索，支持普通、进阶和高级AI模型选择。"
        keywords="AI学术助手,AI问答,学术对话,研究助手,智能问答,GPT学术"
        canonical="/chat"
      />
      {/* Main Chat Area - Completely Rewritten */}
      <div className={`main-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="search-content">

          {/* Loading State */}
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : messages.length === 0 && !currentConversation ? (
            /* New Conversation - Centered Layout with navbar */
            <div className="empty-search-layout">
              <nav className="empty-navbar">
                <div className="navbar-left-group">
                  <ChatNavControls
                    navigate={navigate}
                    modelLevel={modelLevel}
                    setModelLevel={setModelLevel}
                    showModelDropdown={showModelDropdown}
                    setShowModelDropdown={setShowModelDropdown}
                    isStreaming={isStreaming}
                    dropdownArrowStyle={dropdownArrowStyle}
                  />
                </div>
              </nav>
              <div className="welcome-container">
                <h1 className="welcome-title">
                  {getGreeting()}, 开始你的AI聊天
                </h1>
                <p className="welcome-subtitle" style={{ color: '#9e9e9e', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto 24px', lineHeight: '1.6', textAlign: 'center' }}>
                  Scholay AI 助手可以帮您解答学术问题、讨论研究方向、分析论文观点、生成文献综述等。支持普通、进阶和高级三种AI模型，满足不同深度的学术对话需求。
                </p>
                <form onSubmit={handleSubmit} className="welcome-composer">
                  <div className="composer-input-area">
                    <textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      placeholder="输入您的问题..."
                      rows={1}
                      disabled={isStreaming}
                      className="chat-input"
                    />
                    {isStreaming ? (
                      <button type="button" onClick={stopStreaming} className="btn-send">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2"/>
                        </svg>
                      </button>
                    ) : (
                      <button type="submit" disabled={!inputMessage.trim()} className="btn-send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="22" y1="2" x2="11" y2="13"/>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Existing Conversation - Messages + Fixed Bottom Input */
            <div className="chat-view">
              <nav className="results-navbar">
                <div className="navbar-title-group">
                  <ChatNavControls
                    navigate={navigate}
                    modelLevel={modelLevel}
                    setModelLevel={setModelLevel}
                    showModelDropdown={showModelDropdown}
                    setShowModelDropdown={setShowModelDropdown}
                    isStreaming={isStreaming}
                    dropdownArrowStyle={dropdownArrowStyle}
                  />
                  <button className="new-conversation-btn" onClick={handleNewConversation} title="新建对话">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"/>
                    </svg>
                  </button>
                </div>
              </nav>
              <div className="messages-scrollable" ref={scrollContainerRef}>
                <div className="messages-inner">
                  {messages.map((msg, index) => (
                    msg.role === 'user' ? (
                      <UserMessageItem
                        key={msg.message_id || index}
                        msg={msg}
                        isHovered={hoveredMessage === msg.message_id}
                        isEditing={editingMessage === msg.message_id}
                        anyEditing={!!editingMessage}
                        editContent={editContent}
                        setEditContent={setEditContent}
                        onMouseEnter={handleUserMouseEnter}
                        onMouseLeave={handleUserMouseLeave}
                        onCopy={copyToClipboard}
                        onStartEdit={startEditMessage}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                      />
                    ) : (
                      <AssistantMessageItem
                        key={msg.message_id || index}
                        msg={msg}
                        siblingEntry={siblingInfo[msg.message_id]}
                        anyEditing={!!editingMessage}
                        onCopy={copyToClipboard}
                        onRegenerate={regenerateMessage}
                        onNavigateSibling={navigateToSibling}
                      />
                    )
                  ))}

                  {/* ChatGPT-style thinking indicator - shown while waiting for response */}
                  {isWaitingForResponse && !streamingContent && (
                    <article className="message-group" data-role="assistant">
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          <div className="message-avatar">
                            <Logo size={24} className="assistant-logo" />
                          </div>
                          <div className="message-body">
                            <div className="thinking-indicator">
                              <div className="thinking-dot"></div>
                              <div className="thinking-dot"></div>
                              <div className="thinking-dot"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Streaming content - shown when content arrives */}
                  {streamingContent && (
                    <article className="message-group" data-role="assistant">
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          <div className="message-avatar">
                            <Logo size={24} className="assistant-logo" />
                          </div>
                          <div className="message-body">
                            <div className="message-content streaming">
                              <ReactMarkdown
                                remarkPlugins={REMARK_PLUGINS}
                                rehypePlugins={REHYPE_PLUGINS}
                                components={MARKDOWN_COMPONENTS}
                              >
                                {streamingContent}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Fixed Bottom Input */}
              <form onSubmit={handleSubmit} className="composer-wrapper">
                <div className="composer-input-area">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="输入您的问题..."
                    rows={1}
                    disabled={isStreaming}
                    className="chat-input"
                  />
                  {isStreaming ? (
                    <button type="button" onClick={stopStreaming} className="btn-send">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                      </svg>
                    </button>
                  ) : (
                    <button type="submit" disabled={!inputMessage.trim()} className="btn-send">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
      
      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              // 登录成功后可以自动发送消息
              if (inputMessage.trim()) {
                sendMessage(inputMessage);
              }
            }}
          />
        </Suspense>
      )}
      
    </div>
  );
}

export default ChatPage;

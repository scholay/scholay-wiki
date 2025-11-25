import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useOutletContext } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { Menu } from 'lucide-react';
import api, { subscriptionAPI } from '../services/api';
import './ChatPageNew.css';
import 'highlight.js/styles/github-dark.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('../components/AuthModal'));

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

function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { updateSidebarConfig, isMobile, openMobileSidebar } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false); // Loading dots before streaming starts
  const [modelLevel, setModelLevel] = useState('low'); // 'low', 'mid', 'high' - AI chat model level
  const [showModelDropdown, setShowModelDropdown] = useState(false); // Model selector dropdown state
  const [quota, setQuota] = useState(null); // AI Chat quota limits
  const [usage, setUsage] = useState(null); // AI Chat usage counts
  const [showAuthModal, setShowAuthModal] = useState(false); // 登录弹窗
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [siblingInfo, setSiblingInfo] = useState({}); // Map of message_id -> {siblings, currentIndex, total}
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const loadingStartTimeRef = useRef(null); // Track when loading started for minimum display time
  const hoverTimeoutRef = useRef(null); // 用于延迟显示hover按钮

  // Memoize dropdown arrow style to prevent unnecessary re-renders
  const dropdownArrowStyle = useMemo(() => ({
    transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s ease'
  }), [showModelDropdown]);

  // Fetch AI Chat quota and usage
  useEffect(() => {
    const fetchQuotaAndUsage = async () => {
      // 只在登录状态下获取配额
      if (!isAuthenticated) return;
      
      try {
        const response = await subscriptionAPI.getUsage();
        if (response.data.code === 0) {
          const data = response.data.data;
          // Map backend data to frontend format for AI Chat quotas
          const quotaData = {
            aiChatNormalQuota: data.limits?.ai_chat_normal?.limit ?? -1,
            aiChatMidQuota: data.limits?.ai_chat_mid?.limit ?? -1,
            aiChatHighQuota: data.limits?.ai_chat_high?.limit ?? -1,
          };
          const usageData = {
            aiChatNormalCount: data.usage?.ai_chat_normal ?? 0,
            aiChatMidCount: data.usage?.ai_chat_mid ?? 0,
            aiChatHighCount: data.usage?.ai_chat_high ?? 0,
          };
          setQuota(quotaData);
          setUsage(usageData);
        }
      } catch (error) {
        console.error('Failed to fetch AI Chat quota/usage:', error);
      }
    };

    if (isAuthenticated) {
      fetchQuotaAndUsage();
    }
  }, [isAuthenticated]);

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

  // Auto-scroll during streaming and message updates
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isStreaming, isWaitingForResponse]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = window.innerWidth >= 768 ? window.innerHeight * 0.55 : window.innerHeight * 0.45;
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [inputMessage]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      // Get the scrollable container (.messages-scrollable)
      // messagesEndRef -> .messages-inner -> .messages-scrollable
      const scrollContainer = messagesEndRef.current.parentElement?.parentElement;
      if (scrollContainer) {
        // Scroll to the absolute bottom of the container
        // This ensures the content is fully visible above the fixed input
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  };

  // Get remaining count for a model level
  const getRemainingCount = (level) => {
    if (!quota || !usage) return null;

    const quotaMap = {
      'low': { quota: quota.aiChatNormalQuota, usage: usage.aiChatNormalCount },
      'mid': { quota: quota.aiChatMidQuota, usage: usage.aiChatMidCount },
      'high': { quota: quota.aiChatHighQuota, usage: usage.aiChatHighCount }
    };

    const { quota: quotaValue, usage: usageValue } = quotaMap[level] || {};
    if (quotaValue === undefined) return null;

    // -1 means unlimited
    if (quotaValue === -1) return '无限制';

    const remaining = Math.max(0, quotaValue - usageValue);
    return remaining;
  };

  // Check if model is available based on user subscription
  const isModelAvailable = (level) => {
    if (!user?.subscription) return true;

    const planCode = user.subscription.plan_code;

    // FREE users can only use 'low' (normal)
    if (planCode === 'FREE' && level !== 'low') {
      return false;
    }

    // PRO users can use 'low' and 'mid'
    if (planCode === 'PRO' && level === 'high') {
      return false;
    }

    // MAX users can use all models
    return true;
  };

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
      console.error('Failed to load chat conversations:', error);
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
        console.error('Failed to load conversation: invalid response code', response.data);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewConversation = async (content) => {
    // 检查是否登录，未登录则弹出登录弹窗
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    
    try {
      setIsStreaming(true);
      setStreamingContent('');
      setIsWaitingForResponse(true); // Show loading dots
      loadingStartTimeRef.current = Date.now(); // Track when loading started

      // Immediately add user message to UI (LibreChat style)
      const tempUserMessage = {
        message_id: `temp-user-${Date.now()}`,
        role: 'user',
        content: content,
        parent_message_id: null,
        created_at: new Date().toISOString()
      };
      setMessages([tempUserMessage]);

      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/v1/user/conversations/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        body: JSON.stringify({
          content,
          model_level: modelLevel  // Pass selected model level
        }),
        signal: abortControllerRef.current.signal
      });

      await handleStreamResponse(response);
      // Reload conversations to update sidebar history
      await loadConversations();
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to create conversation:', error);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setIsWaitingForResponse(false); // Hide loading dots
      // 自动聚焦到输入框，方便用户继续对话
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    }
  };

  const sendMessage = async (content) => {
    if (!content.trim()) return;

    // 检查是否登录，未登录则弹出登录弹窗
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (!currentConversation) {
      await createNewConversation(content);
      return;
    }

    try {
      setIsStreaming(true);
      setStreamingContent('');
      setIsWaitingForResponse(true); // Show loading dots
      loadingStartTimeRef.current = Date.now(); // Track when loading started

      // Find the latest message ID to use as parent
      const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const parentMessageId = latestMessage?.message_id || null;

      const userMessage = {
        message_id: `temp-${Date.now()}`,
        role: 'user',
        content: content,
        parent_message_id: parentMessageId,  // Track parent for message chain
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

      abortControllerRef.current = new AbortController();

      // Send parent_message_id and model_level to backend for context building
      const response = await fetch(`/api/v1/user/conversations/${currentConversation.id}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        body: JSON.stringify({
          content,
          parent_message_id: parentMessageId,  // Critical: enables context chain
          model_level: modelLevel  // Pass selected model level
        }),
        signal: abortControllerRef.current.signal
      });

      await handleStreamResponse(response);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to send message:', error);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setIsWaitingForResponse(false); // Hide loading dots
      // 自动聚焦到输入框，方便用户继续对话
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    }
  };

  // Note: We no longer use a minimum display time for loading dots
  // because we want to hide them immediately when streaming content arrives
  // This prevents double indicators (loading dots + streaming cursor)

  const handleStreamResponse = async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessageId = null;
    let parentMessageId = null;
    let fullContent = '';
    let userMessageId = null;
    let messageEndReceived = false;

    // Smooth streaming optimization: batch updates using requestAnimationFrame
    let pendingContent = '';
    let animationFrameId = null;

    const updateStreamingContent = () => {
      if (pendingContent !== fullContent) {
        setStreamingContent(fullContent);
        pendingContent = fullContent;
      }
      animationFrameId = null;
    };

    const scheduleUpdate = () => {
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(updateStreamingContent);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Final update to ensure all content is displayed
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
          updateStreamingContent();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'conversation_created') {
                const newConvId = data.metadata.conversation_id;
                const newConvTitle = data.metadata.title;

                setCurrentConversation({
                  id: newConvId,
                  title: newConvTitle
                });

              } else if (data.type === 'user_message_created') {
                // Update temp user message with real message_id from backend
                userMessageId = data.message_id;
                parentMessageId = userMessageId;

                setMessages(prev => prev.map(msg =>
                  msg.message_id.startsWith('temp-user-') || msg.message_id.startsWith('temp-')
                    ? { ...msg, message_id: userMessageId }
                    : msg
                ));

              } else if (data.type === 'message_start') {
                assistantMessageId = data.message_id;
                // Get parent_message_id from metadata (sent by backend)
                parentMessageId = data.metadata?.parent_message_id || parentMessageId;
                // Don't hide loading yet - wait for first content_delta
              } else if (data.type === 'content_delta') {
                const isFirstContent = fullContent === '';
                fullContent += data.content;

                if (isFirstContent) {
                  // For the first content, use flushSync to ensure atomic state updates
                  // This prevents both loading indicators from showing at the same time
                  flushSync(() => {
                    setIsWaitingForResponse(false);
                    setStreamingContent(fullContent);
                  });
                  pendingContent = fullContent;
                  loadingStartTimeRef.current = null;
                } else {
                  // For subsequent content, use batched updates for smooth streaming
                  scheduleUpdate();
                }
              } else if (data.type === 'message_end') {
                const assistantMessage = {
                  message_id: assistantMessageId,
                  role: 'assistant',
                  content: fullContent,
                  parent_message_id: parentMessageId,  // Track parent for context chain
                  created_at: new Date().toISOString(),
                  token_count: data.metadata?.token_count,
                  finish_reason: data.metadata?.finish_reason
                };

                setMessages(prev => [...prev, assistantMessage]);

                // Load sibling info for the new assistant message
                if (assistantMessageId) {
                  loadSiblings(assistantMessageId);
                }
                fullContent = '';
                parentMessageId = null;  // Reset for next message
                messageEndReceived = true;
              } else if (data.type === 'error') {
                console.error('Stream error:', data.error);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Stream error:', error);
        throw error;
      }
    } finally {
      // If stream ended but we never received message_end, add whatever content we have
      if (fullContent && !messageEndReceived && assistantMessageId) {
        const assistantMessage = {
          message_id: assistantMessageId,
          role: 'assistant',
          content: fullContent,
          parent_message_id: parentMessageId,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
        if (assistantMessageId) {
          loadSiblings(assistantMessageId);
        }
      }

      // Refocus the input textarea after streaming completes
      // This allows the user to immediately type their next question
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }

    // Wait a tick to ensure state updates are processed
    if (messageEndReceived) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && !isStreaming) {
      sendMessage(inputMessage);
      setInputMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px';
      }
    }
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
    setStreamingContent('');
  };

  const copyToClipboard = (content) => {
    navigator.clipboard.writeText(content);
  };

  const regenerateMessage = async (messageId) => {
    try {
      setIsStreaming(true);
      setStreamingContent('');
      setIsWaitingForResponse(true); // Show loading dots
      loadingStartTimeRef.current = Date.now(); // Track when loading started

      // Remove the old assistant message and any messages after it
      const messageIndex = messages.findIndex(m => m.message_id === messageId);
      if (messageIndex >= 0) {
        setMessages(prev => prev.slice(0, messageIndex));
      }

      abortControllerRef.current = new AbortController();

      const response = await fetch(`/api/v1/user/conversations/messages/${messageId}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        signal: abortControllerRef.current.signal
      });

      await handleStreamResponse(response);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to regenerate message:', error);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setIsWaitingForResponse(false); // Hide loading dots
    }
  };

  const startEditMessage = (message) => {
    setEditingMessage(message.message_id);
    setEditContent(message.content);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditContent('');
  };

  const saveEdit = async (messageId) => {
    if (!editContent.trim()) return;

    try {
      setIsStreaming(true);
      setStreamingContent('');
      setIsWaitingForResponse(true); // Show loading dots
      loadingStartTimeRef.current = Date.now(); // Track when loading started
      setEditingMessage(null);

      // Find the message being edited and get the parent context
      const messageIndex = messages.findIndex(m => m.message_id === messageId);
      const editedMessage = messages[messageIndex];
      const parentMessageId = messageIndex > 0 ? messages[messageIndex - 1].message_id : null;

      // Remove the edited message and everything after it
      if (messageIndex >= 0) {
        setMessages(prev => prev.slice(0, messageIndex));
      }

      // Add the edited user message to UI immediately
      const updatedUserMessage = {
        message_id: messageId,
        role: 'user',
        content: editContent,
        parent_message_id: parentMessageId,
        created_at: editedMessage?.created_at || new Date().toISOString()
      };
      setMessages(prev => [...prev, updatedUserMessage]);

      abortControllerRef.current = new AbortController();

      const response = await fetch(`/api/v1/user/conversations/messages/${messageId}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        body: JSON.stringify({ content: editContent }),
        signal: abortControllerRef.current.signal
      });

      await handleStreamResponse(response);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to edit message:', error);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setIsWaitingForResponse(false); // Hide loading dots
      setEditContent('');
    }
  };

  const loadSiblings = async (messageId) => {
    try {
      const response = await fetch(`/api/v1/user/conversations/messages/${messageId}/siblings`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setSiblingInfo(prev => ({
          ...prev,
          [messageId]: {
            siblings: result.data.siblings,
            currentIndex: result.data.current_index,
            total: result.data.total
          }
        }));
      }
    } catch (error) {
      console.error('Failed to load siblings:', error);
    }
  };

  const navigateToSibling = async (messageId, direction) => {
    const info = siblingInfo[messageId];
    if (!info || info.total <= 1) return;

    let newIndex = info.currentIndex + direction;
    if (newIndex < 0) newIndex = info.total - 1;
    if (newIndex >= info.total) newIndex = 0;

    const targetMessage = info.siblings[newIndex];
    if (!targetMessage) return;

    try {
      // Load complete branch chain for the target sibling
      const response = await fetch(`/api/v1/user/conversations/messages/${targetMessage.message_id}/branch`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        }
      });

      if (!response.ok) {
        console.error('Failed to load branch chain');
        return;
      }

      const result = await response.json();
      const branchChain = result.data;

      if (!branchChain || branchChain.length === 0) {
        console.error('Empty branch chain returned');
        return;
      }

      // Find the index of current message in the messages array
      const messageIndex = messages.findIndex(m => m.message_id === messageId);
      if (messageIndex < 0) return;

      // Replace from the branch point onwards with the complete branch chain
      const newMessages = messages.slice(0, messageIndex);
      newMessages.push(...branchChain.slice(messageIndex));

      setMessages(newMessages);

      // Load sibling info for all messages in the new branch
      for (const msg of branchChain.slice(messageIndex)) {
        await loadSiblings(msg.message_id);
      }
    } catch (error) {
      console.error('Failed to load branch chain:', error);
    }
  };

  const deleteConversation = async (conversationId) => {
    try {
      await api.delete(`/user/conversations/${conversationId}`);
      await loadConversations();
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
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
      console.error('Failed to rename conversation:', error);
    }
  };

  // 更新侧边栏配置 - 只在登录状态下更新
  useEffect(() => {
    if (isAuthenticated) {
      updateSidebarConfig({
        showHistory: true,
        historyType: 'conversation',
        historyItems: conversations,
        currentItemId: currentConversation?.id || null,
        onSelectItem: loadConversation,
        onDeleteItem: deleteConversation,
        onRenameItem: renameConversation,
        onNewItem: handleNewConversation,
        historyLoading: loading,
      });
    }
  }, [conversations, currentConversation?.id, loading, updateSidebarConfig, isAuthenticated]);

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
      {/* Main Chat Area - Completely Rewritten */}
      <div className={`main-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
        <div className="search-content">

          {/* Loading State */}
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : messages.length === 0 && !currentConversation ? (
            /* New Conversation - Centered Layout with navbar */
            <div className="empty-search-layout">
              <nav className="empty-navbar">
                {/* 移动端菜单按钮 */}
                {isMobile && (
                  <button 
                    className="mobile-menu-btn"
                    onClick={openMobileSidebar}
                    aria-label="打开菜单"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="8" x2="20" y2="8" />
                      <line x1="4" y1="16" x2="14" y2="16" />
                    </svg>
                  </button>
                )}
                <div className="navbar-left-group">
                  <h1 className="empty-page-title">AI 对话</h1>
                  {/* Lightweight Model Selector with quota display */}
                  <div className="model-selector-simple">
                    <button
                      type="button"
                      className="model-selector-simple-btn"
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                      disabled={isStreaming}
                    >
                      {modelLevel === 'low' ? '普通' : modelLevel === 'mid' ? '进阶' : '高级'}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={dropdownArrowStyle}
                      >
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    {showModelDropdown && (
                      <>
                        <div className="model-dropdown-overlay" onClick={() => setShowModelDropdown(false)} />
                        <div className="model-dropdown-menu">
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'low' ? 'active' : ''} ${!isModelAvailable('low') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('low')) {
                                setModelLevel('low');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('low')}
                          >
                            <span>普通</span>
                            {getRemainingCount('low') !== null && getRemainingCount('low') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('low')} 次
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'mid' ? 'active' : ''} ${!isModelAvailable('mid') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('mid')) {
                                setModelLevel('mid');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('mid')}
                          >
                            <span>进阶</span>
                            {getRemainingCount('mid') !== null && getRemainingCount('mid') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('mid')} 次
                              </span>
                            )}
                            {!isModelAvailable('mid') && user?.subscription?.plan_code === 'FREE' && (
                              <span className="upgrade-badge">需要升级</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'high' ? 'active' : ''} ${!isModelAvailable('high') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('high')) {
                                setModelLevel('high');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('high')}
                          >
                            <span>高级</span>
                            {getRemainingCount('high') !== null && getRemainingCount('high') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('high')} 次
                              </span>
                            )}
                            {!isModelAvailable('high') && (
                              <span className="upgrade-badge">
                                {user?.subscription?.plan_code === 'FREE' ? '需要升级' : '需要 MAX'}
                              </span>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </nav>
              <div className="welcome-container">
                <h1 className="welcome-title">
                  {getGreeting()}, 开始你的AI对话
                </h1>
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
                {/* 移动端菜单按钮 */}
                {isMobile && (
                  <button 
                    className="mobile-menu-btn"
                    onClick={openMobileSidebar}
                    aria-label="打开菜单"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="8" x2="20" y2="8" />
                      <line x1="4" y1="16" x2="14" y2="16" />
                    </svg>
                  </button>
                )}
                <div className="navbar-title-group">
                  <h1 className="page-title">AI 对话</h1>
                  {/* Lightweight Model Selector with quota display */}
                  <div className="model-selector-simple">
                    <button
                      type="button"
                      className="model-selector-simple-btn"
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                      disabled={isStreaming}
                    >
                      {modelLevel === 'low' ? '普通' : modelLevel === 'mid' ? '进阶' : '高级'}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={dropdownArrowStyle}
                      >
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    {showModelDropdown && (
                      <>
                        <div className="model-dropdown-overlay" onClick={() => setShowModelDropdown(false)} />
                        <div className="model-dropdown-menu">
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'low' ? 'active' : ''} ${!isModelAvailable('low') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('low')) {
                                setModelLevel('low');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('low')}
                          >
                            <span>普通</span>
                            {getRemainingCount('low') !== null && getRemainingCount('low') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('low')} 次
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'mid' ? 'active' : ''} ${!isModelAvailable('mid') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('mid')) {
                                setModelLevel('mid');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('mid')}
                          >
                            <span>进阶</span>
                            {getRemainingCount('mid') !== null && getRemainingCount('mid') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('mid')} 次
                              </span>
                            )}
                            {!isModelAvailable('mid') && user?.subscription?.plan_code === 'FREE' && (
                              <span className="upgrade-badge">需要升级</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`model-dropdown-item ${modelLevel === 'high' ? 'active' : ''} ${!isModelAvailable('high') ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isModelAvailable('high')) {
                                setModelLevel('high');
                                setShowModelDropdown(false);
                              }
                            }}
                            disabled={!isModelAvailable('high')}
                          >
                            <span>高级</span>
                            {getRemainingCount('high') !== null && getRemainingCount('high') !== '无限制' && (
                              <span className="quota-badge">
                                剩余 {getRemainingCount('high')} 次
                              </span>
                            )}
                            {!isModelAvailable('high') && (
                              <span className="upgrade-badge">
                                {user?.subscription?.plan_code === 'FREE' ? '需要升级' : '需要 MAX'}
                              </span>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button className="new-conversation-btn" onClick={handleNewConversation} title="新建对话">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"/>
                    </svg>
                  </button>
                </div>
              </nav>
              <div className="messages-scrollable">
                <div className="messages-inner">
                  {messages.map((msg, index) => (
                    <article
                      key={msg.message_id || index}
                      className="message-group"
                      data-role={msg.role}
                    >
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          {msg.role === 'user' ? (
                            // User message - Right aligned bubble
                            editingMessage === msg.message_id ? (
                              <div className="edit-container">
                                <textarea
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  className="edit-textarea"
                                  rows={4}
                                />
                                <div className="edit-buttons">
                                  <button onClick={cancelEdit} className="edit-cancel">
                                    取消
                                  </button>
                                  <button onClick={() => saveEdit(msg.message_id)} className="edit-save">
                                    发送
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="user-message-wrapper"
                                onMouseEnter={() => {
                                  // 清除之前的定时器
                                  if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                  }
                                  // 设置1秒延迟显示hover按钮
                                  hoverTimeoutRef.current = setTimeout(() => {
                                    setHoveredMessage(msg.message_id);
                                  }, 1000);
                                }}
                                onMouseLeave={() => {
                                  // 清除定时器
                                  if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = null;
                                  }
                                  setHoveredMessage(null);
                                }}
                              >
                                <div className="user-message-bubble">
                                  {msg.content}
                                </div>

                                {hoveredMessage === msg.message_id && !editingMessage && (
                                  <div className="hover-buttons">
                                    <button onClick={() => copyToClipboard(msg.content)} className="hover-btn" title="Copy">
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                      </svg>
                                    </button>
                                    <button onClick={() => startEditMessage(msg)} className="hover-btn" title="Edit">
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            // Assistant message - Full width with avatar
                            <>
                              <div className="message-avatar">
                                <img src="/logo.png" alt="AI Assistant" className="assistant-logo" />
                              </div>

                              <div className="message-body">
                                <div className="message-content">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                      code: CodeBlock
                                    }}
                                  >
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>

                                {/* Branch Navigation for Assistant Messages */}
                                {siblingInfo[msg.message_id]?.total > 1 && (
                                  <div className="branch-nav">
                                    <button
                                      onClick={() => navigateToSibling(msg.message_id, -1)}
                                      className="branch-nav-btn"
                                      title="Previous response"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="15 18 9 12 15 6"/>
                                      </svg>
                                    </button>
                                    <span className="branch-nav-count">
                                      {(siblingInfo[msg.message_id]?.currentIndex || 0) + 1} / {siblingInfo[msg.message_id]?.total || 1}
                                    </span>
                                    <button
                                      onClick={() => navigateToSibling(msg.message_id, 1)}
                                      className="branch-nav-btn"
                                      title="Next response"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="9 18 15 12 9 6"/>
                                      </svg>
                                    </button>
                                  </div>
                                )}

                                {/* Assistant message buttons: always show */}
                                {!editingMessage && (
                                  <div className="hover-buttons">
                                    <button onClick={() => copyToClipboard(msg.content)} className="hover-btn" title="Copy">
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                      </svg>
                                    </button>
                                    <button onClick={() => regenerateMessage(msg.message_id)} className="hover-btn" title="Regenerate">
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="23 4 23 10 17 10"/>
                                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}

                  {/* ChatGPT-style thinking indicator - shown while waiting for response */}
                  {isWaitingForResponse && !streamingContent && (
                    <article className="message-group" data-role="assistant">
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          <div className="message-avatar">
                            <img src="/logo.png" alt="AI Assistant" className="assistant-logo" />
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
                            <img src="/logo.png" alt="AI Assistant" className="assistant-logo" />
                          </div>
                          <div className="message-body">
                            <div className="message-content streaming">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                                components={{
                                  code: CodeBlock
                                }}
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

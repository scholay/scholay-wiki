import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useAuth } from '../utils/AuthContext';
import AppSidebar from '../components/AppSidebar';
import api from '../services/api';
import './ChatPageNew.css';
import 'highlight.js/styles/github-dark.css';

// Code Block Component with Copy Button
function CodeBlock({ inline, className, children, ...props }) {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef(null);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';

  const copyCode = () => {
    const code = codeRef.current?.textContent;
    if (code) {
      navigator.clipboard.writeText(code.trim());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  };

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
}

function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false); // Loading dots before streaming starts
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [siblingInfo, setSiblingInfo] = useState({}); // Map of message_id -> {siblings, currentIndex, total}
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const loadingStartTimeRef = useRef(null); // Track when loading started for minimum display time

  useEffect(() => {
    loadConversations();
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  useEffect(() => {
    console.log('Conversations state updated:', conversations);
  }, [conversations]);

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
      // Use smooth scroll for better UX
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }
  };

  const loadConversations = async () => {
    try {
      const response = await api.get('/user/conversations', {
        params: { page: 1, page_size: 50, conversation_type: 'chat' }
      });
      console.log('Load conversations response:', response.data);
      // Backend returns {code: 0, message, data}, not {success: true}
      if (response.data.code === 0 && response.data.data) {
        const convs = response.data.data.conversations || [];
        console.log('Setting chat conversations:', convs);
        setConversations(convs);
      }
    } catch (error) {
      console.error('Failed to load chat conversations:', error);
    }
  };

  const loadConversation = async (conversationId) => {
    try {
      setLoading(true);
      console.log('Loading conversation:', conversationId);
      const response = await api.get(`/user/conversations/${conversationId}/history`);
      console.log('Conversation history response:', response.data);

      if (response.data.code === 0) {
        setCurrentConversation({ id: conversationId });
        const loadedMessages = response.data.data || [];
        console.log('Loaded messages:', loadedMessages);
        console.log('Message count:', loadedMessages.length);
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
        body: JSON.stringify({ content }),
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
    }
  };

  const sendMessage = async (content) => {
    if (!content.trim()) return;

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

      // Send parent_message_id to backend for context building
      const response = await fetch(`/api/v1/user/conversations/${currentConversation.id}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        body: JSON.stringify({
          content,
          parent_message_id: parentMessageId  // Critical: enables context chain
        }),
        signal: abortControllerRef.current.signal
      });

      await handleStreamResponse(response);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to send message:', error);
      }
    } finally {
      console.log('[DEBUG] Finally block: Clearing streaming state');
      setIsStreaming(false);
      setStreamingContent('');
      setIsWaitingForResponse(false); // Hide loading dots
    }
  };

  // Ensure loading dots show for minimum duration
  const hideLoadingDots = async () => {
    const minDisplayTime = 600; // Minimum 600ms display
    if (loadingStartTimeRef.current) {
      const elapsed = Date.now() - loadingStartTimeRef.current;
      if (elapsed < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
      }
    }
    setIsWaitingForResponse(false);
    loadingStartTimeRef.current = null;
  };

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
          console.log('[DEBUG] Stream reading completed, done=true');
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
                // Hide loading dots when stream starts (with minimum display time)
                hideLoadingDots();
              } else if (data.type === 'content_delta') {
                fullContent += data.content;
                // Schedule batched update instead of immediate setState
                scheduleUpdate();
              } else if (data.type === 'message_end') {
                console.log('[DEBUG] Received message_end event:', {
                  assistantMessageId,
                  contentLength: fullContent.length,
                  parentMessageId
                });

                const assistantMessage = {
                  message_id: assistantMessageId,
                  role: 'assistant',
                  content: fullContent,
                  parent_message_id: parentMessageId,  // Track parent for context chain
                  created_at: new Date().toISOString(),
                  token_count: data.metadata?.token_count,
                  finish_reason: data.metadata?.finish_reason
                };

                console.log('[DEBUG] Adding assistant message to state:', assistantMessage);
                setMessages(prev => {
                  const newMessages = [...prev, assistantMessage];
                  console.log('[DEBUG] Messages array after adding:', newMessages.length);
                  return newMessages;
                });

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
              console.warn('[DEBUG] Failed to parse JSON line:', line, e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[DEBUG] Stream error:', error);
        throw error;
      } else {
        console.log('[DEBUG] Stream aborted by user');
      }
    } finally {
      console.log('[DEBUG] handleStreamResponse finally block, messageEndReceived:', messageEndReceived);
      // If stream ended but we never received message_end, add whatever content we have
      if (fullContent && !messageEndReceived && assistantMessageId) {
        console.warn('[DEBUG] Stream ended without message_end event, adding partial content');
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
    }

    // Wait a tick to ensure state updates are processed
    if (messageEndReceived) {
      console.log('[DEBUG] Waiting for state to settle before clearing streaming state');
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
      console.log('[DEBUG] Edit completed, clearing streaming state');
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
    console.log('renameConversation called:', { conversationId, newTitle });
    try {
      const response = await api.put(`/user/conversations/${conversationId}/title`, { title: newTitle });
      console.log('Rename API response:', response.data);
      // 更新本地conversations列表
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId ? { ...conv, title: newTitle } : conv
        )
      );
      console.log('Local conversations updated');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Working late';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="chat-page-wrapper">
      {/* AppSidebar with conversation history */}
      {isAuthenticated && (
        <AppSidebar
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showHistory={true}
          historyType="conversation"
          historyItems={conversations}
          currentItemId={currentConversation?.id}
          onSelectItem={loadConversation}
          onDeleteItem={deleteConversation}
          onRenameItem={renameConversation}
          onNewItem={handleNewConversation}
          historyLoading={loading}
        />
      )}

      {/* Main Chat Area - Completely Rewritten */}
      <div className={`main-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
        <div className="search-content">

          {/* Loading State */}
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : messages.length === 0 && !currentConversation ? (
            /* New Conversation - Centered Layout */
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Message..."
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
          ) : (
            /* Existing Conversation - Messages + Fixed Bottom Input */
            <div className="chat-view">
              <div className="messages-scrollable">
                <div className="messages-inner">
                  {messages.map((msg, index) => (
                    <article
                      key={msg.message_id || index}
                      className="message-group"
                      data-role={msg.role}
                      onMouseEnter={() => setHoveredMessage(msg.message_id)}
                      onMouseLeave={() => setHoveredMessage(null)}
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
                              <>
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
                              </>
                            )
                          ) : (
                            // Assistant message - Full width with avatar
                            <>
                              <div className="message-avatar">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="12" r="10"/>
                                  <path d="M9 10h.01M15 10h.01M8 13.5c.5 1 1.5 2 4 2s3.5-1 4-2" fill="none" stroke="#212121" strokeWidth="1.5"/>
                                </svg>
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

                  {/* Loading dots - shown while waiting for response */}
                  {isWaitingForResponse && (
                    <article className="message-group" data-role="assistant">
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          <div className="message-avatar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M9 10h.01M15 10h.01M8 13.5c.5 1 1.5 2 4 2s3.5-1 4-2" fill="none" stroke="#212121" strokeWidth="1.5"/>
                            </svg>
                          </div>
                          <div className="message-body">
                            <div className="loading-dots">
                              <div className="loading-dot"></div>
                              <div className="loading-dot"></div>
                              <div className="loading-dot"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )}

                  {isStreaming && streamingContent && (
                    <article className="message-group" data-role="assistant">
                      <div className="message-wrapper">
                        <div className="message-content-container">
                          <div className="message-avatar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M9 10h.01M15 10h.01M8 13.5c.5 1 1.5 2 4 2s3.5-1 4-2" fill="none" stroke="#212121" strokeWidth="1.5"/>
                            </svg>
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
                              <span className="streaming-cursor">⬤</span>
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Message..."
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
    </div>
  );
}

export default ChatPage;

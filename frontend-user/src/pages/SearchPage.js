import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../utils/AuthContext';
import ConversationSidebar from '../components/ConversationSidebar';
import PaperList from '../components/PaperList';
import ReactMarkdown from 'react-markdown';
import { conversationAPI } from '../services/api';
import './SearchPage.css';

const SearchPage = () => {
  const { user } = useAuth();
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewConversation = () => {
    // Close any active event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setCurrentConversationId(null);
    setMessages([]);
    setPapers([]);
    setSearchQuery('');
    setStreamingContent('');
    setIsStreaming(false);
  };

  const handleSelectConversation = async (conversationId) => {
    setLoading(true);
    try {
      const response = await conversationAPI.getConversation(conversationId);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        setCurrentConversationId(conv.id);
        setMessages(conv.messages || []);

        // Load papers from the last user message that has search results
        const lastMessageWithResults = [...(conv.messages || [])].reverse().find(
          m => m.role === 'user' && m.search_results && m.search_results.length > 0
        );
        if (lastMessageWithResults) {
          setPapers(lastMessageWithResults.search_results);
        } else {
          setPapers([]);
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      alert('加载对话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    const userMessage = searchQuery.trim();
    setSearchQuery('');

    try {
      let conversationId = currentConversationId;

      // Create new conversation if needed
      if (!conversationId) {
        const createResponse = await conversationAPI.createConversation(
          userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage
        );
        if (createResponse.data.code === 0 && createResponse.data.data) {
          conversationId = createResponse.data.data.id;
          setCurrentConversationId(conversationId);
        } else {
          throw new Error('Failed to create conversation');
        }
      }

      // Add message with paper search
      const response = await conversationAPI.addMessage(
        conversationId,
        userMessage,
        userMessage, // use the same content as search query
        true // search papers
      );

      if (response.data.code === 0 && response.data.data) {
        const newMessage = response.data.data;
        setMessages(prev => [...prev, newMessage]);

        // Update papers if search results exist
        if (newMessage.search_results && newMessage.search_results.length > 0) {
          setPapers(newMessage.search_results);

          // Auto-trigger AI analysis streaming
          startAIAnalysis(conversationId, newMessage.id);
        }
      } else {
        throw new Error(response.data.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const startAIAnalysis = (convId, messageId) => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('user_token');
    if (!token) {
      console.error('No auth token found');
      return;
    }

    setIsStreaming(true);
    setStreamingContent('');

    const url = `/api/v1/user/conversations/${convId}/messages/${messageId}/analysis`;
    const eventSource = new EventSource(`${url}?token=${token}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('AI analysis stream started');
    };

    eventSource.onmessage = (event) => {
      if (event.data.startsWith('[DONE]')) {
        console.log('AI analysis completed');
        eventSource.close();
        setIsStreaming(false);

        // Reload conversation to get the saved assistant message
        if (convId) {
          reloadConversation(convId);
        }
        return;
      }

      if (event.data.startsWith('[ERROR]')) {
        console.error('AI analysis error:', event.data);
        eventSource.close();
        setIsStreaming(false);
        setStreamingContent('');
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0] && data.choices[0].delta) {
          const delta = data.choices[0].delta;
          if (delta.content) {
            setStreamingContent(prev => prev + delta.content);
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
      setIsStreaming(false);
    };
  };

  const reloadConversation = async (convId) => {
    try {
      const response = await conversationAPI.getConversation(convId);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        setMessages(conv.messages || []);
        setStreamingContent(''); // Clear streaming content after reload
      }
    } catch (error) {
      console.error('Failed to reload conversation:', error);
    }
  };

  return (
    <div className="search-page">
      <ConversationSidebar
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="main-content">
        <div className="chat-header">
          <h1>Scholay 学术搜索</h1>
          {user && (
            <div className="user-info">
              <span className="user-name">{user.username || user.email}</span>
            </div>
          )}
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>
              <h2>开始学术搜索</h2>
              <p>输入关键词或研究主题，AI 将为您搜索相关学术论文</p>
              <div className="example-queries">
                <p className="example-label">示例搜索：</p>
                <button onClick={() => setSearchQuery('machine learning')} className="example-query">
                  Machine Learning
                </button>
                <button onClick={() => setSearchQuery('natural language processing')} className="example-query">
                  Natural Language Processing
                </button>
                <button onClick={() => setSearchQuery('computer vision')} className="example-query">
                  Computer Vision
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div key={message.id || index} className={`message message-${message.role}`}>
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                      </svg>
                    )}
                  </div>
                  <div className="message-content">
                    {message.role === 'user' ? (
                      <>
                        <div className="message-text">{message.content}</div>
                        {message.search_query && (
                          <div className="search-info">
                            搜索：{message.search_query}
                            {message.search_results && (
                              <span className="result-count"> - 找到 {message.search_results.length} 篇论文</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="message-markdown">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming AI response */}
              {isStreaming && streamingContent && (
                <div className="message message-assistant">
                  <div className="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                  </div>
                  <div className="message-content">
                    <div className="message-markdown">
                      <ReactMarkdown>{streamingContent}</ReactMarkdown>
                      <span className="typing-cursor">▊</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="chat-input-container">
          <form onSubmit={handleSearch} className="chat-input-form">
            <input
              type="text"
              className="chat-input"
              placeholder="输入搜索内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn-send" disabled={loading || !searchQuery.trim()}>
              {loading ? (
                <div className="spinner-small"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                </svg>
              )}
            </button>
          </form>
          <p className="input-hint">按 Enter 发送搜索</p>
        </div>
      </div>

      <PaperList papers={papers} loading={loading && papers.length === 0} />
    </div>
  );
};

export default SearchPage;

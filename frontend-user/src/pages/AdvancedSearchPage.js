import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import AppSidebar from '../components/AppSidebar';
import PaperList from '../components/PaperList';
import PaperCitationMarkdown from '../components/PaperCitationMarkdown';
import Logo from '../components/Logo';
import { conversationAPI } from '../services/api';
import './AdvancedSearchPage.css';

const AdvancedSearchPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, logout, loading: authLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  // Conversation state
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [paperSets, setPaperSets] = useState([]); // 多个论文集合，用于 Tab 切换
  const [activeTab, setActiveTab] = useState(0); // 当前激活的 tab
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasAdvancedSearch, setHasAdvancedSearch] = useState(false); // 标记是否进行过高级搜索
  const [showAIThinking, setShowAIThinking] = useState(false); // AI 思考中状态
  const [paperListWidth, setPaperListWidth] = useState(() => {
    // 从 localStorage 读取用户偏好，默认 420px
    const saved = localStorage.getItem('paperListWidth');
    return saved ? parseInt(saved) : 420;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true); // 是否自动滚动
  const [highlightedPaperIndex, setHighlightedPaperIndex] = useState(null); // 高亮的论文索引
  const [scrollToPaperIndex, setScrollToPaperIndex] = useState(null); // 需要滚动到的论文索引
  const [suggestedQuestions, setSuggestedQuestions] = useState([]); // AI 推荐的后续问题
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const eventSourceRef = useRef(null);
  const textareaRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);
  const streamingContentRef = useRef('');
  const userScrolledRef = useRef(false); // 标记用户是否手动滚动过
  const isLoadingHistoryRef = useRef(false); // 标记是否正在加载历史对话

  // 如果用户未登录，跳转到首页（但要等认证状态加载完成）
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // 加载对话历史
  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);

  // 当创建新对话时刷新对话列表
  useEffect(() => {
    if (currentConversationId && isAuthenticated) {
      loadConversations();
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const response = await conversationAPI.getConversations(1, 50);
      if (response.data.code === 0 && response.data.data) {
        setConversations(response.data.data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  const handleToggleSidebar = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    localStorage.setItem('sidebarCollapsed', newCollapsed.toString());
  };

  // 从URL参数读取对话ID或初始查询（仅执行一次）
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    const query = searchParams.get('query');

    if (urlConversationId && isAuthenticated && !currentConversationId && conversations.length > 0) {
      // 恢复对话 - 确保对话列表已加载
      const conversation = conversations.find(c => c.id === parseInt(urlConversationId));
      if (conversation) {
        handleSelectConversation(urlConversationId);
      }
    } else if (query && isAuthenticated && messages.length === 0 && !urlConversationId) {
      // 立即清除URL参数
      setSearchParams({});
      // 执行搜索
      setSearchQuery(query);
      setTimeout(() => {
        handleInitialSearch(query);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAuthenticated, conversations]);

  // 当对话ID变化时，更新URL参数
  useEffect(() => {
    if (currentConversationId) {
      const currentUrl = new URLSearchParams(window.location.search);
      const urlConvId = currentUrl.get('conversation');
      if (urlConvId !== String(currentConversationId)) {
        setSearchParams({ conversation: String(currentConversationId) });
      }
    } else {
      const currentUrl = new URLSearchParams(window.location.search);
      if (currentUrl.get('conversation')) {
        setSearchParams({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);

  // 解析 AI 回复中的推荐问题
  const extractSuggestedQuestions = (content) => {
    const regex = /\[FOLLOW_UP_QUESTIONS\]([\s\S]*?)\[\/FOLLOW_UP_QUESTIONS\]/;
    const match = content.match(regex);

    if (match && match[1]) {
      // 提取问题列表
      const questionsText = match[1].trim();
      const questions = questionsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+\.\s+/)) // 匹配 "1. " 格式
        .map(line => line.replace(/^\d+\.\s+/, '')); // 移除序号

      return questions;
    }

    return [];
  };

  // 从内容中移除推荐问题标签（用于保存到数据库）
  const removeQuestionTags = (content) => {
    return content.replace(/\[FOLLOW_UP_QUESTIONS\][\s\S]*?\[\/FOLLOW_UP_QUESTIONS\]/g, '').trim();
  };

  // 渲染推荐问题组件
  const renderSuggestedQuestions = (questions) => {
    if (!questions || questions.length === 0) return null;

    return (
      <div className="suggested-questions-inline">
        <div className="suggested-questions-list">
          {questions.map((question, index) => (
            <button
              key={index}
              className="suggested-question-btn"
              onClick={() => {
                setSearchQuery(question);
                // 不清空问题，让它们保留在消息中
              }}
            >
              {question}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToTop = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 检查是否滚动到底部
  const isAtBottom = () => {
    if (!chatMessagesRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    // 允许 50px 的误差范围
    return scrollHeight - scrollTop - clientHeight < 50;
  };

  // 处理滚动事件
  const handleScroll = () => {
    if (!chatMessagesRef.current) return;

    const atBottom = isAtBottom();

    // 如果用户滚动到底部，重新启用自动滚动
    if (atBottom) {
      setAutoScroll(true);
      userScrolledRef.current = false;
    } else if (isStreaming || messages.length > 0) {
      // 如果用户在流式传输或有消息时向上滚动，禁用自动滚动
      setAutoScroll(false);
      userScrolledRef.current = true;
    }
  };

  // 监听滚动事件
  useEffect(() => {
    const chatMessages = chatMessagesRef.current;
    if (chatMessages) {
      chatMessages.addEventListener('scroll', handleScroll);
      return () => {
        chatMessages.removeEventListener('scroll', handleScroll);
      };
    }
  }, [isStreaming, messages.length]);

  // 自动滚动逻辑
  useEffect(() => {
    // 如果正在加载历史对话，滚动到顶部
    if (isLoadingHistoryRef.current) {
      scrollToTop();
      isLoadingHistoryRef.current = false;
      return;
    }

    // 只在以下情况自动滚动到底部：
    // 1. autoScroll 为 true
    // 2. 消息数量增加或正在流式传输
    if (autoScroll && (messages.length > prevMessagesLengthRef.current || isStreaming)) {
      scrollToBottom();
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isStreaming, autoScroll]);

  // 当流式内容更新时也自动滚动（如果启用了自动滚动）
  useEffect(() => {
    if (autoScroll && isStreaming && streamingContent) {
      scrollToBottom();
    }
  }, [streamingContent, autoScroll, isStreaming]);

  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleLogout = () => {
    logout();
    setCurrentConversationId(null);
    setMessages([]);
    setPapers([]);
    navigate('/');
  };

  const handleNewConversation = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setCurrentConversationId(null);
    setMessages([]);
    setPapers([]);
    setPapersTotal(0);
    setPaperSets([]); // 清空论文集合
    setSearchQuery('');
    setStreamingContent('');
    setIsStreaming(false);
    setHasAdvancedSearch(false); // 重置高级搜索标志
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await conversationAPI.deleteConversation(conversationId);
      setConversations(conversations.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        handleNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('删除失败');
    }
  };

  const handleSelectConversation = async (conversationId) => {
    setLoading(true);
    setStreamingContent(''); // 切换对话时清空流式内容
    setPaperSets([]); // 清空论文集合
    setHasAdvancedSearch(false); // 重置高级搜索标志
    isLoadingHistoryRef.current = true; // 标记正在加载历史对话

    try {
      const response = await conversationAPI.getConversation(conversationId);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        setCurrentConversationId(conv.id);
        setMessages(conv.messages || []);

        // 查找所有有论文结果的消息，构建 paperSets
        const messagesWithPapers = conv.messages.filter(
          m => m.role === 'user' && m.search_results && m.search_results.length > 0
        );

        if (messagesWithPapers.length > 0) {
          // 倒序排列，最新的在前
          const sets = messagesWithPapers.reverse().map((msg, index) => ({
            title: index === 0 ? '最新搜索' : `搜索 ${messagesWithPapers.length - index}`,
            papers: msg.search_results,
            total: msg.search_results_total || msg.search_results.length,
            query: msg.search_query
          }));
          setPaperSets(sets);
          setPapers(sets[0].papers);
          setPapersTotal(sets[0].total);

          // 检查是否有 assistant 消息，判断是否进行过高级搜索
          const hasAssistantMessages = conv.messages.some(m => m.role === 'assistant');
          setHasAdvancedSearch(hasAssistantMessages);
        } else {
          setPapers([]);
          setPapersTotal(0);
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      alert('加载对话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleInitialSearch = async (query) => {
    if (!query.trim()) return;

    const userMessage = query.trim();
    const isFirstMessage = messages.length === 0;

    setSearchQuery('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Immediately show user message with loading state
    const tempUserMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      search_query: userMessage,
      search_results: null,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempUserMessage]);
    setLoading(true);
    setShowAIThinking(true); // 显示 AI 思考状态

    // 清空之前的流式内容状态，避免重复显示
    setStreamingContent('');
    streamingContentRef.current = '';
    setIsStreaming(false);

    // 每次搜索都清空旧的论文列表，确保显示 skeleton loading
    setPapers([]);
    setPapersTotal(0);

    try {
      let conversationId = currentConversationId;

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

      // 如果是继续对话模式，不需要预先创建消息，让后端自己创建
      if (hasAdvancedSearch) {
        startContinueConversation(conversationId, userMessage);
      } else {
        // 高级搜索第一次
        const response = await conversationAPI.addMessage(
          conversationId,
          userMessage,
          userMessage,
          false // Advanced mode doesn't use direct search
        );

        if (response.data.code === 0 && response.data.data) {
          const newMessage = response.data.data;
          // Replace temp message with real message
          setMessages(prev => prev.map(msg =>
            msg.id === tempUserMessage.id ? newMessage : msg
          ));

          // First time advanced search
          startAdvancedSearch(conversationId, newMessage.id, userMessage);
        } else {
          throw new Error(response.data.message || 'Failed to send message');
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
      // Only stop loading on error, let streaming handlers manage loading state
      setLoading(false);
      setShowAIThinking(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    await handleInitialSearch(searchQuery);
  };

  const startAdvancedSearch = (convId, messageId, query) => {
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
    streamingContentRef.current = '';
    setShowAIThinking(true);

    // 添加新的论文集合占位符
    setPaperSets(prevSets => [
      {
        title: '最新搜索',
        papers: [],
        total: 0,
        query: query,
        isLoading: true // 标记正在加载
      },
      ...prevSets
    ]);

    const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5411/api/v1'}/user/conversations/${convId}/messages/${messageId}/advanced-search`;
    const eventSource = new EventSource(`${url}?token=${token}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('Advanced search stream started');
    };

    eventSource.onmessage = (event) => {
      if (event.data.startsWith('[DONE]')) {
        console.log('Advanced search completed');
        eventSource.close();

        // 先清空流式内容和停止状态，避免重复显示
        const finalContent = streamingContentRef.current;

        // 解析推荐问题
        const questions = extractSuggestedQuestions(finalContent);

        // 移除推荐问题标签后的内容（用于显示）
        const cleanContent = removeQuestionTags(finalContent);

        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);

        // 然后将清理后的流式内容添加到消息列表，并附带推荐问题
        if (cleanContent) {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            // 如果最后一条消息不是 assistant 或内容为空，添加新的 assistant 消息
            if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
              return [...prev, {
                id: 'assistant-' + Date.now(),
                role: 'assistant',
                content: cleanContent,
                suggestedQuestions: questions.length > 0 ? questions : undefined,
                created_at: new Date().toISOString()
              }];
            }
            return prev;
          });
        }

        // 最后关闭其他loading状态
        setLoading(false);
        setShowAIThinking(false);
        return;
      }

      if (event.data.startsWith('[ERROR]')) {
        console.error('Advanced search error:', event.data);
        eventSource.close();
        setIsStreaming(false);
        setLoading(false);
        setShowAIThinking(false);
        // 不清空 streamingContent，保留错误信息
        return;
      }

      if (event.data.startsWith('[PAPERS]')) {
        // Handle papers data
        try {
          const papersData = JSON.parse(event.data.substring(8));
          const newPapers = papersData.papers || [];
          const newTotal = papersData.total || 0;

          setPapers(newPapers);
          setPapersTotal(newTotal);

          // 更新第一个占位符（索引0）为真实的论文数据
          setPaperSets(prevSets => {
            const newSets = [...prevSets];
            if (newSets.length > 0 && newSets[0].isLoading) {
              // 更新第一个占位符
              newSets[0] = {
                title: '最新搜索',
                papers: newPapers,
                total: newTotal,
                query: query,
                isLoading: false
              };
            } else {
              // 如果没有占位符，添加新的
              newSets.unshift({
                title: '最新搜索',
                papers: newPapers,
                total: newTotal,
                query: query,
                isLoading: false
              });
            }
            return newSets;
          });

          setHasAdvancedSearch(true); // 标记已进行高级搜索
          // 收到论文数据后立即停止 loading，让 PaperList 显示论文
          setLoading(false);
        } catch (err) {
          console.error('Failed to parse papers data:', err);
        }
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0] && data.choices[0].delta) {
          const delta = data.choices[0].delta;
          if (delta.content) {
            // 收到第一个内容片段时，关闭 AI 思考动画
            if (streamingContentRef.current === '') {
              setShowAIThinking(false);
            }
            // loading 已经在收到论文数据时关闭了，不需要再次设置
            streamingContentRef.current += delta.content;
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
      setShowAIThinking(false);
    };
  };

  // 继续对话 - 用于高级搜索后的追问
  const startContinueConversation = async (conversationId, query) => {
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
    streamingContentRef.current = '';
    setLoading(true);

    // 添加新的论文集合占位符，用于新的搜索
    setPaperSets(prevSets => [
      {
        title: '追问搜索',
        papers: [],
        total: 0,
        query: query,
        isLoading: true // 标记正在加载
      },
      ...prevSets
    ]);

    try {
      // 调用继续对话 API
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5411/api/v1'}/user/conversations/${conversationId}/continue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to continue conversation');
      }

      // 创建 EventSource 来接收流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const readStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);

              if (data.startsWith('[DONE]')) {
                // 先清空流式内容和停止状态，避免重复显示
                const finalContent = streamingContentRef.current;

                // 解析推荐问题
                const questions = extractSuggestedQuestions(finalContent);

                // 移除推荐问题标签后的内容
                const cleanContent = removeQuestionTags(finalContent);

                setStreamingContent('');
                streamingContentRef.current = '';
                setIsStreaming(false);

                // 然后将清理后的流式内容添加到消息列表，并附带推荐问题
                if (cleanContent) {
                  setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
                      return [...prev, {
                        id: 'assistant-' + Date.now(),
                        role: 'assistant',
                        content: cleanContent,
                        suggestedQuestions: questions.length > 0 ? questions : undefined,
                        created_at: new Date().toISOString()
                      }];
                    }
                    return prev;
                  });
                }

                setLoading(false);
                return;
              }

              if (data.startsWith('[ERROR]')) {
                console.error('Continue conversation error:', data);
                setIsStreaming(false);
                setLoading(false);
                alert('对话失败: ' + data.substring(8));
                return;
              }

              if (data.startsWith('[PAPERS]')) {
                try {
                  const papersData = JSON.parse(data.substring(8));
                  const newPapers = papersData.papers || [];
                  const newTotal = papersData.total || 0;

                  setPapers(newPapers);
                  setPapersTotal(newTotal);
                  setLoading(false);

                  // 更新第一个占位符（索引0）为真实的论文数据
                  setPaperSets(prevSets => {
                    const newSets = [...prevSets];
                    if (newSets.length > 0 && newSets[0].isLoading) {
                      // 更新第一个占位符
                      newSets[0] = {
                        title: '追问搜索',
                        papers: newPapers,
                        total: newTotal,
                        query: query,
                        isLoading: false
                      };
                    } else {
                      // 如果没有占位符，添加新的
                      newSets.unshift({
                        title: '追问搜索',
                        papers: newPapers,
                        total: newTotal,
                        query: query,
                        isLoading: false
                      });
                    }
                    return newSets;
                  });
                } catch (err) {
                  console.error('Failed to parse papers data:', err);
                }
                continue;
              }

              // 解析流式内容
              try {
                const jsonData = JSON.parse(data);
                if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
                  const delta = jsonData.choices[0].delta;
                  if (delta.content) {
                    // 收到第一个内容片段时，关闭 AI 思考动画
                    if (streamingContentRef.current === '') {
                      setShowAIThinking(false);
                    }
                    streamingContentRef.current += delta.content;
                    setStreamingContent(prev => prev + delta.content);
                  }
                }
              } catch (err) {
                // 可能不是 JSON，忽略
              }
            }
          }
        }
      };

      readStream();
    } catch (error) {
      console.error('Continue conversation failed:', error);
      setIsStreaming(false);
      setLoading(false);
      alert('继续对话失败: ' + error.message);
    }
  };

  // 处理点击论文信息，切换到对应的 tab
  const handlePaperInfoClick = (searchQuery) => {
    if (!paperSets || paperSets.length === 0) return;

    // 查找匹配的 tab
    const tabIndex = paperSets.findIndex(set => set.query === searchQuery);
    if (tabIndex !== -1) {
      setActiveTab(tabIndex);
    }
  };

  // 处理分割线拖动
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = paperListWidth;
    const windowWidth = window.innerWidth;

    // 计算最小和最大宽度
    const MIN_WIDTH = 320; // 最小 320px
    const MAX_WIDTH = Math.floor(windowWidth * 0.5); // 最大屏幕宽度的 50%

    let currentWidth = startWidth; // 记录当前宽度

    const handleMouseMove = (e) => {
      const diff = startX - e.clientX; // 向左拖动为正值
      const newWidth = Math.min(Math.max(startWidth + diff, MIN_WIDTH), MAX_WIDTH);
      currentWidth = newWidth; // 更新当前宽度
      setPaperListWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // 保存最新的宽度到 localStorage
      localStorage.setItem('paperListWidth', currentWidth.toString());
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Main advanced search interface
  return (
    <div className="advanced-search-page">
      <AppSidebar
        user={user}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        showHistory={true}
        historyType="conversation"
        historyItems={conversations}
        currentItemId={currentConversationId}
        onSelectItem={handleSelectConversation}
        onDeleteItem={handleDeleteConversation}
        onNewItem={handleNewConversation}
        historyLoading={conversationsLoading}
      />

      <div className={`advanced-search-content ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        {messages.length === 0 ? (
          /* 空状态：参考普通搜索的布局 */
          <div className="empty-search-layout">
            <nav className="empty-navbar">
              <h1 className="empty-page-title">高级搜索</h1>
            </nav>

            <div className="empty-search-content">
              <form onSubmit={handleSearch} className="empty-composer-wrapper">
                {/* 输入区域 */}
                <div className="composer-input-area">
                  <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder="用自然语言描述研究需求，AI 智能解析并搜索..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading && searchQuery.trim()) {
                          handleSearch(e);
                        }
                      }
                    }}
                    disabled={loading}
                    rows={1}
                  />
                  <button type="submit" className="btn-send" disabled={loading || !searchQuery.trim()}>
                    {loading ? (
                      <div className="spinner-small"></div>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    )}
                  </button>
                </div>

                {/* 底部操作栏 */}
                <div className="composer-footer">
                  <div className="composer-footer-left">
                    {/* 搜索模式标识 - 固定显示高级搜索 */}
                    <div className="search-mode-indicator">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                      </svg>
                      <span>高级搜索</span>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* 有消息时：显示结果布局 */
          <div className="results-layout">
            {/* 顶部标题栏 */}
            <nav className="results-navbar">
              <h1 className="page-title">高级搜索</h1>
              <button className="new-conversation-btn" onClick={handleNewConversation} title="新建对话">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span>新建对话</span>
              </button>
            </nav>

            {/* 主内容区 */}
            <div className="results-main">
              {/* 左侧消息区域 */}
              <div className="messages-container">
                <div className="chat-messages" ref={chatMessagesRef}>
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
                          <div className="message-text">{message.content}</div>
                        ) : (
                          <>
                            <div className="message-markdown">
                              <PaperCitationMarkdown
                                content={message.content}
                                onCitationHover={setHighlightedPaperIndex}
                                onCitationLeave={() => setHighlightedPaperIndex(null)}
                                onCitationClick={(index) => {
                                  // 点击时只触发滚动，不影响高亮状态（高亮由 hover 控制）
                                  setScrollToPaperIndex(index);
                                }}
                              />
                            </div>
                            {/* 只在最后一条 assistant 消息显示推荐问题 */}
                            {message.suggestedQuestions && index === messages.length - 1 && renderSuggestedQuestions(message.suggestedQuestions)}
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {showAIThinking && (
                    <div className="message message-assistant ai-thinking">
                      <div className="message-avatar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                        </svg>
                      </div>
                      <div className="message-content">
                        <div className="thinking-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isStreaming && streamingContent && !showAIThinking && (
                    <div className="message message-assistant">
                      <div className="message-avatar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                        </svg>
                      </div>
                      <div className="message-content">
                        <div className="message-markdown">
                          <PaperCitationMarkdown
                            content={streamingContent}
                            onCitationHover={setHighlightedPaperIndex}
                            onCitationLeave={() => setHighlightedPaperIndex(null)}
                            onCitationClick={(index) => {
                              // 点击时只触发滚动，不影响高亮状态（高亮由 hover 控制）
                              setScrollToPaperIndex(index);
                            }}
                          />
                          <span className="typing-cursor">▊</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
                </div>

                {/* 底部输入框 */}
                <div className="bottom-input-container">
                  <form onSubmit={handleSearch} className="bottom-composer-wrapper">
                    {/* 输入区域 */}
                    <div className="composer-input-area">
                      <textarea
                        ref={textareaRef}
                        className="chat-input"
                        placeholder="继续追问或输入新的搜索需求..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!loading && searchQuery.trim()) {
                              handleSearch(e);
                            }
                          }
                        }}
                        disabled={loading}
                        rows={1}
                      />
                      <button type="submit" className="btn-send" disabled={loading || !searchQuery.trim()}>
                        {loading ? (
                          <div className="spinner-small"></div>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* 底部操作栏 */}
                    <div className="composer-footer">
                      <div className="composer-footer-left">
                        {/* 搜索模式标识 - 固定显示高级搜索 */}
                        <div className="search-mode-indicator">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                          </svg>
                          <span>高级搜索</span>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* 右侧论文列表 */}
              {(papers.length > 0 || loading || paperSets.length > 0) && (
                <>
                  {/* 可拖动的分割线 */}
                  <div
                    className={`resize-handle ${isResizing ? 'resizing' : ''}`}
                    onMouseDown={handleMouseDown}
                  >
                    <div className="resize-handle-line" />
                  </div>

                  {/* 论文列表 - 使用动态宽度 */}
                  <div className="papers-list-wrapper" style={{ width: `${paperListWidth}px`, flexShrink: 0 }}>
                    <PaperList
                      papers={papers}
                      loading={loading}
                      total={papersTotal}
                      paperSets={paperSets.length > 0 ? paperSets : null}
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      highlightedPaperIndex={highlightedPaperIndex}
                      scrollToPaperIndex={scrollToPaperIndex}
                      onScrollComplete={() => setScrollToPaperIndex(null)}
                      onPaperClick={() => setHighlightedPaperIndex(null)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedSearchPage;

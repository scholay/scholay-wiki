import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import logger from '../utils/logger';
import PaperList from '../components/PaperList';
import PaperCitationMarkdown from '../components/PaperCitationMarkdown';
import ModelSelector from '../components/ModelSelector';
import { AdvancedSearchIcon } from '../components/SearchIcons';
import api, { conversationAPI, subscriptionAPI } from '../services/api';
import './AdvancedSearchPage.css';

const AdvancedSearchPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { updateSidebarConfig } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;

  // Conversation state
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelLevel, setModelLevel] = useState('low'); // 'low', 'mid', 'high' - 当前对话使用的模型级别，默认普通模型
  const [quota, setQuota] = useState(null); // 用户配额信息
  const [usage, setUsage] = useState(null); // 用户使用情况
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

  // 获取配额和使用情况
  useEffect(() => {
    const fetchQuotaAndUsage = async () => {
      try {
        const response = await subscriptionAPI.getUsage();

        if (response.data.code === 0) {
          const data = response.data.data;
          // 后端返回的数据包含 usage 和 limits
          // 将 limits 映射为 quota 格式
          const quotaData = {
            advancedSearchLowQuota: data.limits?.advanced_search_low?.limit ?? -1,
            advancedSearchMidQuota: data.limits?.advanced_search_mid?.limit ?? -1,
            advancedSearchHighQuota: data.limits?.advanced_search_high?.limit ?? -1,
          };

          // 将 usage 映射为前端格式
          const usageData = {
            advancedSearchLowCount: data.usage?.advanced_search_low ?? 0,
            advancedSearchMidCount: data.usage?.advanced_search_mid ?? 0,
            advancedSearchHighCount: data.usage?.advanced_search_high ?? 0,
          };

          setQuota(quotaData);
          setUsage(usageData);
        }
      } catch (error) {
        console.error('Failed to fetch quota/usage:', error);
      }
    };

    if (isAuthenticated && user) {
      fetchQuotaAndUsage();
    }
  }, [isAuthenticated, user]);

  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const response = await conversationAPI.getConversations(1, 50, 'search');
      if (response.data.code === 0 && response.data.data) {
        setConversations(response.data.data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load search conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  // 获取当前模型的剩余次数
  const getRemainingCount = () => {
    if (!quota || !usage) return null;

    // 映射配额和使用情况字段
    const quotaFieldMap = {
      'low': 'advancedSearchLowQuota',
      'mid': 'advancedSearchMidQuota',
      'high': 'advancedSearchHighQuota'
    };

    const usageFieldMap = {
      'low': 'advancedSearchLowCount',
      'mid': 'advancedSearchMidCount',
      'high': 'advancedSearchHighCount'
    };

    const quotaField = quotaFieldMap[modelLevel];
    const usageField = usageFieldMap[modelLevel];

    const quotaValue = quota[quotaField];
    const usageValue = usage[usageField] || 0;

    // -1 表示无限制
    if (quotaValue === -1) return null; // 无限制时不显示提示

    const remaining = Math.max(0, quotaValue - usageValue);
    return remaining;
  };

  // 从URL参数读取对话ID或初始查询（仅执行一次）
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    const query = searchParams.get('query');
    const urlModelLevel = searchParams.get('modelLevel');

    // 如果URL中有模型级别参数，设置模型级别
    if (urlModelLevel && ['low', 'mid', 'high'].includes(urlModelLevel)) {
      setModelLevel(urlModelLevel);
    }

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

  // 获取延伸问题（通过独立 API）
  const fetchFollowUpQuestions = async (conversationId, messageId, message) => {
    try {
      logger.log(`Fetching follow-up questions for message ${messageId}`);
      const response = await conversationAPI.getFollowUpQuestions(conversationId, messageId);

      if (response.data.code === 0 && response.data.data.questions) {
        const questionsText = response.data.data.questions;
        const questions = extractSuggestedQuestions(questionsText);

        if (questions.length > 0) {
          // 更新消息的延伸问题
          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, suggestedQuestions: questions }
              : msg
          ));

          logger.log(`Loaded ${questions.length} follow-up questions`);

          // 延伸问题加载后，确保滚动到底部显示出来
          setTimeout(() => {
            if (autoScroll) {
              // 滚动到底部，确保延伸问题完全可见
              scrollToBottom(0);
            }
          }, 150);
        }
      }
    } catch (error) {
      // 延伸问题加载失败不影响主流程，只记录日志
      console.error('Failed to load follow-up questions:', error);
      logger.log('Failed to load follow-up questions, but search completed successfully');
    }
  };

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

  // 处理延伸问题点击 - 直接触发新搜索
  const handleFollowUpQuestionClick = async (question) => {
    // 检查是否已登录
    if (!isAuthenticated) {
      alert('请先登录');
      return;
    }

    // 检查是否正在加载
    if (loading || isStreaming) {
      return;
    }

    // 立即滚动到底部并启用自动滚动
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(), 100);

    // 使用现有的 handleInitialSearch 函数触发新搜索
    // 这会自动处理配额检查、创建消息、启动流式搜索等所有逻辑
    await handleInitialSearch(question);
  };

  // 渲染推荐问题组件
  const renderSuggestedQuestions = (questions) => {
    if (!questions || questions.length === 0) return null;

    return (
      <div className="suggested-questions-inline">
        <div className="suggested-questions-header">
          <span className="suggested-questions-title">🔍 相关探索</span>
          <span className="suggested-questions-hint">点击继续深入</span>
        </div>
        <div className="suggested-questions-list">
          {questions.map((question, index) => (
            <button
              key={index}
              className="suggested-question-btn"
              onClick={() => handleFollowUpQuestionClick(question)}
              disabled={loading}
            >
              <span className="question-text">{question}</span>
              <svg className="question-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 8 16 12 12 16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const scrollToBottom = (extraHeight = 0) => {
    const container = chatMessagesRef.current;
    if (container) {
      const targetScroll = container.scrollHeight + extraHeight;
      container.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
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

  // 自动切换论文tab - 根据当前可见的消息
  useEffect(() => {
    if (!chatMessagesRef.current || paperSets.length <= 1) return;

    const handleTabSwitch = () => {
      const container = chatMessagesRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerMiddle = containerRect.top + containerRect.height / 2;

      // 找出所有 assistant 消息
      const assistantMessages = Array.from(container.querySelectorAll('.message-assistant'));

      // 找到最接近视口中心的 assistant 消息
      let closestMessageIndex = -1;
      let closestDistance = Infinity;

      assistantMessages.forEach((msgElement, idx) => {
        const msgRect = msgElement.getBoundingClientRect();
        const msgMiddle = msgRect.top + msgRect.height / 2;
        const distance = Math.abs(msgMiddle - containerMiddle);

        // 检查消息是否在视口内
        const isVisible = msgRect.bottom > containerRect.top && msgRect.top < containerRect.bottom;

        if (isVisible && distance < closestDistance) {
          closestDistance = distance;
          closestMessageIndex = idx;
        }
      });

      // 如果找到了可见的 assistant 消息
      if (closestMessageIndex >= 0 && closestMessageIndex < paperSets.length) {
        // paperSets 是倒序的（最新在索引0），assistantMessages 是正序的（最老在索引0）
        // 需要反转索引：第一条消息（索引0）对应最后一个 paperSet（索引 length-1）
        const tabIndex = paperSets.length - 1 - closestMessageIndex;
        if (activeTab !== tabIndex) {
          setActiveTab(tabIndex);
        }
      }
    };

    // 添加滚动监听
    const container = chatMessagesRef.current;
    container.addEventListener('scroll', handleTabSwitch);

    // 初始调用一次
    handleTabSwitch();

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleTabSwitch);
      }
    };
  }, [paperSets, activeTab, setActiveTab]);

  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 更新侧边栏配置
  useEffect(() => {
    updateSidebarConfig({
      showHistory: true,
      historyType: 'conversation',
      historyItems: conversations,
      currentItemId: currentConversationId,
      onSelectItem: handleSelectConversation,
      onDeleteItem: handleDeleteConversation,
      onRenameItem: handleRenameConversation,
      onNewItem: handleNewConversation,
      historyLoading: conversationsLoading,
    });
  }, [conversations, currentConversationId, conversationsLoading, updateSidebarConfig]);

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

  const handleRenameConversation = async (conversationId, newTitle) => {
    logger.log('handleRenameConversation called:', { conversationId, newTitle });
    try {
      const response = await api.put(`/user/conversations/${conversationId}/title`, { title: newTitle });
      logger.log('Rename API response:', response.data);
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId ? { ...conv, title: newTitle } : conv
        )
      );
      logger.log('Local conversations updated');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const handleSelectConversation = async (conversationId) => {
    setLoading(true);
    setSearchQuery(''); // 清空搜索输入框
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
          // 按时间顺序（最新的在前），不需要 reverse，因为 messages 本身就是按时间顺序的
          const sets = messagesWithPapers.map((msg, index) => ({
            title: index === messagesWithPapers.length - 1 ? '最新搜索' : `搜索 ${index + 1}`,
            papers: msg.search_results,
            total: msg.search_results_total || msg.search_results.length,
            query: msg.search_query
          }));
          // 倒序，让最新的在数组第一个位置
          setPaperSets(sets.reverse());
          setPapers(sets[0].papers);
          setPapersTotal(sets[0].total);

          // 检查是否有 assistant 消息，判断是否进行过高级搜索
          const hasAssistantMessages = conv.messages.some(m => m.role === 'assistant');
          setHasAdvancedSearch(hasAssistantMessages);

          // 对于所有 assistant 消息，如果还没有延伸问题，则异步加载
          const assistantMessages = conv.messages.filter(m => m.role === 'assistant');
          assistantMessages.forEach(assistantMsg => {
            // 如果已有 follow_up_questions 字段，直接解析
            if (assistantMsg.follow_up_questions) {
              const questions = extractSuggestedQuestions(assistantMsg.follow_up_questions);
              if (questions.length > 0) {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMsg.id
                    ? { ...msg, suggestedQuestions: questions }
                    : msg
                ));
              }
            } else {
              // 如果没有，异步获取（不阻塞UI）
              fetchFollowUpQuestions(conv.id, assistantMsg.id, assistantMsg);
            }
          });
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
          userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage,
          'search'
        );
        if (createResponse.data.code === 0 && createResponse.data.data) {
          conversationId = createResponse.data.data.id;
          setCurrentConversationId(conversationId);
          // 刷新对话列表，确保新对话显示在侧边栏
          loadConversations();
        } else {
          throw new Error('Failed to create conversation');
        }
      }

      // 所有搜索都使用 advanced-search API，而不是 continue API
      // 这样确保每次搜索都计入 advanced_search_* 配额
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

        // Always use advanced search for all searches
        startAdvancedSearch(conversationId, newMessage.id, userMessage);
      } else {
        throw new Error(response.data.message || 'Failed to send message');
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

    // 立即滚动到底部并启用自动滚动
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(), 100);

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

    const url = `/api/v1/user/conversations/${convId}/messages/${messageId}/advanced-search`;
    const eventSource = new EventSource(`${url}?token=${token}&model_level=${modelLevel}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      logger.log('Advanced search stream started');
    };

    eventSource.onmessage = (event) => {
      if (event.data.startsWith('[DONE]')) {
        logger.log('Advanced search completed');
        eventSource.close();

        // 先清空流式内容和停止状态，避免重复显示
        const finalContent = streamingContentRef.current;

        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);

        // 将流式内容添加到消息列表（不包含延伸问题，延伸问题将通过独立API获取）
        if (finalContent) {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            // 如果最后一条消息不是 assistant 或内容为空，添加新的 assistant 消息
            if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
              const newMessage = {
                id: messageId, // 使用实际的 messageId
                role: 'assistant',
                content: finalContent,
                suggestedQuestions: [], // 初始化为空，稍后通过 API 加载
                created_at: new Date().toISOString()
              };

              // 流式输出结束后，滚动并预留延伸问题的空间
              setTimeout(() => {
                if (autoScroll) {
                  // 滚动到底部，并额外预留150px空间给延伸问题
                  scrollToBottom(300);
                }
              }, 200);

              // 异步加载延伸问题
              fetchFollowUpQuestions(convId, messageId, newMessage);

              return [...prev, newMessage];
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
        const errorMsg = event.data.substring(7).trim(); // Remove '[ERROR]' prefix
        console.error('Advanced search error:', errorMsg);
        eventSource.close();

        // Clear all loading states
        setIsStreaming(false);
        setLoading(false);
        setShowAIThinking(false);

        // Remove loading placeholder from paper sets
        setPaperSets(prevSets => prevSets.filter(set => !set.isLoading));

        // Display error message to user
        setStreamingContent('');
        streamingContentRef.current = '';

        // Add error message as assistant message
        setMessages(prev => [...prev, {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: `搜索失败：${errorMsg}\n\n请稍后重试或联系管理员。`,
          created_at: new Date().toISOString()
        }]);

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

      if (event.data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
        // Handle follow-up questions (non-streaming, all at once)
        try {
          const followUpQuestions = event.data.substring(21); // Remove '[FOLLOW_UP_QUESTIONS]' prefix
          console.log('Received follow-up questions:', followUpQuestions);

          // Extract questions from the content
          const questions = extractSuggestedQuestions(followUpQuestions);
          if (questions.length > 0) {
            setSuggestedQuestions(questions);
          }
        } catch (err) {
          console.error('Failed to parse follow-up questions:', err);
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
    setShowAIThinking(true); // 显示 AI 思考状态

    // 清空当前论文列表，显示 loading skeleton
    setPapers([]);
    setPapersTotal(0);

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
        `/api/v1/user/conversations/${conversationId}/continue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query,
            model_level: modelLevel  // 传递模型级别
          })
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

                setStreamingContent('');
                streamingContentRef.current = '';
                setIsStreaming(false);

                // 将流式内容添加到消息列表（不包含延伸问题）
                if (finalContent) {
                  setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
                      return [...prev, {
                        id: 'assistant-' + Date.now(),
                        role: 'assistant',
                        content: finalContent,
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
                setShowAIThinking(false); // 关闭 AI 思考状态
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

              if (data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
                // Handle follow-up questions (non-streaming, all at once)
                try {
                  const followUpQuestions = data.substring(21); // Remove '[FOLLOW_UP_QUESTIONS]' prefix
                  console.log('Received follow-up questions for continue conversation:', followUpQuestions);

                  // Extract questions from the content
                  const questions = extractSuggestedQuestions(followUpQuestions);
                  if (questions.length > 0) {
                    setSuggestedQuestions(questions);
                  }
                } catch (err) {
                  console.error('Failed to parse follow-up questions:', err);
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
      setShowAIThinking(false); // 关闭 AI 思考状态
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

  // 处理引文hover - 立即响应，无延迟
  const handleCitationHover = (paperIndex) => {
    // 立即设置高亮
    setHighlightedPaperIndex(paperIndex);
  };

  const handleCitationLeave = () => {
    // 使用 requestAnimationFrame 确保在下一帧检查，避免事件触发顺序问题
    requestAnimationFrame(() => {
      // 检查鼠标是否真的离开了所有引文元素
      const citationElements = document.querySelectorAll('.paper-citation-text');
      let isHoveringAnyCitation = false;

      citationElements.forEach(element => {
        if (element.matches(':hover')) {
          isHoveringAnyCitation = true;
        }
      });

      // 只有当鼠标不在任何引文上时才清除高亮
      if (!isHoveringAnyCitation) {
        setHighlightedPaperIndex(null);
      }
    });
  };

  // 清理全局鼠标移动监听
  useEffect(() => {
    // 全局监听鼠标移动，确保状态正确清理（无延迟）
    const handleGlobalMouseMove = (e) => {
      // 检查鼠标是否在引文元素上
      const target = e.target;
      const isCitation = target.closest('.paper-citation-text');

      // 如果鼠标不在引文上且有高亮状态，立即清除
      if (!isCitation && highlightedPaperIndex !== null) {
        setHighlightedPaperIndex(null);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [highlightedPaperIndex]);

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
      <div className={`advanced-search-content ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        {messages.length === 0 ? (
          /* 空状态：参考普通搜索的布局 */
          <div className="empty-search-layout">
            <nav className="empty-navbar">
              <h1 className="empty-page-title">高级搜索</h1>
            </nav>

            <div className="empty-search-content">
              <form onSubmit={handleSearch} className="advanced-search-composer-wrapper">
                {/* 输入区域 */}
                <div className="advanced-search-composer-input-area">
                  <textarea
                    ref={textareaRef}
                    className="advanced-search-chat-input"
                    placeholder={
                      (() => {
                        const remaining = getRemainingCount();
                        const modelName = modelLevel === 'low' ? '普通' : modelLevel === 'mid' ? '进阶' : '高级';
                        if (remaining !== null) {
                          return `用自然语言描述研究需求，AI 智能解析并搜索... (${modelName}模型剩余 ${remaining} 次)`;
                        }
                        return "用自然语言描述研究需求，AI 智能解析并搜索...";
                      })()
                    }
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
                <div className="advanced-search-composer-footer">
                  <div className="advanced-search-composer-footer-left">
                    {/* 搜索模式标识 - 固定显示高级搜索 */}
                    <div className="search-mode-indicator">
                      <AdvancedSearchIcon size={16} />
                      <span>高级搜索</span>
                    </div>

                    {/* 模型选择器 */}
                    <div className="model-selector-wrapper">
                      <ModelSelector
                        value={modelLevel}
                        onChange={setModelLevel}
                        disabled={loading}
                        userSubscription={user?.subscription}
                      />
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
              <div className="navbar-title-group">
                <h1 className="page-title">高级搜索</h1>
                <button className="new-conversation-btn" onClick={handleNewConversation} title="新建对话">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"/>
                  </svg>
                </button>
              </div>
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
                                onCitationHover={handleCitationHover}
                                onCitationLeave={handleCitationLeave}
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
                            onCitationHover={handleCitationHover}
                            onCitationLeave={handleCitationLeave}
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
                  <form onSubmit={handleSearch} className="advanced-bottom-composer-wrapper">
                    {/* 输入区域 */}
                    <div className="advanced-bottom-composer-input-area">
                      <textarea
                        ref={textareaRef}
                        className="advanced-bottom-chat-input"
                        placeholder={
                          (() => {
                            const remaining = getRemainingCount();
                            const modelName = modelLevel === 'low' ? '普通' : modelLevel === 'mid' ? '进阶' : '高级';
                            if (remaining !== null) {
                              return `继续追问或输入新的搜索需求... (${modelName}模型剩余 ${remaining} 次)`;
                            }
                            return "继续追问或输入新的搜索需求...";
                          })()
                        }
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
                    <div className="advanced-bottom-composer-footer">
                      <div className="advanced-bottom-composer-footer-left">
                        {/* 搜索模式标识 - 固定显示高级搜索 */}
                        <div className="search-mode-indicator">
                          <AdvancedSearchIcon size={16} />
                          <span>高级搜索</span>
                        </div>

                        {/* 模型选择器 - 对话中禁用，显示当前使用的模型 */}
                        <div className="model-selector-wrapper">
                          <ModelSelector
                            value={modelLevel}
                            onChange={() => {}} // 对话中不允许更改
                            disabled={true} // 对话开始后禁用
                            userSubscription={user?.subscription}
                          />
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

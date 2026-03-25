/**
 * AI流式搜索 Hook
 * 处理 SSE 流式搜索和消息管理
 */
import { useCallback } from 'react';
import { conversationApi as conversationAPI } from 'features/ai-chat/api/conversationApi';
import { publicScholarApi as publicScholarAPI } from 'features/search/api/scholarApi';
import { trackSmartSearch, EntryPoint } from '../../../utils/usageTracker';
import logger from '../../../utils/logger';
import { PAPER_PAGE_SIZE } from './usePaperState';

// 论文详情字段（后端期望数组格式）
const PAPER_FIELDS = ['paperId', 'title', 'authors', 'year', 'abstract', 'citationCount', 'venue', 'publicationDate', 'tldr', 'openAccessPdf', 'externalIds', 'isOpenAccess', 'fieldsOfStudy'];

/**
 * 流式搜索 Hook
 */
export const useAIStreamSearch = ({
  currentConversationId,
  modelLevel,
  isAuthenticated,
  eventSourceRef,
  streamingContentRef,
  textareaRef,
  setCurrentConversationId,
  setMessages,
  setLoading,
  setIsStreaming,
  setStreamingContent,
  setShowAIThinking,
  setPapers,
  setPapersTotal,
  setPaperSets,
  setSearchQuery,
  setConversations,
  setShowAuthModal,
  setIsLoadingSuggestedQuestions,
  loadConversations,
  extractSuggestedQuestions,
  // 分页相关
  setAllPaperIds,
  setLoadedPaperCount,
  // 思考步骤相关
  addThinkingStep,
  clearThinkingSteps,
}) => {
  // 获取延伸问题（通过独立 API）
  const fetchFollowUpQuestions = useCallback(async (conversationId, messageId, message, showLoading = true) => {
    try {
      logger.log(`Fetching follow-up questions for message ${messageId}`);
      if (showLoading) {
        setIsLoadingSuggestedQuestions(true);
      }
      const response = await conversationAPI.getFollowUpQuestions(conversationId, messageId);

      if (response.data.code === 0 && response.data.data.questions) {
        const questionsText = response.data.data.questions;
        const questions = extractSuggestedQuestions(questionsText);

        if (questions.length > 0) {
          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, suggestedQuestions: questions }
              : msg
          ));

          logger.log(`Loaded ${questions.length} follow-up questions`);
        }
      }
    } catch (error) {
      logger.error('Failed to load follow-up questions:', error);
    } finally {
      if (showLoading) {
        setIsLoadingSuggestedQuestions(false);
      }
    }
  }, [setIsLoadingSuggestedQuestions, setMessages, extractSuggestedQuestions]);

  // 启动高级搜索
  const startAdvancedSearch = useCallback(async (convId, messageId, query) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('user_token');
    if (!token) {
      logger.error('No auth token found');
      return;
    }

    setIsStreaming(true);
    setStreamingContent('');
    streamingContentRef.current = '';
    setShowAIThinking(true);
    
    // 清空思考步骤
    if (clearThinkingSteps) {
      clearThinkingSteps();
    }

    // 添加新的论文集合占位符
    setPaperSets(prevSets => [
      {
        title: '最新搜索',
        papers: [],
        total: 0,
        query: query,
        isLoading: true
      },
      ...prevSets
    ]);

    const url = `/api/v1/user/conversations/${convId}/messages/${messageId}/advanced-search`;
    const eventSource = new EventSource(`${url}?token=${token}&model_level=${modelLevel}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      logger.log('Advanced search stream started');
    };

    let isFirstMessage = true;

    eventSource.onmessage = (event) => {
      // 检查是否是错误消息（第一条消息）
      if (isFirstMessage) {
        isFirstMessage = false;
        try {
          const data = JSON.parse(event.data);
          if (data.code === 403 || data.message?.includes('配额不足')) {
            eventSource.close();
            setIsStreaming(false);
            setShowAIThinking(false);
            setLoading(false);

            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            setPaperSets(prevSets => prevSets.slice(1));
            return;
          }
        } catch (e) {
          // 如果不是JSON格式，继续正常处理
        }
      }

      if (event.data.startsWith('[DONE]')) {
        logger.log('Advanced search completed, raw data:', event.data);
        eventSource.close();

        const finalContent = streamingContentRef.current;

        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);

        if (finalContent) {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
              const newMessage = {
                id: messageId,
                role: 'assistant',
                content: finalContent,
                suggestedQuestions: [],
                created_at: new Date().toISOString()
              };

              fetchFollowUpQuestions(convId, messageId, newMessage);

              return [...prev, newMessage];
            }
            return prev;
          });
        }

        setLoading(false);
        setShowAIThinking(false);
        loadConversations();
        return;
      }

      // 处理步骤事件
      if (event.data.startsWith('[STEP]')) {
        try {
          const stepData = JSON.parse(event.data.substring(6));
          logger.log('Received step:', stepData);
          if (addThinkingStep && stepData.step && stepData.message) {
            addThinkingStep(stepData.step, stepData.message, stepData.detail || '', stepData.completed || false);
          }
        } catch (err) {
          logger.error('Failed to parse step data:', err);
        }
        return;
      }

      if (event.data.startsWith('[ERROR]')) {
        const errorMsg = event.data.substring(7).trim();
        logger.error('Advanced search error:', errorMsg);
        eventSource.close();

        setIsStreaming(false);
        setLoading(false);
        setShowAIThinking(false);
        setPaperSets(prevSets => prevSets.filter(set => !set.isLoading));
        setStreamingContent('');
        streamingContentRef.current = '';

        setMessages(prev => [...prev, {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: errorMsg,
          created_at: new Date().toISOString()
        }]);

        return;
      }

      if (event.data.startsWith('[PAPERS]')) {
        try {
          const papersData = JSON.parse(event.data.substring(8));
          const paperIds = papersData.paperIds || papersData.papers || [];
          const newTotal = papersData.total || 0;

          const isNewFormat = Array.isArray(paperIds) && paperIds.length > 0 && typeof paperIds[0] === 'string';

          if (isNewFormat) {
            logger.log(`Received ${paperIds.length} paper IDs, fetching first page (${PAPER_PAGE_SIZE})...`);

            // 存储所有论文 ID（用于分页加载）
            if (setAllPaperIds) {
              setAllPaperIds(paperIds);
            }

            // 只获取第一页的论文详情
            const firstPageIds = paperIds.slice(0, PAPER_PAGE_SIZE);
            
            publicScholarAPI.getPaperBatch(firstPageIds, PAPER_FIELDS).then(response => {
              if (response.data.code === 0 && response.data.data) {
                const newPapers = response.data.data || [];
                logger.log(`Fetched first page: ${newPapers.length} papers (total: ${paperIds.length})`);

                setPapers(newPapers);
                setPapersTotal(newTotal);
                
                // 更新已加载数量
                if (setLoadedPaperCount) {
                  setLoadedPaperCount(newPapers.length);
                }

                setPaperSets(prevSets => {
                  const newSets = [...prevSets];
                  if (newSets.length > 0 && newSets[0].isLoading) {
                    newSets[0] = {
                      title: '最新搜索',
                      papers: newPapers,
                      total: newTotal,
                      query: query,
                      isLoading: false,
                      allPaperIds: paperIds // 保存所有 ID 用于分页
                    };
                  } else {
                    newSets.unshift({
                      title: '最新搜索',
                      papers: newPapers,
                      total: newTotal,
                      query: query,
                      isLoading: false,
                      allPaperIds: paperIds
                    });
                  }
                  return newSets;
                });

                setLoading(false);
              }
            }).catch(err => {
              logger.error('Failed to fetch paper details:', err);
              setLoading(false);
            });
          } else {
            // 旧格式：直接是论文对象数组
            const newPapers = paperIds;
            setPapers(newPapers);
            setPapersTotal(newTotal);
            
            if (setAllPaperIds) {
              setAllPaperIds([]);
            }
            if (setLoadedPaperCount) {
              setLoadedPaperCount(newPapers.length);
            }

            setPaperSets(prevSets => {
              const newSets = [...prevSets];
              if (newSets.length > 0 && newSets[0].isLoading) {
                newSets[0] = {
                  title: '最新搜索',
                  papers: newPapers,
                  total: newTotal,
                  query: query,
                  isLoading: false
                };
              } else {
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

            setLoading(false);
          }
        } catch (err) {
          logger.error('Failed to parse papers data:', err);
        }
        return;
      }

      if (event.data.startsWith('[TITLE]')) {
        try {
          const titleData = JSON.parse(event.data.substring(7));
          const newTitle = titleData.title;
          logger.log('Received title update:', newTitle);

          setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, title: newTitle } : c
          ));
        } catch (err) {
          logger.error('Failed to parse title data:', err);
        }
        return;
      }

      if (event.data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
        try {
          const followUpQuestions = event.data.substring(21);
          logger.log('Received follow-up questions:', followUpQuestions);
          extractSuggestedQuestions(followUpQuestions);
        } catch (err) {
          logger.error('Failed to parse follow-up questions:', err);
        }
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0] && data.choices[0].delta) {
          const delta = data.choices[0].delta;
          if (delta.content) {
            if (streamingContentRef.current === '') {
              setShowAIThinking(false);
            }
            streamingContentRef.current += delta.content;
            setStreamingContent(prev => prev + delta.content);
          }
        }
      } catch (err) {
        logger.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      logger.error('SSE error:', err);
      eventSource.close();
      setIsStreaming(false);
      setShowAIThinking(false);
      setLoading(false);

      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setPaperSets(prevSets => prevSets.slice(1));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modelLevel,
    eventSourceRef,
    streamingContentRef,
    setIsStreaming,
    setStreamingContent,
    setShowAIThinking,
    setPaperSets,
    setPapers,
    setPapersTotal,
    setLoading,
    setMessages,
    setConversations,
    loadConversations,
    fetchFollowUpQuestions,
    extractSuggestedQuestions,
  ]);

  // 处理初始搜索
  const handleInitialSearch = useCallback(async (query) => {
    if (!query.trim()) return;

    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    const userMessage = query.trim();

    setSearchQuery('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

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
    setShowAIThinking(true);

    setStreamingContent('');
    streamingContentRef.current = '';
    setIsStreaming(false);

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
        } else {
          throw new Error('Failed to create conversation');
        }
      }

      const response = await conversationAPI.addMessage(
        conversationId,
        userMessage,
        userMessage,
        false
      );

      if (response.data.code === 0 && response.data.data) {
        const newMessage = response.data.data;
        setMessages(prev => prev.map(msg =>
          msg.id === tempUserMessage.id ? newMessage : msg
        ));

        // 记录智能检索使用统计
        trackSmartSearch(userMessage, EntryPoint.HOME_PAGE);

        startAdvancedSearch(conversationId, newMessage.id, userMessage);
      } else {
        throw new Error(response.data.message || 'Failed to send message');
      }
    } catch (error) {
      logger.error('Search failed:', error);
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
      setLoading(false);
      setShowAIThinking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    currentConversationId,
    textareaRef,
    streamingContentRef,
    setShowAuthModal,
    setSearchQuery,
    setMessages,
    setLoading,
    setShowAIThinking,
    setStreamingContent,
    setIsStreaming,
    setPapers,
    setPapersTotal,
    setCurrentConversationId,
    startAdvancedSearch,
  ]);

  // 处理表单提交搜索
  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    const query = textareaRef.current?.value || '';
    if (!query.trim()) return;

    await handleInitialSearch(query);
  }, [textareaRef, handleInitialSearch]);

  // 处理延伸问题点击
  const handleFollowUpQuestionClick = useCallback(async (question) => {
    if (!isAuthenticated) {
      alert('请先登录');
      return;
    }

    await handleInitialSearch(question);
  }, [isAuthenticated, handleInitialSearch]);

  return {
    handleInitialSearch,
    handleSearch,
    handleFollowUpQuestionClick,
    startAdvancedSearch,
    fetchFollowUpQuestions,
  };
};

export default useAIStreamSearch;

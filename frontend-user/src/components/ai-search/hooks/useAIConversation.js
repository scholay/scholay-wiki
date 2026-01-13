/**
 * AI对话管理 Hook
 * 处理对话选择、历史消息加载等
 */
import { useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { conversationAPI, publicScholarAPI } from '../../../services/api';
import {
  getSearchQuery,
  clearSearchQuery,
  getAIModelLevel,
  setAIConversationId
} from '../../../utils/searchStorage';
import logger from '../../../utils/logger';

// 论文详情字段
const PAPER_FIELDS = 'paperId,title,authors,year,abstract,citationCount,venue,publicationDate,tldr,openAccessPdf,externalIds,isOpenAccess,fieldsOfStudy';

/**
 * 对话管理 Hook
 */
export const useAIConversation = ({
  messages,
  conversations,
  currentConversationId,
  isAuthenticated,
  authLoading,
  loading,
  qaSnapContainerRef,
  prevScrollHeightRef,
  isLoadingHistoryRef,
  hasLoadedConversationsRef,
  hasInitializedFromURLRef,
  setCurrentConversationId,
  setMessages,
  setMessagePagination,
  setLoading,
  setModelLevel,
  setStreamingContent,
  setPapers,
  setPapersTotal,
  setPaperSets,
  setSearchQuery,
  setSearchParams,
  organizeMessagesByParentId,
  extractSuggestedQuestions,
  loadConversations,
  handleInitialSearch,
  scrollToBottom,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 处理对话选择
  const handleSelectConversation = useCallback(async (conversationId, page = 1, pageSize = 20) => {
    const isInitialLoad = page === 1;

    if (isInitialLoad) {
      setLoading(true);
      setSearchQuery('');
      setStreamingContent('');
      setPaperSets([]);
      isLoadingHistoryRef.current = true;
    } else {
      if (qaSnapContainerRef.current) {
        prevScrollHeightRef.current = qaSnapContainerRef.current.scrollHeight;
      }
      setMessagePagination(prev => ({ ...prev, isLoadingMore: true }));
    }

    try {
      const response = await conversationAPI.getConversation(conversationId, page, pageSize);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;

        if (isInitialLoad) {
          setCurrentConversationId(conv.id);
        }

        setMessagePagination({
          page: conv.page || page,
          pageSize: conv.page_size || pageSize,
          total: conv.total || 0,
          hasMore: conv.has_more || false,
          isLoadingMore: false,
        });

        const organizedMessages = organizeMessagesByParentId(conv.messages || []);

        if (isInitialLoad) {
          setMessages(organizedMessages);
        } else {
          setMessages(prev => [...organizedMessages, ...prev]);
        }

        // 查找所有有论文结果的消息，构建 paperSets
        const messagesWithPapers = organizedMessages.filter(
          m => m.role === 'user' && (
            (m.search_paper_ids && m.search_paper_ids.length > 0) ||
            (m.search_results && m.search_results.length > 0)
          )
        );

        if (messagesWithPapers.length > 0) {
          const sets = messagesWithPapers.map((msg, index) => {
            const hasNewFormat = msg.search_paper_ids && msg.search_paper_ids.length > 0;
            const hasOldFormat = msg.search_results && msg.search_results.length > 0;

            return {
              title: index === messagesWithPapers.length - 1 ? '最新搜索' : `搜索 ${index + 1}`,
              papers: hasOldFormat ? msg.search_results : [],
              paperIds: hasNewFormat ? msg.search_paper_ids : [],
              total: msg.search_results_total || (hasOldFormat ? msg.search_results.length : msg.search_paper_ids?.length || 0),
              query: msg.search_query,
              isLoaded: hasOldFormat,
              isLoading: false
            };
          });

          const reversedSets = sets.reverse();

          const latestSet = reversedSets[0];
          if (latestSet.isLoaded) {
            setPaperSets(reversedSets);
            setPapers(latestSet.papers);
            setPapersTotal(latestSet.total);
          } else if (latestSet.paperIds && latestSet.paperIds.length > 0) {
            reversedSets[0] = { ...reversedSets[0], isLoading: true };
            setPaperSets(reversedSets);

            logger.log(`History: Loading papers for latest QA (${latestSet.paperIds.length} papers)`);
            try {
              const response = await publicScholarAPI.getPaperBatch(latestSet.paperIds, PAPER_FIELDS);
              if (response.data.code === 0 && response.data.data) {
                const loadedPapers = response.data.data || [];
                setPapers(loadedPapers);
                setPapersTotal(latestSet.total);
                setPaperSets(prev => prev.map((set, idx) =>
                  idx === 0 ? { ...set, papers: loadedPapers, isLoaded: true, isLoading: false } : set
                ));
              }
            } catch (err) {
              logger.error('Failed to fetch paper details for latest QA:', err);
              setPaperSets(prev => prev.map((set, idx) =>
                idx === 0 ? { ...set, isLoading: false } : set
              ));
            }
          } else {
            setPaperSets(reversedSets);
            setPapers([]);
            setPapersTotal(0);
          }

          // 对于历史对话中的 assistant 消息，只加载已有的推荐问题
          const assistantMessages = organizedMessages.filter(m => m.role === 'assistant');
          assistantMessages.forEach((assistantMsg) => {
            if (assistantMsg.follow_up_questions) {
              const questions = extractSuggestedQuestions(assistantMsg.follow_up_questions);
              if (questions.length > 0) {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMsg.id
                    ? { ...msg, suggestedQuestions: questions }
                    : msg
                ));
              }
            }
          });
        } else {
          setPapers([]);
          setPapersTotal(0);
        }
      }
    } catch (error) {
      logger.error('Failed to load conversation:', error);
      if (isInitialLoad) {
        alert('加载对话失败');
      }
    } finally {
      if (isInitialLoad) {
        setLoading(false);
        isLoadingHistoryRef.current = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            logger.log('[DEBUG-SCROLL] 历史对话加载完成，滚动到底部');
            scrollToBottom('auto');
          });
        });
      } else {
        setMessagePagination(prev => ({ ...prev, isLoadingMore: false }));
        setTimeout(() => {
          if (qaSnapContainerRef.current && prevScrollHeightRef.current) {
            const newScrollHeight = qaSnapContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
            qaSnapContainerRef.current.scrollTop = scrollDiff;
            logger.log('[DEBUG-SCROLL] 加载更多完成，调整滚动位置:', scrollDiff);
          }
        }, 100);
      }
    }
  }, [
    qaSnapContainerRef,
    prevScrollHeightRef,
    isLoadingHistoryRef,
    setCurrentConversationId,
    setMessages,
    setMessagePagination,
    setLoading,
    setStreamingContent,
    setPapers,
    setPapersTotal,
    setPaperSets,
    setSearchQuery,
    organizeMessagesByParentId,
    extractSuggestedQuestions,
    scrollToBottom,
  ]);

  // 加载更多历史消息
  const loadMoreMessages = useCallback(async (messagePagination) => {
    if (!currentConversationId || messagePagination.isLoadingMore || !messagePagination.hasMore) {
      return;
    }
    const nextPage = messagePagination.page + 1;
    logger.log('[DEBUG-SCROLL] 加载更多历史消息, page:', nextPage);
    await handleSelectConversation(currentConversationId, nextPage, messagePagination.pageSize);
  }, [currentConversationId, handleSelectConversation]);

  // 加载对话历史（只在首次认证成功时加载）
  useEffect(() => {
    if (isAuthenticated && !hasLoadedConversationsRef.current) {
      hasLoadedConversationsRef.current = true;
      loadConversations();
    }
  }, [isAuthenticated, hasLoadedConversationsRef, loadConversations]);

  // 当创建新对话时刷新对话列表
  useEffect(() => {
    if (currentConversationId && isAuthenticated && hasLoadedConversationsRef.current) {
      const existsInList = conversations.some(c => c.id === currentConversationId);
      if (!existsInList) {
        loadConversations();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);

  // 从 sessionStorage 或 URL 参数读取对话ID或初始查询
  useEffect(() => {
    if (hasInitializedFromURLRef.current) {
      return;
    }

    const urlConversationId = searchParams.get('conversationId');
    const storedQuery = getSearchQuery();
    const storedModelLevel = getAIModelLevel();

    if (storedModelLevel && ['low', 'mid', 'high'].includes(storedModelLevel)) {
      setModelLevel(storedModelLevel);
    }

    if (urlConversationId && isAuthenticated && conversations.length > 0) {
      const conversation = conversations.find(c => c.id === parseInt(urlConversationId));
      if (conversation) {
        if (messages.length === 0 || currentConversationId !== parseInt(urlConversationId)) {
          hasInitializedFromURLRef.current = true;
          handleSelectConversation(urlConversationId);
        }
      } else {
        hasInitializedFromURLRef.current = true;
        logger.log(`Conversation ${urlConversationId} not found, redirecting to home`);
        navigate('/');
      }
    } else if (storedQuery && isAuthenticated && messages.length === 0 && !urlConversationId && !currentConversationId) {
      hasInitializedFromURLRef.current = true;
      setSearchQuery(storedQuery);
      setLoading(true);
      clearSearchQuery();
      setTimeout(() => {
        handleInitialSearch(storedQuery);
      }, 100);
    } else if (!urlConversationId && !storedQuery && isAuthenticated && !authLoading && !loading && !currentConversationId) {
      hasInitializedFromURLRef.current = true;
      logger.log('No conversationId and no stored query, redirecting to home');
      navigate('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversations, authLoading]);

  // 当对话ID变化时，更新 sessionStorage 和 URL 参数
  useEffect(() => {
    if (currentConversationId) {
      setAIConversationId(currentConversationId);
      const currentUrl = new URLSearchParams(window.location.search);
      const urlConvId = currentUrl.get('conversationId');
      if (urlConvId !== String(currentConversationId)) {
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.set('conversationId', String(currentConversationId));
          return newParams;
        });
      }
    } else {
      setAIConversationId(null);
      const currentUrl = new URLSearchParams(window.location.search);
      if (currentUrl.get('conversationId')) {
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('conversationId');
          return newParams;
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);

  return {
    handleSelectConversation,
    loadMoreMessages,
  };
};

export default useAIConversation;

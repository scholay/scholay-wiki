/**
 * AI搜索滚动管理 Hook
 * 处理滚动、自动滚动、问答卡片切换等
 */
import { useCallback, useEffect } from 'react';
import { publicScholarAPI } from '../../../services/api';
import logger from '../../../utils/logger';
import { PAPER_PAGE_SIZE } from './usePaperState';

// 论文详情字段（后端期望数组格式）
const PAPER_FIELDS = ['paperId', 'title', 'authors', 'year', 'abstract', 'citationCount', 'venue', 'publicationDate', 'tldr', 'openAccessPdf', 'externalIds', 'isOpenAccess', 'fieldsOfStudy'];

/**
 * 滚动管理 Hook
 */
export const useAIScrollManager = ({
  messages,
  isStreaming,
  streamingContent,
  autoScroll,
  disableSnapTemporarily,
  isLoadingSuggestedQuestions,
  paperSets,
  expandedQAIndex,
  activeTab,
  manualTabSwitch,
  messagePagination,
  qaSnapContainerRef,
  lastScrollTimeRef,
  prevIsLoadingSuggestedRef,
  prevMessageCountRef,
  setAutoScroll,
  setDisableSnapTemporarily,
  setExpandedQAIndex,
  setActiveTab,
  setManualTabSwitch,
  setPapers,
  setPapersTotal,
  setPaperSets,
  setPaperSwitchingLoading,
  setAllPaperIds,
  setLoadedPaperCount,
  loadMoreMessages,
}) => {
  // 滚动到底部函数
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = qaSnapContainerRef.current;
    if (!container) return;

    logger.log('[DEBUG-SCROLL] scrollToBottom 被调用, behavior:', behavior, 'scrollHeight:', container.scrollHeight);
    lastScrollTimeRef.current = Date.now();
    container.scrollTo({
      top: container.scrollHeight,
      behavior
    });
  }, [qaSnapContainerRef, lastScrollTimeRef]);

  // 处理问答卡片切换
  const handleQAToggle = useCallback(async (qaIndex) => {
    setExpandedQAIndex(qaIndex);

    // paperSets 是倒序的（最新在索引0），qaIndex 是正序的（最老在索引0）
    const paperSetIndex = paperSets.length - 1 - qaIndex;

    if (paperSetIndex >= 0 && paperSetIndex < paperSets.length) {
      setActiveTab(paperSetIndex);
      const paperSet = paperSets[paperSetIndex];

      // 检查是否需要懒加载
      if (!paperSet.isLoaded && paperSet.paperIds && paperSet.paperIds.length > 0 && !paperSet.isLoading) {
        logger.log(`Lazy loading papers for QA ${qaIndex} (${paperSet.paperIds.length} papers)`);
        
        // 显示切换加载状态
        if (setPaperSwitchingLoading) setPaperSwitchingLoading(true);
        
        setPapersTotal(paperSet.total);

        setPaperSets(prev => prev.map((set, idx) =>
          idx === paperSetIndex ? { ...set, isLoading: true } : set
        ));

        // 存储所有论文 ID 用于分页
        if (setAllPaperIds) setAllPaperIds(paperSet.paperIds);

        // 只加载前 PAPER_PAGE_SIZE 篇论文
        const firstPageIds = paperSet.paperIds.slice(0, PAPER_PAGE_SIZE);

        try {
          const response = await publicScholarAPI.getPaperBatch(firstPageIds, PAPER_FIELDS);
          if (response.data.code === 0 && response.data.data) {
            const loadedPapers = response.data.data || [];
            setPapers(loadedPapers);
            setPapersTotal(paperSet.total || paperSet.paperIds.length);
            if (setLoadedPaperCount) setLoadedPaperCount(loadedPapers.length);
            setPaperSets(prev => prev.map((set, idx) =>
              idx === paperSetIndex ? { ...set, papers: loadedPapers, isLoaded: true, isLoading: false } : set
            ));
            logger.log(`Lazy loaded first ${loadedPapers.length} papers for QA ${qaIndex} (total: ${paperSet.paperIds.length})`);
          }
        } catch (err) {
          logger.error(`Failed to lazy load papers for QA ${qaIndex}:`, err);
          setPaperSets(prev => prev.map((set, idx) =>
            idx === paperSetIndex ? { ...set, isLoading: false } : set
          ));
        } finally {
          if (setPaperSwitchingLoading) setPaperSwitchingLoading(false);
        }
      } else if (paperSet?.papers) {
        // 已加载的论文也应用分页逻辑
        if (setPaperSwitchingLoading) setPaperSwitchingLoading(true);
        
        const allPapers = paperSet.papers;
        if (allPapers.length > PAPER_PAGE_SIZE) {
          setPapers(allPapers.slice(0, PAPER_PAGE_SIZE));
          if (setAllPaperIds) setAllPaperIds(allPapers.map(p => p.paperId));
          if (setLoadedPaperCount) setLoadedPaperCount(PAPER_PAGE_SIZE);
        } else {
          setPapers(allPapers);
          if (setAllPaperIds) setAllPaperIds([]);
          if (setLoadedPaperCount) setLoadedPaperCount(allPapers.length);
        }
        setPapersTotal(paperSet.total || allPapers.length);
        
        if (setPaperSwitchingLoading) setPaperSwitchingLoading(false);
      }
    }
    setManualTabSwitch(true);
  }, [
    paperSets,
    setExpandedQAIndex,
    setActiveTab,
    setPapers,
    setPapersTotal,
    setPaperSets,
    setManualTabSwitch,
    setPaperSwitchingLoading,
    setAllPaperIds,
    setLoadedPaperCount,
  ]);

  // 处理滚动事件
  const handleQAContainerScroll = useCallback((e) => {
    const container = e.currentTarget;
    const sections = container.querySelectorAll('.qa-section');
    const containerScrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    const now = Date.now();
    const isProgrammaticScroll = now - lastScrollTimeRef.current < 100;

    if (!isProgrammaticScroll) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (atBottom) {
        if (!autoScroll) {
          setAutoScroll(true);
        }
      } else if (isStreaming && autoScroll) {
        setAutoScroll(false);
      }

      // 检测是否滚动到顶部，触发加载更多
      if (scrollTop < 100 && messagePagination.hasMore && !messagePagination.isLoadingMore && !isStreaming) {
        logger.log('[DEBUG-SCROLL] 滚动到顶部，触发加载更多');
        loadMoreMessages(messagePagination);
      }
    }

    // section 切换逻辑
    let closestIndex = 0;
    let closestDistance = Infinity;

    sections.forEach((section, index) => {
      const sectionTop = section.offsetTop;
      const sectionMiddle = sectionTop + section.clientHeight / 2;
      const viewMiddle = containerScrollTop + containerHeight / 2;
      const distance = Math.abs(sectionMiddle - viewMiddle);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== expandedQAIndex && !isStreaming) {
      handleQAToggle(closestIndex);
    }
  }, [
    autoScroll,
    isStreaming,
    expandedQAIndex,
    messagePagination,
    lastScrollTimeRef,
    setAutoScroll,
    handleQAToggle,
    loadMoreMessages,
  ]);

  // 流式传输时自动滚动到底部
  useEffect(() => {
    if (isStreaming && autoScroll && streamingContent) {
      logger.log('[DEBUG-SCROLL] 流式传输中滚动到底部');
      scrollToBottom('auto');
    }
  }, [streamingContent, isStreaming, autoScroll, scrollToBottom]);

  // 新消息时自动滚动到底部
  useEffect(() => {
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount > 0 && autoScroll && !isStreaming) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        logger.log('[DEBUG-SCROLL] 用户发送新问题，触发滚动');
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isStreaming]);

  // 流式传输状态变化时的处理
  useEffect(() => {
    logger.log('[DEBUG-SCROLL] isStreaming 变化:', isStreaming);
    if (isStreaming) {
      setAutoScroll(true);
      setDisableSnapTemporarily(true);
    }
  }, [isStreaming, setAutoScroll, setDisableSnapTemporarily]);

  // 推荐问题加载完成后，滚动到底部
  useEffect(() => {
    const wasLoading = prevIsLoadingSuggestedRef.current;
    prevIsLoadingSuggestedRef.current = isLoadingSuggestedQuestions;

    if (wasLoading && !isLoadingSuggestedQuestions && !isStreaming) {
      setTimeout(() => {
        logger.log('[DEBUG-SCROLL] 推荐问题加载完成，滚动到底部');
        scrollToBottom('smooth');
      }, 100);
    }
  }, [isLoadingSuggestedQuestions, isStreaming, scrollToBottom, prevIsLoadingSuggestedRef]);

  // 流式传输结束且推荐问题加载完成后，延迟恢复 scroll-snap
  useEffect(() => {
    logger.log('[DEBUG-SCROLL] 检查恢复 scroll-snap: isStreaming=', isStreaming, 'isLoadingSuggestedQuestions=', isLoadingSuggestedQuestions);
    if (!isStreaming && !isLoadingSuggestedQuestions) {
      const timer = setTimeout(() => {
        logger.log('[DEBUG-SCROLL] 恢复 scroll-snap');
        setDisableSnapTemporarily(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isLoadingSuggestedQuestions, setDisableSnapTemporarily]);

  // 当消息列表变化时，自动展开最新的问答卡片
  useEffect(() => {
    const qaCount = Math.ceil(messages.filter(m => m.role === 'user').length);
    logger.log('[DEBUG-SCROLL] messages.length effect 触发, qaCount:', qaCount, 'messages.length:', messages.length, 'prevCount:', prevMessageCountRef.current);
    if (qaCount > 0) {
      setExpandedQAIndex(qaCount - 1);

      const isNewMessage = messages.length > prevMessageCountRef.current;
      prevMessageCountRef.current = messages.length;

      if (isNewMessage) {
        logger.log('[DEBUG-SCROLL] 新增消息，由 scrollToBottom 处理滚动');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // 当展开的卡片变化时，自动切换论文 tab
  useEffect(() => {
    if (expandedQAIndex === null || paperSets.length === 0) return;

    if (manualTabSwitch) return;

    const tabIndex = paperSets.length - 1 - expandedQAIndex;
    if (tabIndex >= 0 && tabIndex < paperSets.length && activeTab !== tabIndex) {
      setActiveTab(tabIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedQAIndex, paperSets.length, manualTabSwitch]);

  // 当 paperSets 加载后，自动加载当前展开问答的论文（如果尚未加载）
  useEffect(() => {
    if (paperSets.length === 0 || expandedQAIndex === null) return;
    
    // 计算当前展开问答对应的 paperSet 索引
    const paperSetIndex = paperSets.length - 1 - expandedQAIndex;
    if (paperSetIndex < 0 || paperSetIndex >= paperSets.length) return;
    
    const currentSet = paperSets[paperSetIndex];
    
    // 如果当前问答的论文尚未加载且有论文ID，则触发加载
    if (!currentSet.isLoaded && !currentSet.isLoading && currentSet.paperIds && currentSet.paperIds.length > 0) {
      logger.log(`Auto-loading papers for initially expanded QA (index: ${expandedQAIndex})`);
      handleQAToggle(expandedQAIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperSets.length]);

  return {
    scrollToBottom,
    handleQAToggle,
    handleQAContainerScroll,
  };
};

export default useAIScrollManager;

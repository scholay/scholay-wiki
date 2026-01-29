/**
 * 论文相关状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useRef, useCallback } from 'react';
import { publicScholarAPI } from '../../../services/api';
import logger from '../../../utils/logger';

// 分页配置
export const PAPER_PAGE_SIZE = 20;

// 论文详情字段
const PAPER_FIELDS = ['paperId', 'title', 'authors', 'year', 'abstract', 'citationCount', 'venue', 'publicationDate', 'tldr', 'openAccessPdf', 'externalIds', 'isOpenAccess', 'fieldsOfStudy'];

export const usePaperState = () => {
  // 论文列表
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);

  // 分页相关状态
  const [allPaperIds, setAllPaperIds] = useState([]); // 所有论文 ID
  const [loadedPaperCount, setLoadedPaperCount] = useState(0); // 已加载的论文数量
  const [loadingMorePapers, setLoadingMorePapers] = useState(false); // 加载更多状态
  const [paperSwitchingLoading, setPaperSwitchingLoading] = useState(false); // 切换论文集加载状态

  // 论文集合（多批次搜索结果）
  const [paperSets, setPaperSets] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // 高亮和滚动
  const [highlightedPaperIndex, setHighlightedPaperIndex] = useState(null);
  const [scrollToPaperIndex, setScrollToPaperIndex] = useState(null);

  // Refs
  const papersContainerRef = useRef(null);

  // 加载更多论文
  const loadMorePapers = useCallback(async () => {
    if (loadingMorePapers || loadedPaperCount >= allPaperIds.length) {
      return;
    }

    setLoadingMorePapers(true);
    
    try {
      // 计算下一页的 ID
      const nextPageIds = allPaperIds.slice(loadedPaperCount, loadedPaperCount + PAPER_PAGE_SIZE);
      
      if (nextPageIds.length === 0) {
        setLoadingMorePapers(false);
        return;
      }

      logger.log(`Loading more papers: ${nextPageIds.length} (${loadedPaperCount + 1} to ${loadedPaperCount + nextPageIds.length})`);
      
      const response = await publicScholarAPI.getPaperBatch(nextPageIds, PAPER_FIELDS);
      
      if (response.data.code === 0 && response.data.data) {
        const morePapers = response.data.data || [];
        
        // 追加到现有论文列表
        setPapers(prev => [...prev, ...morePapers]);
        setLoadedPaperCount(prev => prev + morePapers.length);
        
        // 同时更新 paperSets 中的第一个集合
        setPaperSets(prevSets => {
          if (prevSets.length === 0) return prevSets;
          const newSets = [...prevSets];
          newSets[0] = {
            ...newSets[0],
            papers: [...newSets[0].papers, ...morePapers]
          };
          return newSets;
        });
        
        logger.log(`Loaded ${morePapers.length} more papers, total loaded: ${loadedPaperCount + morePapers.length}`);
      }
    } catch (err) {
      logger.error('Failed to load more papers:', err);
    } finally {
      setLoadingMorePapers(false);
    }
  }, [allPaperIds, loadedPaperCount, loadingMorePapers]);

  // 清空论文数据
  const clearPapers = useCallback(() => {
    setPapers([]);
    setPapersTotal(0);
    setAllPaperIds([]);
    setLoadedPaperCount(0);
    setPaperSets([]);
    setActiveTab(0);
    setHighlightedPaperIndex(null);
    setScrollToPaperIndex(null);
  }, []);

  // 计算是否还有更多论文
  const hasMorePapers = loadedPaperCount < allPaperIds.length;

  return {
    // 状态
    papers,
    papersTotal,
    paperSets,
    activeTab,
    highlightedPaperIndex,
    scrollToPaperIndex,
    
    // 分页状态
    allPaperIds,
    loadedPaperCount,
    loadingMorePapers,
    hasMorePapers,
    paperSwitchingLoading,

    // Setter
    setPapers,
    setPapersTotal,
    setPaperSets,
    setActiveTab,
    setHighlightedPaperIndex,
    setScrollToPaperIndex,
    setAllPaperIds,
    setLoadedPaperCount,
    setPaperSwitchingLoading,

    // Refs
    papersContainerRef,

    // 方法
    clearPapers,
    loadMorePapers,
  };
};

export default usePaperState;

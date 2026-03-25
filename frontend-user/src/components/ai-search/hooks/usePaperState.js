/**
 * 论文相关状态管理 Hook
 * 从 useAISearch.js 拆分
 * 
 * 内存优化：
 * - 限制 paperSets 最大数量为 5
 * - 超出时自动清理最旧的集合
 * - 单个集合最多保留 200 篇论文详情
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { publicScholarApi as publicScholarAPI } from 'features/search/api/scholarApi';
import logger from '../../../utils/logger';

// 分页配置
export const PAPER_PAGE_SIZE = 20;

// 内存优化配置
const MAX_PAPER_SETS = 5;          // 最多保留 5 个论文集合
const MAX_PAPERS_PER_SET = 200;    // 每个集合最多 200 篇论文详情
const MAX_PAPER_IDS = 1000;        // 最多存储 1000 个论文 ID

// 论文详情字段
const PAPER_FIELDS = ['paperId', 'title', 'authors', 'year', 'abstract', 'citationCount', 'venue', 'publicationDate', 'tldr', 'openAccessPdf', 'externalIds', 'isOpenAccess', 'fieldsOfStudy'];

export const usePaperState = () => {
  // 论文列表
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);

  // 分页相关状态
  const [allPaperIds, setAllPaperIds] = useState([]); // 所有论文 ID (限制 MAX_PAPER_IDS)
  const [loadedPaperCount, setLoadedPaperCount] = useState(0); // 已加载的论文数量
  const [loadingMorePapers, setLoadingMorePapers] = useState(false); // 加载更多状态
  const [paperSwitchingLoading, setPaperSwitchingLoading] = useState(false); // 切换论文集加载状态

  // 论文集合（多批次搜索结果）- 限制最大数量
  const [paperSets, setPaperSets] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // 高亮和滚动
  const [highlightedPaperIndex, setHighlightedPaperIndex] = useState(null);
  const [scrollToPaperIndex, setScrollToPaperIndex] = useState(null);

  // Refs
  const papersContainerRef = useRef(null);

  // 当 paperSets 超过最大数量时，自动清理最旧的集合
  useEffect(() => {
    if (paperSets.length > MAX_PAPER_SETS) {
      logger.log(`[Memory] Trimming paperSets from ${paperSets.length} to ${MAX_PAPER_SETS}`);
      setPaperSets(prev => prev.slice(-MAX_PAPER_SETS));
      // 调整 activeTab 以防越界
      if (activeTab >= MAX_PAPER_SETS) {
        setActiveTab(MAX_PAPER_SETS - 1);
      }
    }
  }, [paperSets.length, activeTab]);

  // 当 allPaperIds 超过最大数量时，截断
  useEffect(() => {
    if (allPaperIds.length > MAX_PAPER_IDS) {
      logger.log(`[Memory] Trimming allPaperIds from ${allPaperIds.length} to ${MAX_PAPER_IDS}`);
      setAllPaperIds(prev => prev.slice(0, MAX_PAPER_IDS));
    }
  }, [allPaperIds.length]);

  // 加载更多论文（带内存限制）
  const loadMorePapers = useCallback(async () => {
    // 检查是否已达到每个集合的最大论文数量
    if (loadingMorePapers || loadedPaperCount >= allPaperIds.length || loadedPaperCount >= MAX_PAPERS_PER_SET) {
      if (loadedPaperCount >= MAX_PAPERS_PER_SET) {
        logger.log(`[Memory] Reached max papers per set limit (${MAX_PAPERS_PER_SET})`);
      }
      return;
    }

    setLoadingMorePapers(true);
    
    try {
      // 计算下一页的 ID，但不超过最大限制
      const remainingCapacity = MAX_PAPERS_PER_SET - loadedPaperCount;
      const pageSize = Math.min(PAPER_PAGE_SIZE, remainingCapacity);
      const nextPageIds = allPaperIds.slice(loadedPaperCount, loadedPaperCount + pageSize);
      
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
        
        // 同时更新 paperSets 中的第一个集合（限制每个集合的论文数量）
        setPaperSets(prevSets => {
          if (prevSets.length === 0) return prevSets;
          const newSets = [...prevSets];
          const currentPapers = newSets[0].papers || [];
          // 只添加不超过限制的论文
          const spaceLeft = MAX_PAPERS_PER_SET - currentPapers.length;
          const papersToAdd = morePapers.slice(0, spaceLeft);
          newSets[0] = {
            ...newSets[0],
            papers: [...currentPapers, ...papersToAdd]
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

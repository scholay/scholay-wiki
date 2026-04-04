/**
 * 论文详情管理 Hook
 * 处理论文详情加载、引用/参考文献、相似论文等
 *
 * 缓存策略：
 * - 论文详情：paperDetailCache（50条，5分钟）
 * - 引用文献：citationsCache（按 paperId+page，200条，5分钟）
 * - 参考文献：referencesCache（按 paperId+page，200条，5分钟）
 * - ���似论文：similarPapersCache（按 paperId+page，100条，10分钟）
 * - 推荐 ID 列表：recommendationIdsCache（按 paperId，50条，10分��）
 */
import { useState, useCallback, useRef } from 'react';
import { publicScholarAPI } from '../../../services/scholar.api';
import logger from '../../../utils/logger';
import { trackDetailPageView } from '../../../utils/usageTracker';
import {
  paperDetailCache,
  citationsCache,
  referencesCache,
  similarPapersCache,
  recommendationIdsCache,
} from '../../../utils/apiCache';

// 每页显示的引用/参考文献数量
const REFS_PER_PAGE = 10;

/**
 * 论文详情管理 Hook
 */
export const usePaperDetail = () => {
  const [detailPaper, setDetailPaper] = useState(null);
  const [detailPaperId, setDetailPaperId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailActiveTab, setDetailActiveTab] = useState('citations');
  const [detailHeaderCollapsed, setDetailHeaderCollapsed] = useState(false);
  const [detailCopyState, setDetailCopyState] = useState({ doi: false, corpusId: false });
  const [detailAbstractExpanded, setDetailAbstractExpanded] = useState(false);

  const [citationsData, setCitationsData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [referencesData, setReferencesData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [citationsLoading, setCitationsLoading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(false);

  const [similarPapersData, setSimilarPapersData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [similarPapersLoading, setSimilarPapersLoading] = useState(false);
  const [allSimilarPapers, setAllSimilarPapers] = useState([]);
  const [showSimilarPapersGuide, setShowSimilarPapersGuide] = useState(false);

  const citationsLoadingRef = useRef(false);
  const referencesLoadingRef = useRef(false);
  const similarLoadingRef = useRef(false);

  // ======================== 论文详情 ========================

  const loadPaperDetail = useCallback(async (paperId, setViewMode, existingPaperData = null) => {
    if (!paperId) return;

    setViewMode?.('paper');
    setDetailPaperId(paperId);
    setDetailAbstractExpanded(false);

    const trackView = (data) => {
      trackDetailPageView(paperId, {
        doi: data?.externalIds?.DOI,
        title: data?.title,
        abstract: data?.abstract,
        authors: data?.authors,
        year: data?.year,
        venue: data?.venue,
      });
    };

    // 1. 优先使用传入的已有数据（来自搜索结果）
    if (existingPaperData && existingPaperData.paperId === paperId) {
      setDetailPaper(existingPaperData);
      setDetailLoading(false);
      setDetailError(null);
      paperDetailCache.set(paperId, existingPaperData);
      trackView(existingPaperData);
      return;
    }

    // 2. 检查缓存
    const cached = paperDetailCache.get(paperId);
    if (cached) {
      logger.log('[PaperDetail] Cache hit:', paperId);
      setDetailPaper(cached);
      setDetailLoading(false);
      setDetailError(null);
      trackView(cached);
      return;
    }

    // 3. API 请求
    setDetailLoading(true);
    setDetailError(null);
    setDetailPaper(null);

    try {
      const response = await publicScholarAPI.getPaper(paperId);
      const paperData = response.data.data;
      setDetailPaper(paperData);
      setDetailLoading(false);
      paperDetailCache.set(paperId, paperData);
      trackView(paperData);
    } catch (error) {
      logger.error('[PaperDetail] Failed to load:', error);
      setDetailError('加载论文详情失败');
      setDetailLoading(false);
      trackDetailPageView(paperId);
    }
  }, []);

  // ======================== 复制功能 ========================

  const copyDetailDoi = useCallback((e, paper) => {
    e.stopPropagation();
    if (paper?.externalIds?.DOI) {
      navigator.clipboard.writeText(paper.externalIds.DOI);
      setDetailCopyState(prev => ({ ...prev, doi: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, doi: false })), 2000);
    }
  }, []);

  const copyDetailCorpusId = useCallback((e, paper) => {
    e.stopPropagation();
    if (paper?.externalIds?.CorpusId) {
      navigator.clipboard.writeText(paper.externalIds.CorpusId.toString());
      setDetailCopyState(prev => ({ ...prev, corpusId: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, corpusId: false })), 2000);
    }
  }, []);

  // ======================== 引用文献（服务端分页 + 缓存） ========================

  const loadCitations = useCallback(async (page = 1, setSelectedPaper) => {
    if (!detailPaperId || citationsLoadingRef.current) return;

    setSelectedPaper?.(null);

    // 检查缓存
    const cacheKey = `${detailPaperId}_${page}`;
    const cached = citationsCache.get(cacheKey);
    if (cached) {
      logger.log('[PaperDetail] Citations cache hit:', cacheKey);
      setCitationsData(cached);
      return;
    }

    setCitationsLoading(true);
    citationsLoadingRef.current = true;

    try {
      const offset = (page - 1) * REFS_PER_PAGE;
      const response = await publicScholarAPI.getCitations(detailPaperId, {
        offset,
        limit: REFS_PER_PAGE,
        fields: 'paperId,title,authors,year,citationCount,venue,url,externalIds,openAccessPdf',
      });

      const resData = response.data?.data || response.data;
      const papers = resData?.data || [];
      const total = detailPaper?.citationCount || 0;

      const result = {
        papers,
        currentPage: page,
        total,
        totalPages: Math.ceil(total / REFS_PER_PAGE),
      };

      setCitationsData(result);
      citationsCache.set(cacheKey, result);
    } catch (error) {
      logger.error('Failed to load citations:', error);
    } finally {
      setCitationsLoading(false);
      citationsLoadingRef.current = false;
    }
  }, [detailPaperId, detailPaper]);

  // ======================== 参考文献（服���端分页 + 缓���） ========================

  const loadReferences = useCallback(async (page = 1, setSelectedPaper) => {
    if (!detailPaperId || referencesLoadingRef.current) return;

    setSelectedPaper?.(null);

    const cacheKey = `${detailPaperId}_${page}`;
    const cached = referencesCache.get(cacheKey);
    if (cached) {
      logger.log('[PaperDetail] References cache hit:', cacheKey);
      setReferencesData(cached);
      return;
    }

    setReferencesLoading(true);
    referencesLoadingRef.current = true;

    try {
      const offset = (page - 1) * REFS_PER_PAGE;
      const response = await publicScholarAPI.getReferences(detailPaperId, {
        offset,
        limit: REFS_PER_PAGE,
        fields: 'paperId,title,authors,year,citationCount,venue,url,externalIds,openAccessPdf',
      });

      const resData = response.data?.data || response.data;
      const papers = resData?.data || [];
      const total = detailPaper?.referenceCount || 0;

      const result = {
        papers,
        currentPage: page,
        total,
        totalPages: Math.ceil(total / REFS_PER_PAGE),
      };

      setReferencesData(result);
      referencesCache.set(cacheKey, result);
    } catch (error) {
      logger.error('Failed to load references:', error);
    } finally {
      setReferencesLoading(false);
      referencesLoadingRef.current = false;
    }
  }, [detailPaperId, detailPaper]);

  // ======================== 相似论文（推荐 ID 缓存 + 批量结果缓存） ========================

  const loadSimilarPapers = useCallback(async (page = 1, append = false, setSelectedPaper) => {
    if (!detailPaper || similarLoadingRef.current) return;

    setSelectedPaper?.(null);

    // 检查整页缓存
    const pageCacheKey = `${detailPaper.paperId}_${page}`;
    const cachedPage = similarPapersCache.get(pageCacheKey);
    if (cachedPage && !append) {
      logger.log('[PaperDetail] Similar papers cache hit:', pageCacheKey);
      setSimilarPapersData(cachedPage);
      return;
    }

    setSimilarPapersLoading(true);
    similarLoadingRef.current = true;

    try {
      // 获取推荐 ID 列表（优先缓存）
      let allPaperIds = allSimilarPapers;
      if (allPaperIds.length === 0) {
        const cachedIds = recommendationIdsCache.get(detailPaper.paperId);
        if (cachedIds) {
          allPaperIds = cachedIds;
          setAllSimilarPapers(cachedIds);
        } else {
          const recResponse = await publicScholarAPI.getRecommendations(detailPaper.paperId, 50);
          const recommendedPapers = recResponse.data?.data?.recommendedPapers || recResponse.data?.recommendedPapers || [];
          allPaperIds = recommendedPapers.map(p => p.paperId).filter(id => id);
          setAllSimilarPapers(allPaperIds);
          recommendationIdsCache.set(detailPaper.paperId, allPaperIds);
        }
      }

      if (allPaperIds.length === 0) {
        const empty = { papers: [], currentPage: 1, total: 0, totalPages: 0 };
        setSimilarPapersData(empty);
        return;
      }

      const totalPages = Math.ceil(allPaperIds.length / REFS_PER_PAGE);
      const startIndex = (page - 1) * REFS_PER_PAGE;
      const endIndex = startIndex + REFS_PER_PAGE;
      const pageIds = allPaperIds.slice(startIndex, endIndex);

      const batchResponse = await publicScholarAPI.getPaperBatch(
        pageIds,
        'paperId,title,authors,year,citationCount,venue,url,externalIds,openAccessPdf,tldr,publicationDate'
      );

      const pagePapers = batchResponse.data?.data || batchResponse.data || [];

      let result;
      if (append && similarPapersData.papers.length > 0) {
        const existingIds = new Set(similarPapersData.papers.map(p => p.paperId));
        const newPapers = pagePapers.filter(p => !existingIds.has(p.paperId));
        result = {
          papers: [...similarPapersData.papers, ...newPapers],
          currentPage: page,
          total: allPaperIds.length,
          totalPages,
        };
      } else {
        result = { papers: pagePapers, currentPage: page, total: allPaperIds.length, totalPages };
      }

      setSimilarPapersData(result);
      similarPapersCache.set(pageCacheKey, result);
    } catch (error) {
      logger.error('Failed to load similar papers:', error);
      setSimilarPapersData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    } finally {
      setSimilarPapersLoading(false);
      similarLoadingRef.current = false;
    }
  }, [detailPaper, allSimilarPapers, similarPapersData.papers]);

  // ======================== 重置 ========================

  const resetDetailData = useCallback(() => {
    // 只重置 React state，不清除缓存（缓存由 TTL 自动管理）
    setCitationsData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setReferencesData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setSimilarPapersData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setAllSimilarPapers([]);
  }, []);

  return {
    detailPaper,
    setDetailPaper,
    detailPaperId,
    setDetailPaperId,
    detailLoading,
    detailError,
    detailActiveTab,
    setDetailActiveTab,
    detailHeaderCollapsed,
    setDetailHeaderCollapsed,
    detailCopyState,
    detailAbstractExpanded,
    setDetailAbstractExpanded,
    loadPaperDetail,
    copyDetailDoi,
    copyDetailCorpusId,

    citationsData,
    citationsLoading,
    loadCitations,

    referencesData,
    referencesLoading,
    loadReferences,

    similarPapersData,
    similarPapersLoading,
    loadSimilarPapers,
    showSimilarPapersGuide,
    setShowSimilarPapersGuide,

    resetDetailData,
    REFS_PER_PAGE,
  };
};

export default usePaperDetail;

/**
 * 论文详情管理 Hook
 * 处理论文详情加载、引用/参考文献、相似论文等
 */
import { useState, useCallback } from 'react';
import { publicScholarAPI } from '../../../services/api';
import logger from '../../../utils/logger';
import { trackDetailPageView } from '../../../utils/usageTracker';

// 每页显示的引用/参考文献数量
const REFS_PER_PAGE = 10;

/**
 * 论文详情管理 Hook
 */
export const usePaperDetail = () => {
  // 论文详情视图相关状态
  const [detailPaper, setDetailPaper] = useState(null);
  const [detailPaperId, setDetailPaperId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailActiveTab, setDetailActiveTab] = useState('citations');
  const [detailHeaderCollapsed, setDetailHeaderCollapsed] = useState(false);
  const [detailCopyState, setDetailCopyState] = useState({ doi: false, corpusId: false });
  const [detailAbstractExpanded, setDetailAbstractExpanded] = useState(false);

  // 引用/参考文献分页加载状态
  const [citationsData, setCitationsData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [referencesData, setReferencesData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [citationsLoading, setCitationsLoading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(false);

  // 相似论文状态
  const [similarPapersData, setSimilarPapersData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [similarPapersLoading, setSimilarPapersLoading] = useState(false);
  const [allSimilarPapers, setAllSimilarPapers] = useState([]);
  const [showSimilarPapersGuide, setShowSimilarPapersGuide] = useState(false);

  // 加载论文详情的函数
  const loadPaperDetail = useCallback(async (paperId, setViewMode) => {
    if (!paperId) return;

    logger.log('[SearchResultsPage] Loading paper detail:', paperId);
    setViewMode?.('paper');
    setDetailPaperId(paperId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailPaper(null);
    setDetailAbstractExpanded(false);

    try {
      const response = await publicScholarAPI.getPaper(paperId);
      logger.log('[SearchResultsPage] Paper detail loaded:', response.data);
      setDetailPaper(response.data.data);
      setDetailLoading(false);
      // 记录论文详情页查看使用统计
      trackDetailPageView(paperId);
    } catch (error) {
      logger.error('[SearchResultsPage] Failed to load paper details:', error);
      setDetailError('加载论文详情失败');
      setDetailLoading(false);
    }
  }, []);

  // 复制DOI
  const copyDetailDoi = useCallback((e, paper) => {
    e.stopPropagation();
    if (paper?.externalIds?.DOI) {
      navigator.clipboard.writeText(paper.externalIds.DOI);
      setDetailCopyState(prev => ({ ...prev, doi: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, doi: false })), 2000);
    }
  }, []);

  // 复制CorpusId
  const copyDetailCorpusId = useCallback((e, paper) => {
    e.stopPropagation();
    if (paper?.externalIds?.CorpusId) {
      navigator.clipboard.writeText(paper.externalIds.CorpusId.toString());
      setDetailCopyState(prev => ({ ...prev, corpusId: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, corpusId: false })), 2000);
    }
  }, []);

  // 加载引用文献（分页）
  const loadCitations = useCallback(async (page = 1, setSelectedPaper) => {
    if (!detailPaper || citationsLoading) return;

    setSelectedPaper?.(null);

    const allCitations = detailPaper.citations || [];
    if (allCitations.length === 0) return;

    const totalPages = Math.ceil(allCitations.length / REFS_PER_PAGE);
    const startIndex = (page - 1) * REFS_PER_PAGE;
    const endIndex = startIndex + REFS_PER_PAGE;

    const pageIds = allCitations
      .slice(startIndex, endIndex)
      .map(c => c.paperId)
      .filter(id => id);

    if (pageIds.length === 0) return;

    setCitationsLoading(true);
    try {
      const response = await publicScholarAPI.getPaperBatch(
        pageIds,
        ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      );

      const newPapers = response.data?.data || response.data || [];

      setCitationsData({
        papers: newPapers,
        currentPage: page,
        total: allCitations.length,
        totalPages: totalPages
      });
    } catch (error) {
      logger.error('Failed to load citations:', error);
    } finally {
      setCitationsLoading(false);
    }
  }, [detailPaper, citationsLoading]);

  // 加载参考文献（分页）
  const loadReferences = useCallback(async (page = 1, setSelectedPaper) => {
    if (!detailPaper || referencesLoading) return;

    setSelectedPaper?.(null);

    const allReferences = detailPaper.references || [];
    if (allReferences.length === 0) return;

    const totalPages = Math.ceil(allReferences.length / REFS_PER_PAGE);
    const startIndex = (page - 1) * REFS_PER_PAGE;
    const endIndex = startIndex + REFS_PER_PAGE;

    const pageIds = allReferences
      .slice(startIndex, endIndex)
      .map(r => r.paperId)
      .filter(id => id);

    if (pageIds.length === 0) return;

    setReferencesLoading(true);
    try {
      const response = await publicScholarAPI.getPaperBatch(
        pageIds,
        ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      );

      const newPapers = response.data?.data || response.data || [];

      setReferencesData({
        papers: newPapers,
        currentPage: page,
        total: allReferences.length,
        totalPages: totalPages
      });
    } catch (error) {
      logger.error('Failed to load references:', error);
    } finally {
      setReferencesLoading(false);
    }
  }, [detailPaper, referencesLoading]);

  // 加载相似论文（分页）
  const loadSimilarPapers = useCallback(async (page = 1, append = false, setSelectedPaper) => {
    if (!detailPaper || similarPapersLoading) return;

    setSelectedPaper?.(null);

    setSimilarPapersLoading(true);
    try {
      let allPaperIds = allSimilarPapers;
      if (allPaperIds.length === 0) {
        const recResponse = await publicScholarAPI.getRecommendations(
          detailPaper.paperId,
          100
        );

        const recommendedPapers = recResponse.data?.data?.recommendedPapers || recResponse.data?.recommendedPapers || [];
        allPaperIds = recommendedPapers.map(p => p.paperId).filter(id => id);
        setAllSimilarPapers(allPaperIds);
      }

      if (allPaperIds.length === 0) {
        setSimilarPapersData({
          papers: [],
          currentPage: 1,
          total: 0,
          totalPages: 0
        });
        return;
      }

      const totalPages = Math.ceil(allPaperIds.length / REFS_PER_PAGE);
      const startIndex = (page - 1) * REFS_PER_PAGE;
      const endIndex = startIndex + REFS_PER_PAGE;
      const pageIds = allPaperIds.slice(startIndex, endIndex);

      const batchResponse = await publicScholarAPI.getPaperBatch(
        pageIds,
        ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      );

      const pagePapers = batchResponse.data?.data || batchResponse.data || [];

      setSimilarPapersData(prev => {
        if (append && prev.papers.length > 0) {
          const existingIds = new Set(prev.papers.map(p => p.paperId));
          const newPapers = pagePapers.filter(p => !existingIds.has(p.paperId));
          return {
            papers: [...prev.papers, ...newPapers],
            currentPage: page,
            total: allPaperIds.length,
            totalPages: totalPages
          };
        }
        return {
          papers: pagePapers,
          currentPage: page,
          total: allPaperIds.length,
          totalPages: totalPages
        };
      });
    } catch (error) {
      logger.error('Failed to load similar papers:', error);
      setSimilarPapersData({
        papers: [],
        currentPage: 1,
        total: 0,
        totalPages: 0
      });
    } finally {
      setSimilarPapersLoading(false);
    }
  }, [detailPaper, similarPapersLoading, allSimilarPapers]);

  // 重置详情页数据
  const resetDetailData = useCallback(() => {
    setCitationsData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setReferencesData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setSimilarPapersData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
    setAllSimilarPapers([]);
  }, []);

  return {
    // 论文详情
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

    // 引用文献
    citationsData,
    citationsLoading,
    loadCitations,

    // 参考文献
    referencesData,
    referencesLoading,
    loadReferences,

    // 相似论文
    similarPapersData,
    similarPapersLoading,
    loadSimilarPapers,
    showSimilarPapersGuide,
    setShowSimilarPapersGuide,

    // 工具
    resetDetailData,
    REFS_PER_PAGE,
  };
};

export default usePaperDetail;

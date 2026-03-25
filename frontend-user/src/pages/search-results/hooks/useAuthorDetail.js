/**
 * 作者详情管理 Hook
 * 处理作者详情加载、作者论文列表等
 */
import { useState, useCallback } from 'react';
import { publicScholarApi as publicScholarAPI } from 'features/search/api/scholarApi';
import logger from '../../../utils/logger';

/**
 * 作者详情管理 Hook
 */
export const useAuthorDetail = () => {
  // 作者详情视图相关状态
  const [detailAuthor, setDetailAuthor] = useState(null);
  const [detailAuthorId, setDetailAuthorId] = useState(null);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorError, setAuthorError] = useState(null);
  const [authorPapers, setAuthorPapers] = useState([]);
  const [authorPapersLoading, setAuthorPapersLoading] = useState(false);
  const [authorPapersPage, setAuthorPapersPage] = useState(1);
  const [authorPapersTotalPages, setAuthorPapersTotalPages] = useState(0);
  const [authorPapersTotal, setAuthorPapersTotal] = useState(0);
  const [authorPapersViewMode, setAuthorPapersViewMode] = useState('list');
  const [allAuthorPapers, setAllAuthorPapers] = useState([]);

  // 加载作者详情的函数
  const loadAuthorDetail = useCallback(async (authorId, page = 1, setViewMode) => {
    if (!authorId) return;

    logger.log('[SearchResultsPage] Loading author detail:', authorId, 'page:', page);
    setViewMode?.('author');
    setDetailAuthorId(authorId);
    setAuthorLoading(true);
    setAuthorError(null);
    if (page === 1) {
      setDetailAuthor(null);
      setAuthorPapers([]);
    }
    setAuthorPapersPage(page);

    const perPage = 20;
    const offset = (page - 1) * perPage;

    try {
      // Step 1: 并行加载作者详情和作者论文ID列表
      const [authorResponse, papersIdsResponse] = await Promise.all([
        page === 1 ? publicScholarAPI.getAuthor(authorId) : Promise.resolve(null),
        publicScholarAPI.getAuthorPapers(authorId, offset, perPage, 'paperId')
      ]);

      if (page === 1 && authorResponse) {
        logger.log('[SearchResultsPage] Author detail loaded:', authorResponse.data);
        if (authorResponse.data.code === 0 && authorResponse.data.data) {
          setDetailAuthor(authorResponse.data.data);
          const totalPapers = authorResponse.data.data.paperCount || 0;
          const totalPages = Math.ceil(totalPapers / perPage);
          logger.log('[SearchResultsPage] Total papers:', totalPapers, 'Total pages:', totalPages);
          setAuthorPapersTotal(totalPapers);
          setAuthorPapersTotalPages(totalPages);
        } else {
          throw new Error('Failed to load author details');
        }
      }

      // Step 2: 用论文ID批量获取完整论文详情
      if (papersIdsResponse.data.code === 0 && papersIdsResponse.data.data) {
        const paperIds = (papersIdsResponse.data.data.data || []).map(p => p.paperId).filter(id => id);
        logger.log('[SearchResultsPage] Paper IDs:', paperIds);

        if (paperIds.length > 0) {
          const batchResponse = await publicScholarAPI.getPaperBatch(
            paperIds,
            ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
          );

          logger.log('[SearchResultsPage] Batch response:', batchResponse.data);
          if (batchResponse.data.code === 0 && batchResponse.data.data) {
            const papersData = batchResponse.data.data || [];
            logger.log('[SearchResultsPage] Papers data length:', papersData.length);
            setAuthorPapers(papersData);
          }
        } else {
          setAuthorPapers([]);
        }
      }

      setAuthorLoading(false);
    } catch (error) {
      logger.error('[SearchResultsPage] Failed to load author details:', error);
      setAuthorError('加载作者详情失败');
      setAuthorLoading(false);
    }
  }, []);

  // 作者论文分页切换
  const handleAuthorPapersPageChange = useCallback((newPage, setViewMode) => {
    if (newPage < 1 || newPage > authorPapersTotalPages || newPage === authorPapersPage) return;
    loadAuthorDetail(detailAuthorId, newPage, setViewMode);
  }, [detailAuthorId, authorPapersTotalPages, authorPapersPage, loadAuthorDetail]);

  // 当切换到表格视图时，从第一页开始加载数据
  const initAuthorTableFromFirstPage = useCallback(async () => {
    if (!detailAuthorId || authorPapersLoading) return;

    setAuthorPapersLoading(true);

    try {
      const papersIdsResponse = await publicScholarAPI.getAuthorPapers(detailAuthorId, 0, 20, 'paperId');

      if (papersIdsResponse.data.code === 0 && papersIdsResponse.data.data) {
        const paperIds = (papersIdsResponse.data.data.data || []).map(p => p.paperId).filter(id => id);

        if (paperIds.length > 0) {
          const batchResponse = await publicScholarAPI.getPaperBatch(
            paperIds,
            ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
          );

          if (batchResponse.data.code === 0 && batchResponse.data.data) {
            const papers = batchResponse.data.data || [];
            setAllAuthorPapers(papers);
          }
        }
      }
    } catch (error) {
      logger.error('[SearchResultsPage] Failed to init author table from first page:', error);
    } finally {
      setAuthorPapersLoading(false);
    }
  }, [detailAuthorId, authorPapersLoading]);

  return {
    // 作者详情
    detailAuthor,
    setDetailAuthor,
    detailAuthorId,
    setDetailAuthorId,
    authorLoading,
    authorError,
    authorPapers,
    setAuthorPapers,
    authorPapersLoading,
    authorPapersPage,
    authorPapersTotalPages,
    authorPapersTotal,
    authorPapersViewMode,
    setAuthorPapersViewMode,
    allAuthorPapers,
    setAllAuthorPapers,

    // 操作函数
    loadAuthorDetail,
    handleAuthorPapersPageChange,
    initAuthorTableFromFirstPage,
  };
};

export default useAuthorDetail;

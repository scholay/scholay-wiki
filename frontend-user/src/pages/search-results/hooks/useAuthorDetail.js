/**
 * 作者详情管理 Hook
 * 处理作者详情加载、作者论文列表等
 *
 * 缓存策略：
 * - 作者详情：authorDetailCache（30条，5分钟）
 * - 作者论文：authorPapersCache（按 authorId+page，100条，5分钟）
 */
import { useState, useCallback } from 'react';
import { publicScholarAPI } from '../../../services/scholar.api';
import logger from '../../../utils/logger';
import { authorDetailCache, authorPapersCache } from '../../../utils/apiCache';

/**
 * 作者详情管理 Hook
 */
export const useAuthorDetail = () => {
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

  const loadAuthorDetail = useCallback(async (authorId, page = 1, setViewMode) => {
    if (!authorId) return;

    logger.log('[AuthorDetail] Loading:', authorId, 'page:', page);
    setViewMode?.('author');
    setDetailAuthorId(authorId);
    setAuthorError(null);
    setAuthorPapersPage(page);

    const perPage = 20;
    const offset = (page - 1) * perPage;

    // 检查作者详情缓存（仅首页加载作者信息）
    const cachedAuthor = page === 1 ? authorDetailCache.get(authorId) : null;
    // 检查作者论文缓存
    const papersCacheKey = `${authorId}_${page}`;
    const cachedPapers = authorPapersCache.get(papersCacheKey);

    // 全部命中缓存，无需请求
    if (page === 1 && cachedAuthor && cachedPapers) {
      logger.log('[AuthorDetail] Full cache hit:', authorId);
      setDetailAuthor(cachedAuthor);
      const totalPapers = cachedAuthor.paperCount || 0;
      setAuthorPapersTotal(totalPapers);
      setAuthorPapersTotalPages(Math.ceil(totalPapers / perPage));
      setAuthorPapers(cachedPapers);
      setAuthorLoading(false);
      return;
    }

    // 非首页 + 论文缓存命中
    if (page > 1 && cachedPapers) {
      logger.log('[AuthorDetail] Papers cache hit:', papersCacheKey);
      setAuthorPapers(cachedPapers);
      setAuthorLoading(false);
      return;
    }

    setAuthorLoading(true);
    if (page === 1) {
      setDetailAuthor(null);
      setAuthorPapers([]);
    }

    try {
      // 并行加载：作者详情（首页且无缓存时）+ 作者论文
      const [authorResponse, papersResponse] = await Promise.all([
        page === 1 && !cachedAuthor ? publicScholarAPI.getAuthor(authorId) : Promise.resolve(null),
        publicScholarAPI.getAuthorPapers(authorId, offset, perPage),
      ]);

      // 处理作者详情
      if (page === 1) {
        let authorData = cachedAuthor;
        if (!authorData && authorResponse) {
          if (authorResponse.data.code === 0 && authorResponse.data.data) {
            authorData = authorResponse.data.data;
            authorDetailCache.set(authorId, authorData);
          } else {
            throw new Error('Failed to load author details');
          }
        }
        if (authorData) {
          setDetailAuthor(authorData);
          const totalPapers = authorData.paperCount || 0;
          setAuthorPapersTotal(totalPapers);
          setAuthorPapersTotalPages(Math.ceil(totalPapers / perPage));
        }
      }

      // 处理作者论文
      if (papersResponse.data.code === 0 && papersResponse.data.data) {
        const papersData = papersResponse.data.data.data || [];
        setAuthorPapers(papersData);
        authorPapersCache.set(papersCacheKey, papersData);

        if (page > 1) {
          const total = papersResponse.data.data.total || authorPapersTotal;
          setAuthorPapersTotal(total);
          setAuthorPapersTotalPages(Math.ceil(total / perPage));
        }
      }

      setAuthorLoading(false);
    } catch (error) {
      logger.error('[AuthorDetail] Failed to load:', error);
      setAuthorError('加载作者详情失败');
      setAuthorLoading(false);
    }
  }, [authorPapersTotal]);

  const handleAuthorPapersPageChange = useCallback((newPage, setViewMode) => {
    if (newPage < 1 || newPage > authorPapersTotalPages || newPage === authorPapersPage) return;
    loadAuthorDetail(detailAuthorId, newPage, setViewMode);
  }, [detailAuthorId, authorPapersTotalPages, authorPapersPage, loadAuthorDetail]);

  const initAuthorTableFromFirstPage = useCallback(async () => {
    if (!detailAuthorId || authorPapersLoading) return;

    // 检查缓存
    const cacheKey = `${detailAuthorId}_1`;
    const cached = authorPapersCache.get(cacheKey);
    if (cached) {
      logger.log('[AuthorDetail] Table init cache hit');
      setAllAuthorPapers(cached);
      return;
    }

    setAuthorPapersLoading(true);

    try {
      const papersResponse = await publicScholarAPI.getAuthorPapers(detailAuthorId, 0, 20);

      if (papersResponse.data.code === 0 && papersResponse.data.data) {
        const papers = papersResponse.data.data.data || [];
        setAllAuthorPapers(papers);
        authorPapersCache.set(cacheKey, papers);
      }
    } catch (error) {
      logger.error('[AuthorDetail] Failed to init table:', error);
    } finally {
      setAuthorPapersLoading(false);
    }
  }, [detailAuthorId, authorPapersLoading]);

  return {
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

    loadAuthorDetail,
    handleAuthorPapersPageChange,
    initAuthorTableFromFirstPage,
  };
};

export default useAuthorDetail;

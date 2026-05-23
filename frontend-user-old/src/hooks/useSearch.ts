/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * useSearch - 搜索功能 Hook
 * 管理学术搜索的状态和逻辑
 */

import { useState, useCallback, useRef } from 'react';
import { publicScholarAPI } from '../services/scholar.api';
import logger from '../utils/logger';
import { trackDirectSearch, EntryPoint } from '../utils/usageTracker';
import type { Paper } from '../types/paper';
import type { SearchFilters } from '../utils/searchStorage';

export interface UseSearchOptions {
  defaultPageSize?: number;
}

export interface QueryInfo {
  originalQuery: string;
  translatedQuery: string;
  actualQuery: string;
  translationEnabled: boolean;
}

export interface CachedTranslation {
  query: string;
  translated: string;
  actual: string;
}

export interface UseSearchResult {
  papers: Paper[];
  total: number;
  loading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  queryInfo: QueryInfo;
  cachedTranslation: CachedTranslation;
  totalPages: number;
  hasResults: boolean;
  performSearch: (
    query: string,
    filters?: Partial<SearchFilters>,
    page?: number,
    enableTranslation?: boolean,
  ) => Promise<void>;
  clearSearch: () => void;
  setCurrentPage: (page: number) => void;
  updatePageSize: (newSize: number) => void;
  setCachedTranslation: React.Dispatch<React.SetStateAction<CachedTranslation>>;
}

export function useSearch({ defaultPageSize = 10 }: UseSearchOptions = {}): UseSearchResult {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const [queryInfo, setQueryInfo] = useState<QueryInfo>({
    originalQuery: '',
    translatedQuery: '',
    actualQuery: '',
    translationEnabled: false,
  });

  const [cachedTranslation, setCachedTranslation] = useState<CachedTranslation>({
    query: '',
    translated: '',
    actual: '',
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const performSearch = useCallback(
    async (
      query: string,
      filters: Partial<SearchFilters> = {},
      page: number = 1,
      _enableTranslation: boolean = true,
    ): Promise<void> => {
      if (!query || !query.trim()) {
        setPapers([]);
        setTotal(0);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const searchParams = {
          query: query.trim(),
          offset: (page - 1) * pageSize,
          limit: pageSize,
          fields: [
            'paperId', 'title', 'abstract', 'authors', 'year', 'citationCount',
            'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy',
            'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr',
            'journal', 'externalIds',
          ].join(','),
          ...buildFilterParams(filters),
        };

        // publicScholarAPI.searchPapers' typed signature only takes params; the
        // legacy axios call accepts a second config arg at runtime — cast to any
        // to preserve behavior without altering the API surface.
        const response = await (publicScholarAPI.searchPapers as any)(
          searchParams,
          { signal: abortControllerRef.current.signal },
        );

        if (response.data.code === 0 && response.data.data) {
          const { data: papersData, total: totalCount, query_info } = response.data.data;

          setPapers(papersData || []);
          setTotal(totalCount || 0);
          setCurrentPage(page);

          trackDirectSearch(query.trim(), EntryPoint.SEARCH_BOX);

          if (query_info) {
            setQueryInfo({
              originalQuery: query_info.original_query || query,
              translatedQuery: query_info.translated_query || '',
              actualQuery: query_info.actual_query || query,
              translationEnabled: query_info.translation_enabled || false,
            });

            if (query_info.translated_query) {
              setCachedTranslation({
                query: query,
                translated: query_info.translated_query,
                actual: query_info.actual_query || query,
              });
            }
          }
        } else {
          setError(response.data.message || '搜索失败');
        }
      } catch (err: unknown) {
        const e = err as Error;
        if (e.name !== 'AbortError') {
          logger.error('[useSearch] Search failed:', err);
          setError(e.message || '搜索请求失败');
        }
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  const clearSearch = useCallback((): void => {
    setPapers([]);
    setTotal(0);
    setCurrentPage(1);
    setError(null);
    setQueryInfo({
      originalQuery: '',
      translatedQuery: '',
      actualQuery: '',
      translationEnabled: false,
    });
  }, []);

  const updatePageSize = useCallback((newSize: number): void => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  return {
    papers,
    total,
    loading,
    error,
    currentPage,
    pageSize,
    queryInfo,
    cachedTranslation,
    totalPages: Math.ceil(total / pageSize),
    hasResults: papers.length > 0,
    performSearch,
    clearSearch,
    setCurrentPage,
    updatePageSize,
    setCachedTranslation,
  };
}

/**
 * 构建筛选参数
 */
function buildFilterParams(filters: Partial<SearchFilters>): Record<string, string> {
  const params: Record<string, string> = {};

  if (filters.yearFrom) {
    params.year_from = filters.yearFrom;
  }
  if (filters.yearTo) {
    params.year_to = filters.yearTo;
  }
  if (filters.fieldsOfStudy && filters.fieldsOfStudy.length > 0) {
    params.fields_of_study = filters.fieldsOfStudy.join(',');
  }
  if (filters.openAccessPdf) {
    params.open_access_pdf = 'true';
  }
  if (filters.minCitationCount) {
    params.min_citation_count = filters.minCitationCount;
  }
  if (filters.publicationTypes && filters.publicationTypes.length > 0) {
    params.publication_types = filters.publicationTypes.join(',');
  }
  if (filters.venue) {
    params.venue = filters.venue;
  }

  return params;
}

export default useSearch;

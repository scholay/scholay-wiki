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
import { publicScholarAPI } from '../services/api';
import logger from '../utils/logger';

/**
 * 搜索功能 Hook
 * @param {Object} options - 配置选项
 * @param {number} options.defaultPageSize - 默认每页数量
 * @returns {Object} 搜索状态和方法
 */
export function useSearch({ defaultPageSize = 10 } = {}) {
  // 搜索结果状态
  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  
  // 查询信息
  const [queryInfo, setQueryInfo] = useState({
    originalQuery: '',
    translatedQuery: '',
    actualQuery: '',
    translationEnabled: false
  });
  
  // 翻译缓存
  const [cachedTranslation, setCachedTranslation] = useState({
    query: '',
    translated: '',
    actual: ''
  });
  
  // 取消请求的 ref
  const abortControllerRef = useRef(null);
  
  /**
   * 执行搜索
   * @param {string} query - 搜索查询
   * @param {Object} filters - 筛选条件
   * @param {number} page - 页码
   * @param {boolean} enableTranslation - 是否启用翻译
   */
  const performSearch = useCallback(async (query, filters = {}, page = 1, enableTranslation = true) => {
    if (!query || !query.trim()) {
      setPapers([]);
      setTotal(0);
      return;
    }
    
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    
    try {
      // 构建搜索参数
      const searchParams = {
        query: query.trim(),
        offset: (page - 1) * pageSize,
        limit: pageSize,
        fields: [
          'paperId', 'title', 'abstract', 'authors', 'year', 'citationCount',
          'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy',
          'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr',
          'journal', 'externalIds'
        ].join(','),
        ...buildFilterParams(filters)
      };
      
      // 执行搜索
      const response = await publicScholarAPI.searchPapers(
        searchParams,
        { signal: abortControllerRef.current.signal }
      );
      
      if (response.data.code === 0 && response.data.data) {
        const { data: papersData, total: totalCount, query_info } = response.data.data;
        
        setPapers(papersData || []);
        setTotal(totalCount || 0);
        setCurrentPage(page);
        
        // 更新查询信息
        if (query_info) {
          setQueryInfo({
            originalQuery: query_info.original_query || query,
            translatedQuery: query_info.translated_query || '',
            actualQuery: query_info.actual_query || query,
            translationEnabled: query_info.translation_enabled || false
          });
          
          // 缓存翻译结果
          if (query_info.translated_query) {
            setCachedTranslation({
              query: query,
              translated: query_info.translated_query,
              actual: query_info.actual_query || query
            });
          }
        }
      } else {
        setError(response.data.message || '搜索失败');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        logger.error('[useSearch] Search failed:', err);
        setError(err.message || '搜索请求失败');
      }
    } finally {
      setLoading(false);
    }
  }, [pageSize]);
  
  /**
   * 清空搜索结果
   */
  const clearSearch = useCallback(() => {
    setPapers([]);
    setTotal(0);
    setCurrentPage(1);
    setError(null);
    setQueryInfo({
      originalQuery: '',
      translatedQuery: '',
      actualQuery: '',
      translationEnabled: false
    });
  }, []);
  
  /**
   * 更新每页数量
   */
  const updatePageSize = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);
  
  return {
    // 状态
    papers,
    total,
    loading,
    error,
    currentPage,
    pageSize,
    queryInfo,
    cachedTranslation,
    
    // 计算属性
    totalPages: Math.ceil(total / pageSize),
    hasResults: papers.length > 0,
    
    // 方法
    performSearch,
    clearSearch,
    setCurrentPage,
    updatePageSize,
    setCachedTranslation
  };
}

/**
 * 构建筛选参数
 * @param {Object} filters - 筛选条件
 * @returns {Object} API 参数
 */
function buildFilterParams(filters) {
  const params = {};
  
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


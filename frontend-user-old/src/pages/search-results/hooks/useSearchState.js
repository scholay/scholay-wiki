/**
 * 搜索结果核心状态管理 Hook
 * 管理搜索查询、论文列表、分页、筛选等核心状态
 */
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../utils/AuthContext';
import { useSidebar } from '../../../stores/sidebar.store';
import { publicScholarAPI } from '../../../services/scholar.api';
import {
  getSearchQuery,
  setSearchQuery as saveSearchQuery,
  getSearchFilters,
  setSearchFilters as saveSearchFilters,
  setSearchMode as saveSearchMode,
  getAIModelLevel,
  setAIConversationId,
  getSearchSource,
  setSearchSource as saveSearchSource,
} from '../../../utils/searchStorage';
import { trackDirectSearch, EntryPoint } from '../../../utils/usageTracker';
import logger from '../../../utils/logger';
import { searchResultsCache } from '../../../utils/apiCache';

/**
 * 搜索状态管理 Hook
 */
export const useSearchState = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isMobile } = useSidebar();

  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 过渡到AI模式的状态
  const [isTransitioningToAI, setIsTransitioningToAI] = useState(false);
  const [justSwitchedToAI, setJustSwitchedToAI] = useState(false);
  const [searchBoxRect, setSearchBoxRect] = useState(null);
  const searchFormRef = useRef(null);

  // Placeholder 轮播
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);

  // 检查是否为 AI 搜索模式
  const isAIMode = searchParams.get('mode') === 'ai';

  // 从 sessionStorage 或 URL 参数初始化搜索查询
  const [searchQuery, setSearchQuery] = useState(() => {
    const storedQuery = getSearchQuery();
    if (storedQuery) return storedQuery;
    return searchParams.get('query') || '';
  });

  // 筛选条件状态
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => {
    const storedFilters = getSearchFilters();
    if (storedFilters && Object.keys(storedFilters).some(k =>
      storedFilters[k] && (Array.isArray(storedFilters[k]) ? storedFilters[k].length > 0 : storedFilters[k] !== '')
    )) {
      return storedFilters;
    }
    return {
      yearFrom: searchParams.get('yearFrom') || '',
      yearTo: searchParams.get('yearTo') || '',
      publicationTypes: searchParams.get('publicationTypes')?.split(',').filter(Boolean) || [],
      fieldsOfStudy: searchParams.get('fieldsOfStudy')?.split(',').filter(Boolean) || [],
      openAccessPdf: searchParams.get('openAccessPdf') || '',
      venue: searchParams.get('venue') || '',
      minCitationCount: searchParams.get('minCitationCount') || '',
    };
  });

  // 数据源状态（持久化到 localStorage）
  const [searchSource, setSearchSourceState] = useState(() => getSearchSource());
  const setSearchSource = useCallback((source) => {
    setSearchSourceState(source);
    saveSearchSource(source);
  }, []);

  // 论文列表状态
  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 查询信息状态
  const [queryInfo, setQueryInfo] = useState({
    originalQuery: '',
    searchSuggestions: [],  // AI生成的搜索建议数组
    actualQuery: '',
    hasSuggestions: false,
    searchStrategy: ''
  });

  // 建议缓存
  const [cachedSuggestions, setCachedSuggestions] = useState({
    query: '',
    suggestions: [],
    actual: ''
  });

  // 选中的论文和引用
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [citePaper, setCitePaper] = useState(null);

  // TLDR 和摘要展开状态
  const [expandedTldr, setExpandedTldr] = useState({});
  const [expandedAbstract, setExpandedAbstract] = useState({});
  const [showAbstractMode, setShowAbstractMode] = useState({});

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [papersPerPage, setPapersPerPage] = useState(() => {
    const saved = localStorage.getItem('papersPerPage');
    return saved ? parseInt(saved, 10) : 20;
  });

  // 切换 TLDR 展开/折叠
  const toggleTldrExpand = useCallback((paperId) => {
    setExpandedTldr(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  }, []);

  // 切换摘要展开/折叠
  const toggleAbstractExpand = useCallback((paperId) => {
    setExpandedAbstract(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  }, []);

  // 初始化状态（从 localStorage 和 URL 读取）
  const initState = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasPaperId = !!urlParams.get('paperId');
    const hasAuthorId = !!urlParams.get('authorId');
    const returnToTable = localStorage.getItem('returnToTableView') === 'true';
    const returnToSimilarTableFlag = localStorage.getItem('returnToSimilarPapersTable') === 'true';

    if (returnToTable) {
      localStorage.removeItem('returnToTableView');
    }
    if (returnToSimilarTableFlag) {
      localStorage.removeItem('returnToSimilarPapersTable');
    }

    logger.log('[SearchResultsPage] initState:', { hasPaperId, hasAuthorId, returnToTable, returnToSimilarTableFlag });

    return {
      hasPaperId,
      hasAuthorId,
      returnToTable,
      returnToSimilarTable: returnToSimilarTableFlag,
    };
  }, []);

  // 视图模式
  const [viewMode, setViewMode] = useState(() => {
    if (initState.hasAuthorId) return 'author';
    if (initState.hasPaperId) return 'paper';
    if (initState.returnToTable) {
      if (initState.returnToSimilarTable) return 'paper';
      return 'table';
    }
    return 'list';
  });

  // 论文预览抽屉状态
  const [showPaperDrawer, setShowPaperDrawer] = useState(false);

  // Refs
  const resultsMainRef = useRef(null);
  const papersContainerRef = useRef(null);
  const similarPapersListRef = useRef(null);
  const similarPapersTabRef = useRef(null);
  const textareaRef = useRef(null);
  const returnedFromLogin = useRef(false);
  const returnedToSimilarTable = useRef(false);
  // 用于取消前一次飞行中的搜索：用户快速切换筛选/翻页时，旧请求直接 abort，
  // 既节省 minicod 付费调用，也避免旧结果覆盖新结果的竞态。
  const searchAbortRef = useRef(null);
  const hasClickedSimilarTabRef = useRef(false);
  const hasClickedSimilarTableBtnRef = useRef(false);
  const hasClickedAuthorTableBtnRef = useRef(false);
  const hasClickedTableBtnRef = useRef(false);

  // 输入法状态
  const [isComposing, setIsComposing] = useState(false);
  const [isInputSingleLine, setIsInputSingleLine] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return !!urlParams.get('query');
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showDetailSearch, setShowDetailSearch] = useState(false);

  // 更新 sessionStorage 和 URL 参数
  const updateURL = useCallback((query, currentFilters, page) => {
    saveSearchQuery(query);
    saveSearchFilters(currentFilters);

    const params = new URLSearchParams();
    if (page > 1) params.set('page', page);
    setSearchParams(params);
  }, [setSearchParams]);

  // 构建搜索结果缓存 key
  const buildSearchCacheKey = useCallback((query, filters, page, source) => {
    const filterStr = JSON.stringify({
      yf: filters.yearFrom || '',
      yt: filters.yearTo || '',
      pt: filters.publicationTypes || [],
      fs: filters.fieldsOfStudy || [],
      oa: filters.openAccessPdf || '',
      v: filters.venue || '',
      mc: filters.minCitationCount || '',
    });
    return `${query}_${filterStr}_p${page}_s${papersPerPage}_src${source}`;
  }, [papersPerPage]);

  // 执行搜索（带分页缓存）
  const performSearch = useCallback(async (query, currentFilters, page = 1, isNewSearch = true, enableSuggestions = true, sourceOverride = null) => {
    if (!query.trim()) return;

    if (returnedFromLogin.current) {
      returnedFromLogin.current = false;
    } else {
      setViewMode('list');
    }

    setSelectedPaper(null);

    const effectiveSource = sourceOverride || searchSource;

    // 检查搜索结果缓存（翻页 / 返回列表 / 数据源切换命中率高）
    const cacheKey = buildSearchCacheKey(query, currentFilters, page, effectiveSource);
    const cachedResult = searchResultsCache.get(cacheKey);
    if (cachedResult) {
      logger.log('[Search] Cache hit:', cacheKey);
      // 命中缓存前仍要 abort 之前的飞行请求（避免旧结果后到覆盖缓存命中的新结果）
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      setPapers(cachedResult.papers);
      setTotal(cachedResult.total);
      setQueryInfo(cachedResult.queryInfo);
      return;
    }

    // 取消上一次仍在飞行的搜索
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);

    try {
      // 检查是否可以复用缓存的建议
      const canReuseSuggestions =
        cachedSuggestions.query === query &&
        cachedSuggestions.suggestions.length > 0 &&
        enableSuggestions &&
        (page > 1 || !isNewSearch);

      const params = {
        query: query,
        offset: (page - 1) * papersPerPage,
        limit: papersPerPage,
        enableTranslation: canReuseSuggestions ? false : enableSuggestions,
        source: effectiveSource,
        fields: ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      };

      if (canReuseSuggestions) {
        logger.log('[Search] Reusing cached suggestions:', cachedSuggestions);
      }

      // 添加筛选条件
      if (currentFilters.yearFrom || currentFilters.yearTo) {
        params.yearFrom = currentFilters.yearFrom;
        params.yearTo = currentFilters.yearTo;
      }
      if (currentFilters.publicationTypes?.length > 0) {
        params.publicationTypes = currentFilters.publicationTypes;
      }
      if (currentFilters.fieldsOfStudy?.length > 0) {
        params.fieldsOfStudy = currentFilters.fieldsOfStudy;
      }
      if (currentFilters.openAccessPdf) {
        params.openAccessPdf = currentFilters.openAccessPdf;
      }
      if (currentFilters.venue) {
        params.venue = [currentFilters.venue];
      }
      if (currentFilters.minCitationCount) {
        params.minCitationCount = parseInt(currentFilters.minCitationCount, 10);
      }
      // sort 在后端透传到上游 minicod（relevance | citations | date）。
      // 注意 STC 的 relevance 端点忽略 sort，只在 citations/date 时真正生效。
      if (currentFilters.sort && currentFilters.sort !== 'relevance') {
        params.sort = currentFilters.sort;
      }

      const response = await publicScholarAPI.searchPapers(params, { signal: controller.signal });

      if (response.data.code === 0 && response.data.data) {
        const responseData = response.data.data;
        const searchResults = responseData.data?.data || [];
        const resultsTotal = responseData.data?.total || 0;

        setPapers(searchResults);
        setTotal(resultsTotal);

        let finalQueryInfo;
        if (canReuseSuggestions) {
          finalQueryInfo = {
            originalQuery: query,
            searchSuggestions: cachedSuggestions.suggestions,
            actualQuery: cachedSuggestions.actual,
            hasSuggestions: true,
            searchStrategy: 'original'
          };
        } else {
          finalQueryInfo = {
            originalQuery: responseData.originalQuery || query,
            searchSuggestions: responseData.searchSuggestions || [],
            actualQuery: responseData.actualQuery || query,
            hasSuggestions: responseData.hasSuggestions || false,
            searchStrategy: responseData.searchStrategy || ''
          };

          if (responseData.hasSuggestions && responseData.searchSuggestions?.length > 0) {
            setCachedSuggestions({
              query: query,
              suggestions: responseData.searchSuggestions,
              actual: responseData.actualQuery
            });
          }
        }

        setQueryInfo(finalQueryInfo);

        // 缓存搜索结果（用于翻页回退和返回列表时复用）
        searchResultsCache.set(cacheKey, {
          papers: searchResults,
          total: resultsTotal,
          queryInfo: finalQueryInfo,
        });

        // SEO 曝光上报：把搜索命中喂进 seo_papers / seo_authors 的 tier=2 长尾池。
        // sendBeacon 非阻塞，失败静默；后端自行做 batch 上限与去重。
        try {
          const paperSlice = (searchResults || []).slice(0, 20);
          const seeds = paperSlice
            .filter((p) => p?.paperId && p?.title)
            .map((p) => ({
              paper_id: p.paperId,
              title: p.title,
              abstract: p.abstract || '',
              year: typeof p.year === 'number' ? p.year : undefined,
              venue: p.venue || '',
              doi: p.externalIds?.DOI || '',
              authors: Array.isArray(p.authors)
                ? p.authors.slice(0, 10).map((a) => ({
                    name: a?.name || '',
                    authorId: a?.authorId || '',
                  }))
                : [],
              fields_of_study: Array.isArray(p.fieldsOfStudy) ? p.fieldsOfStudy.slice(0, 8) : [],
              source: effectiveSource || 'semantic',
            }));

          // 从同一批论文中抽取作者去重 (authorId 维度) -> 批量喂进 seo_authors
          const authorMap = new Map();
          for (const p of paperSlice) {
            if (!Array.isArray(p?.authors)) continue;
            for (const a of p.authors) {
              const id = a?.authorId;
              const name = a?.name;
              if (!id || !name) continue;
              if (!authorMap.has(id)) {
                authorMap.set(id, {
                  author_id: id,
                  name,
                  source: effectiveSource || 'semantic',
                });
              }
            }
          }
          const authorSeeds = Array.from(authorMap.values()).slice(0, 50);

          if (seeds.length > 0 || authorSeeds.length > 0) {
            publicScholarAPI.reportSEOExposure(seeds, authorSeeds);
          }
        } catch (seoErr) {
          logger.log('[SEO] exposure report skipped:', seoErr?.message);
        }
      }
    } catch (error) {
      // 用户触发新搜索导致的主动取消：静默忽略，不要弹 alert 骚扰
      if (controller.signal.aborted || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
        logger.log('[Search] aborted by newer request');
        return;
      }
      logger.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      // 仅当当前 controller 仍是"最新飞行"时才复位 loading 和 ref
      // 如果已被更新的 performSearch 覆盖，则由新调用负责 loading 状态
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [cachedSuggestions, papersPerPage, buildSearchCacheKey, searchSource]);

  // 处理搜索提交
  const handleSearch = useCallback((e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setShowSuggestions(false);
    setIsInputSingleLine(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setCurrentPage(1);

    // 如果搜索词变化，清空缓存的建议
    if (cachedSuggestions.query !== searchQuery) {
      setCachedSuggestions({ query: '', suggestions: [], actual: '' });
      setQueryInfo({
        originalQuery: '',
        searchSuggestions: [],
        actualQuery: '',
        hasSuggestions: false
      });
    }

    trackDirectSearch(searchQuery, EntryPoint.SEARCH_RESULTS_PAGE);
    updateURL(searchQuery, filters, 1);
    performSearch(searchQuery, filters, 1);
  }, [searchQuery, cachedSuggestions.query, filters, updateURL, performSearch]);

  // 应用筛选条件
  const applyFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    saveSearchFilters(newFilters);

    if (searchQuery.trim()) {
      setCurrentPage(1);
      updateURL(searchQuery, newFilters, 1);
      performSearch(searchQuery, newFilters, 1);
    }
  }, [searchQuery, updateURL, performSearch]);

  // 监听抽屉里"筛选器"的 auto-apply 事件 —— 任何变动 debounce 后会派发
  // 'searchFilters:changed' detail=newFilters，这里同步到本 hook 的 filters 并重搜。
  useEffect(() => {
    const handler = (ev) => {
      const next = ev?.detail;
      if (next && typeof next === 'object') {
        applyFilters(next);
      }
    };
    window.addEventListener('searchFilters:changed', handler);
    return () => window.removeEventListener('searchFilters:changed', handler);
  }, [applyFilters]);

  // 处理分页
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    updateURL(searchQuery, filters, newPage);
    performSearch(searchQuery, filters, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchQuery, filters, updateURL, performSearch]);

  // 处理每页数量变化
  const handlePageSizeChange = useCallback((newSize) => {
    setPapersPerPage(newSize);
    localStorage.setItem('papersPerPage', newSize.toString());
    setCurrentPage(1);
    performSearch(searchQuery, filters, 1);
  }, [searchQuery, filters, performSearch]);

  // 切换到普通搜索模式
  const handleSwitchToNormal = useCallback(() => {
    saveSearchMode('normal');
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('mode');
      return newParams;
    });
  }, [setSearchParams]);

  // 切换到AI智能分析模式（带动画过渡）
  const handleSwitchToAI = useCallback(() => {
    if (!searchQuery.trim()) return;

    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (searchFormRef.current) {
      const rect = searchFormRef.current.getBoundingClientRect();
      setSearchBoxRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }

    setIsTransitioningToAI(true);
    saveSearchQuery(searchQuery);
    saveSearchMode('ai');
    setAIConversationId(null);
  }, [searchQuery, isAuthenticated]);

  // 过渡动画完成后的回调
  const handleTransitionComplete = useCallback(() => {
    setIsTransitioningToAI(false);
    setSearchBoxRect(null);
    setJustSwitchedToAI(true);

    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('mode', 'ai');
      return newParams;
    });

    setTimeout(() => {
      setJustSwitchedToAI(false);
    }, 3000);
  }, [setSearchParams]);

  // 处理论文点击
  const handlePaperClick = useCallback((paper) => {
    setSelectedPaper(paper);
    setShowPaperDrawer(true);
  }, []);

  // 关闭论文预览抽屉
  const handleClosePaperDrawer = useCallback(() => {
    setShowPaperDrawer(false);
    setSelectedPaper(null);
  }, []);

  // 处理相似论文 Tab 点击
  const handleSimilarTabClick = useCallback(() => {
    hasClickedSimilarTabRef.current = true;
    localStorage.setItem('similarPapersGuideShown', 'true');
  }, []);

  return {
    // 路由相关
    searchParams,
    setSearchParams,
    navigate,

    // 认证相关
    isAuthenticated,
    isMobile,
    showAuthModal,
    setShowAuthModal,

    // AI 模式相关
    isAIMode,
    isTransitioningToAI,
    setIsTransitioningToAI,
    justSwitchedToAI,
    searchBoxRect,
    searchFormRef,
    handleSwitchToNormal,
    handleSwitchToAI,
    handleTransitionComplete,

    // 数据源
    searchSource,
    setSearchSource,

    // 搜索相关
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    showFilters,
    setShowFilters,
    queryInfo,
    performSearch,
    handleSearch,
    applyFilters,
    updateURL,

    // 论文列表
    papers,
    setPapers,
    total,
    setTotal,
    loading,
    setLoading,

    // 选中和引用
    selectedPaper,
    setSelectedPaper,
    citePaper,
    setCitePaper,
    showPaperDrawer,
    setShowPaperDrawer,
    handlePaperClick,
    handleClosePaperDrawer,

    // 展开/折叠状态
    expandedTldr,
    expandedAbstract,
    showAbstractMode,
    setShowAbstractMode,
    toggleTldrExpand,
    toggleAbstractExpand,

    // 分页
    currentPage,
    setCurrentPage,
    papersPerPage,
    handlePageChange,
    handlePageSizeChange,

    // 视图模式
    viewMode,
    setViewMode,
    initState,

    // 轮播
    currentExampleIndex,
    setCurrentExampleIndex,

    // 输入相关
    isComposing,
    setIsComposing,
    isInputSingleLine,
    setIsInputSingleLine,
    showSuggestions,
    setShowSuggestions,
    showDetailSearch,
    setShowDetailSearch,

    // Refs
    resultsMainRef,
    papersContainerRef,
    similarPapersListRef,
    similarPapersTabRef,
    textareaRef,
    returnedFromLogin,
    returnedToSimilarTable,
    hasClickedSimilarTabRef,
    hasClickedSimilarTableBtnRef,
    hasClickedAuthorTableBtnRef,
    hasClickedTableBtnRef,
    handleSimilarTabClick,

    // 工具函数
    getAIModelLevel,
  };
};

export default useSearchState;

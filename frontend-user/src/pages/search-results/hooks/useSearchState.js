/**
 * 搜索结果核心状态管理 Hook
 * 管理搜索查询、论文列表、分页、筛选等核心状态
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../utils/AuthContext';
import { useSidebar } from '../../../contexts/SidebarContext';
import { publicScholarAPI } from '../../../services/api';
import {
  getSearchQuery,
  setSearchQuery as saveSearchQuery,
  getSearchFilters,
  setSearchFilters as saveSearchFilters,
  setSearchMode as saveSearchMode,
  getAIModelLevel,
  setAIConversationId
} from '../../../utils/searchStorage';
import { trackAcademicSearch, EntryPoint } from '../../../utils/usageTracker';
import logger from '../../../utils/logger';

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

  // 论文列表状态
  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 查询信息状态
  const [queryInfo, setQueryInfo] = useState({
    originalQuery: '',
    translatedQuery: '',
    actualQuery: '',
    translationEnabled: false,
    searchStrategy: ''
  });

  // 翻译缓存
  const [cachedTranslation, setCachedTranslation] = useState({
    query: '',
    translated: '',
    actual: '',
    searchStrategy: ''
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

  // 执行搜索
  const performSearch = useCallback(async (query, currentFilters, page = 1, isNewSearch = true, enableTranslation = true) => {
    if (!query.trim()) return;

    if (returnedFromLogin.current) {
      returnedFromLogin.current = false;
    } else {
      setViewMode('list');
    }

    setLoading(true);
    setSelectedPaper(null);

    try {
      const canReuseTranslation =
        cachedTranslation.query === query &&
        cachedTranslation.translated &&
        enableTranslation &&
        (page > 1 || !isNewSearch);

      const params = {
        query: query,
        offset: (page - 1) * papersPerPage,
        limit: papersPerPage,
        enableTranslation: canReuseTranslation ? false : enableTranslation,
        fields: ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      };

      if (canReuseTranslation) {
        logger.log('[Search] Reusing cached translation:', cachedTranslation);
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

      const response = await publicScholarAPI.searchPapers(params);

      if (response.data.code === 0 && response.data.data) {
        const responseData = response.data.data;
        const searchResults = responseData.data?.data || [];
        const resultsTotal = responseData.data?.total || 0;

        setPapers(searchResults);
        setTotal(resultsTotal);

        let finalQueryInfo;
        if (canReuseTranslation) {
          finalQueryInfo = {
            originalQuery: query,
            translatedQuery: cachedTranslation.translated,
            actualQuery: cachedTranslation.actual,
            translationEnabled: true,
            searchStrategy: cachedTranslation.searchStrategy || 'combined'
          };
        } else {
          finalQueryInfo = {
            originalQuery: responseData.originalQuery || query,
            translatedQuery: responseData.translatedQuery || '',
            actualQuery: responseData.actualQuery || query,
            translationEnabled: responseData.translationEnabled || false,
            searchStrategy: responseData.searchStrategy || ''
          };

          if (responseData.translationEnabled && responseData.translatedQuery) {
            setCachedTranslation({
              query: query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery,
              searchStrategy: responseData.searchStrategy || 'combined'
            });
          }
        }

        setQueryInfo(finalQueryInfo);
      }
    } catch (error) {
      logger.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  }, [cachedTranslation, papersPerPage]);

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

    if (cachedTranslation.query !== searchQuery) {
      setCachedTranslation({ query: '', translated: '', actual: '' });
      setQueryInfo({
        originalQuery: '',
        translatedQuery: '',
        actualQuery: '',
        translationEnabled: false
      });
    }

    trackAcademicSearch(EntryPoint.RESULT_PAGE, searchQuery);
    updateURL(searchQuery, filters, 1);
    performSearch(searchQuery, filters, 1);
  }, [searchQuery, cachedTranslation.query, filters, updateURL, performSearch]);

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
    updateURL,
    getAIModelLevel,
  };
};

export default useSearchState;

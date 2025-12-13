/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { Menu, List, Table2 } from 'lucide-react';
import { publicScholarAPI } from '../services/api';
import PaperPreview from '../components/PaperPreview';
import SearchFilters from '../components/SearchFilters';
import PaperListSkeleton from '../components/PaperListSkeleton';
import PaperDetailSkeleton from '../components/PaperDetailSkeleton';
import CiteModal from '../components/CiteModal';
import PaperTableView from '../components/PaperTableView';
import TableColumnPanel from '../components/TableColumnPanel';
import TableViewGuide from '../components/TableViewGuide';
import SimilarPapersGuide from '../components/SimilarPapersGuide';
import SearchSuggestions from '../components/SearchSuggestions';
import { NormalSearchIcon, AdvancedSearchIcon } from '../components/SearchIcons';
import { getFormattedSearchHistory, addSearchHistory, deleteSearchHistory, renameSearchHistory, migrateOldSearchHistory } from '../utils/searchHistory';
import SEO from '../components/SEO';
import { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from '../utils/seoHelpers';
import ThemeToggle from '../components/ThemeToggle';
import './styles/search-results/index.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('../components/AuthModal'));

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { updateSidebarConfig, isMobile, openMobileSidebar } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;

  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 搜索历史状态
  const [searchHistory, setSearchHistory] = useState([]);

  // Placeholder examples carousel - 轮播提示
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  
  // 搜索示例数据 - 覆盖多个学科领域
  const searchExamples = [
    '搜索论文标题、作者、关键词...',                                    // 说明文字
    '示例：深度学习在医学影像诊断中的应用',                             // 计算机+医学
    '示例：量子纠缠在量子通信中的研究',                                 // 物理学
    '示例：CRISPR基因编辑技术的伦理问题',                              // 生物+伦理
    '示例：碳纳米管在新能源电池中的应用',                               // 材料+化学
    '示例：行为经济学对消费决策的影响',                                 // 经济学+心理学
    '示例：气候变化对海洋生态系统的影响',                               // 环境+生态
    '示例：人工智能在药物研发中的应用',                                 // AI+医药
    '示例：区块链技术在供应链管理中的创新',                             // 计算机+管理
    '示例：纳米机器人在精准医疗中的前景',                               // 工程+医学
    '示例：社交媒体对青少年心理健康的影响'                              // 社会学+心理学
  ];

  // 从URL参数初始化状态
  const [searchQuery, setSearchQuery] = useState(searchParams.get('query') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    yearFrom: searchParams.get('yearFrom') || '',
    yearTo: searchParams.get('yearTo') || '',
    publicationTypes: searchParams.get('publicationTypes')?.split(',').filter(Boolean) || [],
    fieldsOfStudy: searchParams.get('fieldsOfStudy')?.split(',').filter(Boolean) || [],
    openAccessPdf: searchParams.get('openAccessPdf') || '',
    venue: searchParams.get('venue') || '',
    minCitationCount: searchParams.get('minCitationCount') || '',
  });

  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 查询信息状态
  const [queryInfo, setQueryInfo] = useState({
    originalQuery: '',
    translatedQuery: '',
    actualQuery: '',
    translationEnabled: false,
    searchStrategy: '' // combined, original, translated
  });
  
  // 当前查询的翻译缓存（用于筛选和分页时复用，避免重复翻译）
  const [cachedTranslation, setCachedTranslation] = useState({
    query: '',           // 缓存的查询
    translated: '',      // 翻译结果
    actual: '',          // 实际使用的查询
    searchStrategy: ''   // 搜索策略: combined, original, translated
  });
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [citePaper, setCitePaper] = useState(null);
  const [expandedTldr, setExpandedTldr] = useState({}); // TLDR 展开状态
  const [expandedAbstract, setExpandedAbstract] = useState({}); // 摘要展开状态
  const [currentPage, setCurrentPage] = useState(1);
  
  // 切换 TLDR 展开/折叠
  const toggleTldrExpand = (paperId) => {
    setExpandedTldr(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  };
  
  // 切换摘要展开/折叠
  const toggleAbstractExpand = (paperId) => {
    setExpandedAbstract(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  };
  const [papersPerPage, setPapersPerPage] = useState(() => {
    const saved = localStorage.getItem('papersPerPage');
    return saved ? parseInt(saved, 10) : 50; // 默认50条/页
  });

  const PREVIEW_MIN_WIDTH = 320;
  const PREVIEW_MAX_WIDTH = 800;

  const clampPreviewWidth = useCallback((value, viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920) => {
    const calculatedMax = Math.min(PREVIEW_MAX_WIDTH, Math.floor(viewportWidth * 0.65));
    const safeMax = Math.max(PREVIEW_MIN_WIDTH, calculatedMax);
    const safeMin = Math.min(PREVIEW_MIN_WIDTH, safeMax);
    const target = Number.isFinite(value) ? value : 480;
    return Math.min(Math.max(target, safeMin), safeMax);
  }, [PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH]);

  // 默认预览面板宽度为内容区域的1/3（考虑侧边栏）
  const getDefaultPreviewWidth = useCallback(() => {
    if (typeof window !== 'undefined') {
      // 侧边栏宽度：展开280px，收起64px，未登录0px
      const sidebarWidth = 280; // 假设侧边栏展开
      const contentWidth = window.innerWidth - sidebarWidth;
      return clampPreviewWidth(Math.floor(contentWidth / 3));
    }
    return clampPreviewWidth(480);
  }, [clampPreviewWidth]);

  const [previewWidth, setPreviewWidth] = useState(getDefaultPreviewWidth);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false));

  const resultsMainRef = useRef(null);
  const papersContainerRef = useRef(null);
  const tableViewBtnRef = useRef(null); // 表格视图按钮引用
  const similarPapersListRef = useRef(null); // 相似论文列表引用
  const similarPapersTabRef = useRef(null); // 相似论文 Tab 引用
  const textareaRef = useRef(null); // 搜索输入框引用（用于搜索建议定位）
  const emptyTextareaRef = useRef(null); // 空状态搜索输入框引用
  const [selectedHistoryId, setSelectedHistoryId] = useState(null); // 选中的搜索历史ID
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const [isSearchBarCollapsed, setIsSearchBarCollapsed] = useState(false); // 搜索框滚动收缩状态
  const [isInputSingleLine, setIsInputSingleLine] = useState(() => {
    // 如果 URL 中有搜索查询，初始状态为单行显示
    const urlParams = new URLSearchParams(window.location.search);
    return !!urlParams.get('query');
  }); // 输入框单行/多行显示状态
  const [showSuggestions, setShowSuggestions] = useState(false); // 搜索建议下拉框
  // 检查是否需要返回表格视图（从登录后跳转回来）
  const returnedFromLogin = useRef(false);
  const returnedToSimilarTable = useRef(false); // 标记是否从相似论文表格视图登录返回
  
  // 在组件初始化时一次性读取所有 localStorage 值，避免重复读取和时序问题
  // 使用立即执行函数确保只执行一次
  const initState = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasPaperId = !!urlParams.get('paperId');
    const hasAuthorId = !!urlParams.get('authorId');
    const returnToTable = localStorage.getItem('returnToTableView') === 'true';
    const returnToSimilarTableFlag = localStorage.getItem('returnToSimilarPapersTable') === 'true';
    
    // 清除 localStorage 标记
    if (returnToTable) {
      localStorage.removeItem('returnToTableView');
    }
    if (returnToSimilarTableFlag) {
      localStorage.removeItem('returnToSimilarPapersTable');
    }
    
    console.log('[SearchResultsPage] initState:', { hasPaperId, hasAuthorId, returnToTable, returnToSimilarTableFlag });
    
    return {
      hasPaperId,
      hasAuthorId,
      returnToTable,
      returnToSimilarTable: returnToSimilarTableFlag,
    };
  }, []);
  
  // 设置 ref 标记（在渲染阶段之外）
  useEffect(() => {
    if (initState.returnToTable) {
      returnedFromLogin.current = true;
    }
    if (initState.returnToSimilarTable) {
      returnedToSimilarTable.current = true;
    }
  }, [initState]);
  
  const [viewMode, setViewMode] = useState(() => {
    // 检查URL中是否有authorId参数，如果有则显示作者详情视图
    if (initState.hasAuthorId) {
      return 'author';
    }
    // 检查URL中是否有paperId参数，如果有则显示论文详情视图
    if (initState.hasPaperId) {
      return 'paper';
    }
    if (initState.returnToTable) {
      // 如果是从相似论文表格视图登录返回，需要进入论文详情视图
      if (initState.returnToSimilarTable) {
        return 'paper'; // 进入论文详情视图
      }
      return 'table';
    }
    return 'list';
  }); // 视图模式: 'list', 'table', 'paper' 或 'author'
  const [selectedDimensionKey, setSelectedDimensionKey] = useState(null); // 表格视图中选中的维度
  const [tableReloadTrigger, setTableReloadTrigger] = useState(null); // 触发表格重新加载
  const [showTableGuide, setShowTableGuide] = useState(false); // 表格视图引导弹窗

  // 论文详情视图相关状态
  const [showDetailSearch, setShowDetailSearch] = useState(false); // 论文详情页搜索框显示状态
  const [detailPaper, setDetailPaper] = useState(null); // 选中的论文详情数据
  const [detailPaperId, setDetailPaperId] = useState(null); // 选中的论文ID
  const [detailLoading, setDetailLoading] = useState(false); // 论文详情加载状态
  const [detailError, setDetailError] = useState(null); // 论文详情错误状态

  // 作者详情视图相关状态
  const [detailAuthor, setDetailAuthor] = useState(null); // 选中的作者详情数据
  const [detailAuthorId, setDetailAuthorId] = useState(null); // 选中的作者ID
  const [authorLoading, setAuthorLoading] = useState(false); // 作者详情加载状态
  const [authorError, setAuthorError] = useState(null); // 作者详情错误状态
  const [authorPapers, setAuthorPapers] = useState([]); // 作者论文列表
  const [authorPapersLoading, setAuthorPapersLoading] = useState(false); // 作者论文加载状态
  const [authorPapersPage, setAuthorPapersPage] = useState(1); // 作者论文当前页
  const [authorPapersTotalPages, setAuthorPapersTotalPages] = useState(0); // 作者论文总页数
  const [authorPapersTotal, setAuthorPapersTotal] = useState(0); // 作者论文总数
  const [authorPapersPerPage] = useState(20); // 每页论文数
  const [authorPapersViewMode, setAuthorPapersViewMode] = useState('list'); // 作者论文视图模式: 'list' 或 'table'
  const [allAuthorPapers, setAllAuthorPapers] = useState([]); // 表格视图累积的所有论文（用于表格视图）
  // authorSelectedPaper 已移除，统一使用 selectedPaper
  const [authorActiveTab, setAuthorActiveTab] = useState('publications'); // 作者详情 Tab: 'publications', 'citingAuthors', 'coAuthors'
  const [detailActiveTab, setDetailActiveTab] = useState(() => {
    // 如果是从相似论文表格视图登录返回，默认选中相似论文 tab
    if (initState.returnToSimilarTable) {
      return 'similar';
    }
    return 'citations';
  }); // 详情页 Tab: 'citations', 'references' 或 'similar'
  const [detailHeaderCollapsed, setDetailHeaderCollapsed] = useState(() => {
    // 如果是从相似论文表格视图登录返回，默认收起头部（与点击相似论文 tab 行为一致）
    if (initState.returnToSimilarTable) {
      return true;
    }
    return false;
  }); // 论文详情头部折叠状态
  const [detailCopiedDoi, setDetailCopiedDoi] = useState(false); // DOI复制状态
  const [detailCopiedCorpusId, setDetailCopiedCorpusId] = useState(false); // CorpusId复制状态
  const [detailAbstractExpanded, setDetailAbstractExpanded] = useState(false); // 摘要展开状态
  
  // 引用/参考文献分页加载状态
  const [citationsData, setCitationsData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [referencesData, setReferencesData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [citationsLoading, setCitationsLoading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const REFS_PER_PAGE = 10; // 每页显示的引用/参考文献数量
  
  // 相似论文状态
  const [similarPapersData, setSimilarPapersData] = useState({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
  const [similarPapersLoading, setSimilarPapersLoading] = useState(false);
  const [similarPapersViewMode, setSimilarPapersViewMode] = useState(() => {
    // 如果是从相似论文表格视图登录返回，默认使用表格视图
    if (initState.returnToSimilarTable) {
      return 'table';
    }
    return 'list';
  }); // 'list' 或 'table'
  const [allSimilarPapers, setAllSimilarPapers] = useState([]); // 存储所有相似论文数据（用于分页）
  const [similarSelectedDimensionKey, setSimilarSelectedDimensionKey] = useState(null); // 相似论文表格视图选中的维度
  const [similarTableReloadTrigger, setSimilarTableReloadTrigger] = useState(null); // 相似论文表格视图重新加载触发器
  const [showSimilarPapersGuide, setShowSimilarPapersGuide] = useState(false); // 相似论文新手引导
  const [showSimilarTableGuide, setShowSimilarTableGuide] = useState(false); // 相似论文表格视图引导
  const hasClickedSimilarTabRef = useRef(false); // 标记用户是否已点击过相似论文标签
  const hasClickedSimilarTableBtnRef = useRef(false); // 标记用户是否已点击过相似论文表格按钮
  const similarTableBtnRef = useRef(null); // 相似论文表格按钮的 ref
  
  // 作者页面表格引导相关
  const [showAuthorTableGuide, setShowAuthorTableGuide] = useState(false); // 作者页面表格视图引导
  const hasClickedAuthorTableBtnRef = useRef(false); // 标记用户是否已点击过作者页面表格按钮
  const authorTableBtnRef = useRef(null); // 作者页面表格按钮的 ref

  // 处理维度选择（表格列头点击）- 同时关闭预览
  const handleDimensionSelect = useCallback((key) => {
    setSelectedDimensionKey(key);
    // 点击列头时关闭预览，显示列配置面板
    setSelectedPaper(null);
  }, []);

  // 处理相似论文维度选择（表格列头点击）- 同时关闭预览
  const handleSimilarDimensionSelect = useCallback((key) => {
    setSimilarSelectedDimensionKey(key);
    // 点击列头时关闭预览，显示列配置面板
    setSelectedPaper(null);
  }, []);

  // 处理表格中论文点击 - 同时清除列选中状态
  const handleTablePaperClick = useCallback((paper) => {
    setSelectedPaper(paper);
    // 点击论文时清除列选中状态，右侧显示论文详情
    setSelectedDimensionKey(null);
  }, []);

  // 处理相似论文表格中论文点击 - 同时清除列选中状态
  const handleSimilarTablePaperClick = useCallback((paper) => {
    setSelectedPaper(paper);
    // 点击论文时清除列选中状态，右侧显示论文详情
    setSimilarSelectedDimensionKey(null);
  }, []);

  // 处理维度更新（编辑或新增）
  const handleDimensionsUpdated = useCallback((action, dimensionName) => {
    // 设置重新加载触发器
    setTableReloadTrigger({
      action,
      dimensionName,
      timestamp: Date.now()
    });
    // 清除选中的维度
    setSelectedDimensionKey(null);
  }, []);

  // 处理相似论文维度更新（编辑或新增）
  const handleSimilarDimensionsUpdated = useCallback((action, dimensionName) => {
    // 设置重新加载触发器
    setSimilarTableReloadTrigger({
      action,
      dimensionName,
      timestamp: Date.now()
    });
    // 清除选中的维度
    setSimilarSelectedDimensionKey(null);
  }, []);

  // 处理相似论文 Tab 点击 - 用户主动点击说明已了解该功能，标记为已看过
  const handleSimilarTabClick = useCallback(() => {
    // 用户主动点击相似论文标签，说明已经知道这个功能了
    // 标记为已点击，阻止后续引导显示
    hasClickedSimilarTabRef.current = true;
    // 标记为已看过，下次不再显示引导
    localStorage.setItem('similarPapersGuideShown', 'true');
    // 如果引导正在显示，关闭它
    setShowSimilarPapersGuide(false);
  }, []);


  // 执行搜索
  const performSearch = async (query, currentFilters, page = 1, saveToHistory = true, enableTranslation = true) => {
    if (!query.trim()) return;

    // 搜索时自动切换回列表视图（除非是从登录返回的）
    if (returnedFromLogin.current) {
      // 从登录返回时，保持表格视图，只在第一次搜索时跳过重置
      returnedFromLogin.current = false;
    } else {
      setViewMode('list');
    }

    setLoading(true);
    // 重置右侧预览面板
    setSelectedPaper(null);
    setPreviewWidth(getDefaultPreviewWidth());
    try {
      // 检查是否可以复用缓存的翻译结果
      // 条件：查询词相同 && 不是第一次搜索 && 不是禁用翻译的搜索
      const canReuseTranslation = 
        cachedTranslation.query === query && 
        cachedTranslation.translated && 
        enableTranslation &&
        (page > 1 || saveToHistory === false); // 分页或筛选时复用
      
      const params = {
        query: query,
        offset: (page - 1) * papersPerPage,
        limit: papersPerPage,
        // 如果可以复用缓存，禁用后端翻译；否则根据参数决定
        enableTranslation: canReuseTranslation ? false : enableTranslation,
        fields: ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      };
      
      if (canReuseTranslation) {
        console.log('[Search] Reusing cached translation:', cachedTranslation);
      }

      // 添加筛选条件
      if (currentFilters.yearFrom || currentFilters.yearTo) {
        params.yearFrom = currentFilters.yearFrom;
        params.yearTo = currentFilters.yearTo;
      }

      if (currentFilters.publicationTypes && currentFilters.publicationTypes.length > 0) {
        params.publicationTypes = currentFilters.publicationTypes;
      }

      if (currentFilters.fieldsOfStudy && currentFilters.fieldsOfStudy.length > 0) {
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

      // 使用公共API，支持未登录用户访问
      const response = await publicScholarAPI.searchPapers(params);

      if (response.data.code === 0 && response.data.data) {
        const responseData = response.data.data;
        const searchResults = responseData.data?.data || [];
        const resultsTotal = responseData.data?.total || 0;
        
        setPapers(searchResults);
        setTotal(resultsTotal);
        
        // 如果是复用缓存的情况，使用缓存的查询信息
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
          
          // 如果是新的翻译结果，更新缓存
          if (responseData.translationEnabled && responseData.translatedQuery) {
            setCachedTranslation({
              query: query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery,
              searchStrategy: responseData.searchStrategy || 'combined'
            });
            console.log('[Search] Cached new translation:', {
              query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery,
              searchStrategy: responseData.searchStrategy
            });
          }
        }
        
        // 保存查询信息用于展示
        setQueryInfo(finalQueryInfo);

        // 只有在saveToHistory为true且用户已登录时才添加到搜索历史
        if (saveToHistory && isAuthenticated && user?.id) {
          const historyItem = addSearchHistory(query, currentFilters, resultsTotal, user.id);
          loadSearchHistory();
          // 自动选中刚添加的历史记录
          if (historyItem && historyItem.id) {
            setSelectedHistoryId(historyItem.id);
          }
        }
      }
    } catch (error) {
      console.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 加载搜索历史 (当用户切换时重新加载)
  useEffect(() => {
    // 首次加载时尝试迁移旧的搜索历史
    if (user?.id) {
      migrateOldSearchHistory(user.id);
    }
    loadSearchHistory();
  }, [user?.id]);

  const loadSearchHistory = () => {
    const history = getFormattedSearchHistory(user?.id);
    setSearchHistory(history);
  };

  // 搜索示例轮播效果
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex((prevIndex) => (prevIndex + 1) % searchExamples.length);
    }, 3000); // 每3秒切换一次

    return () => clearInterval(interval);
  }, [searchExamples.length]);

  const handleSelectSearchHistory = (itemId) => {
    const history = searchHistory.find(h => h.id === itemId);
    if (history) {
      setSelectedHistoryId(itemId); // 设置选中的历史记录ID
      // 搜索框始终显示真正的搜索词（query），而不是重命名后的displayName
      // 这样用户可以看到实际搜索的内容，也方便继续修改
      setSearchQuery(history.query);
      setFilters(history.filters || {
        yearFrom: '',
        yearTo: '',
        publicationTypes: [],
        fieldsOfStudy: [],
        openAccessPdf: '',
        venue: '',
        minCitationCount: '',
      });
      setCurrentPage(1);
      updateURL(history.query, history.filters, 1);
      performSearch(history.query, history.filters, 1, false); // 从历史记录搜索,不保存到历史记录
    }
  };

  const handleDeleteSearchHistory = (itemId) => {
    deleteSearchHistory(itemId, user?.id);
    loadSearchHistory();
  };

  const handleRenameSearchHistory = (itemId, newTitle) => {
    renameSearchHistory(itemId, newTitle, user?.id);
    loadSearchHistory();
  };

  // 更新侧边栏配置 - 只在用户登录时
  useEffect(() => {
    if (isAuthenticated) {
      updateSidebarConfig({
        showHistory: true,
        historyType: 'search',
        historyItems: searchHistory,
        currentItemId: selectedHistoryId,
        onSelectItem: handleSelectSearchHistory,
        onDeleteItem: handleDeleteSearchHistory,
        onRenameItem: handleRenameSearchHistory,
        onNewItem: null,
        historyLoading: false,
      });
    }
  }, [searchHistory, selectedHistoryId, updateSidebarConfig, isAuthenticated]);

  // 不再需要认证检查 - 允许未登录用户访问

  // 加载论文详情的函数
  const loadPaperDetail = useCallback(async (paperId) => {
    if (!paperId) return;
    
    console.log('[SearchResultsPage] Loading paper detail:', paperId);
    setViewMode('paper');
    setDetailPaperId(paperId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailPaper(null);
    setDetailAbstractExpanded(false); // 重置摘要展开状态
    
    try {
      // 使用公共 API，支持未登录用户访问
      const response = await publicScholarAPI.getPaper(paperId);
      console.log('[SearchResultsPage] Paper detail loaded:', response.data);
      // API 返回格式是 {code: 0, message: 'success', data: {...}}，需要取 data.data
      setDetailPaper(response.data.data);
      setDetailLoading(false);
    } catch (error) {
      console.error('[SearchResultsPage] Failed to load paper details:', error);
      setDetailError('加载论文详情失败');
      setDetailLoading(false);
    }
  }, []);

  // 加载作者详情的函数
  const loadAuthorDetail = useCallback(async (authorId, page = 1) => {
    if (!authorId) return;
    
    console.log('[SearchResultsPage] Loading author detail:', authorId, 'page:', page);
    setViewMode('author');
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
        publicScholarAPI.getAuthorPapers(authorId, offset, perPage, 'paperId') // 只获取 paperId
      ]);
      
      if (page === 1 && authorResponse) {
        console.log('[SearchResultsPage] Author detail loaded:', authorResponse.data);
        if (authorResponse.data.code === 0 && authorResponse.data.data) {
          setDetailAuthor(authorResponse.data.data);
          // 计算总页数
          const totalPapers = authorResponse.data.data.paperCount || 0;
          const totalPages = Math.ceil(totalPapers / perPage);
          console.log('[SearchResultsPage] Total papers:', totalPapers, 'Total pages:', totalPages);
          setAuthorPapersTotal(totalPapers);
          setAuthorPapersTotalPages(totalPages);
        } else {
          throw new Error('Failed to load author details');
        }
      }
      
      // Step 2: 用论文ID批量获取完整论文详情
      if (papersIdsResponse.data.code === 0 && papersIdsResponse.data.data) {
        const paperIds = (papersIdsResponse.data.data.data || []).map(p => p.paperId).filter(id => id);
        console.log('[SearchResultsPage] Paper IDs:', paperIds);
        
        if (paperIds.length > 0) {
          const batchResponse = await publicScholarAPI.getPaperBatch(
            paperIds,
            ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
          );
          
          console.log('[SearchResultsPage] Batch response:', batchResponse.data);
          if (batchResponse.data.code === 0 && batchResponse.data.data) {
            const papersData = batchResponse.data.data || [];
            console.log('[SearchResultsPage] Papers data length:', papersData.length);
            console.log('[SearchResultsPage] First paper:', papersData[0]);
            setAuthorPapers(papersData);
          } else {
            console.log('[SearchResultsPage] Batch response failed:', batchResponse.data);
          }
        } else {
          setAuthorPapers([]);
        }
      }
      
      setAuthorLoading(false);
    } catch (error) {
      console.error('[SearchResultsPage] Failed to load author details:', error);
      setAuthorError('加载作者详情失败');
      setAuthorLoading(false);
    }
  }, []);

  // 作者论文分页切换
  const handleAuthorPapersPageChange = useCallback((newPage) => {
    if (newPage < 1 || newPage > authorPapersTotalPages || newPage === authorPapersPage) return;
    loadAuthorDetail(detailAuthorId, newPage);
  }, [detailAuthorId, authorPapersTotalPages, authorPapersPage, loadAuthorDetail]);

  // 作者论文表格视图 - 加载更多（累积加载，与相似论文逻辑一致）
  const loadMoreAuthorPapersForTable = useCallback(async () => {
    if (!detailAuthorId || authorPapersLoading) return;
    
    // 计算下一页
    const currentLoadedPages = Math.ceil(allAuthorPapers.length / 20);
    const nextPage = currentLoadedPages + 1;
    const totalPages = authorPapersTotalPages;
    
    if (nextPage > totalPages) return;
    
    setAuthorPapersLoading(true);
    const offset = (nextPage - 1) * 20;
    
    try {
      // Step 1: 获取论文ID
      const papersIdsResponse = await publicScholarAPI.getAuthorPapers(detailAuthorId, offset, 20, 'paperId');
      
      if (papersIdsResponse.data.code === 0 && papersIdsResponse.data.data) {
        const paperIds = (papersIdsResponse.data.data.data || []).map(p => p.paperId).filter(id => id);
        
        if (paperIds.length > 0) {
          // Step 2: 批量获取论文详情
          const batchResponse = await publicScholarAPI.getPaperBatch(
            paperIds,
            ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
          );
          
          if (batchResponse.data.code === 0 && batchResponse.data.data) {
            const newPapers = batchResponse.data.data || [];
            // 累积添加到所有论文列表
            setAllAuthorPapers(prev => [...prev, ...newPapers]);
          }
        }
      }
    } catch (error) {
      console.error('[SearchResultsPage] Failed to load more author papers for table:', error);
    } finally {
      setAuthorPapersLoading(false);
    }
  }, [detailAuthorId, authorPapersLoading, allAuthorPapers.length, authorPapersTotalPages]);

  // 当切换到表格视图时，从第一页开始加载数据
  const initAuthorTableFromFirstPage = useCallback(async () => {
    if (!detailAuthorId || authorPapersLoading) return;
    
    setAuthorPapersLoading(true);
    
    try {
      // 从第一页开始加载
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
      console.error('[SearchResultsPage] Failed to init author table from first page:', error);
    } finally {
      setAuthorPapersLoading(false);
    }
  }, [detailAuthorId, authorPapersLoading]);

  useEffect(() => {
    if (viewMode === 'author' && authorPapersViewMode === 'table' && detailAuthorId && allAuthorPapers.length === 0 && !authorPapersLoading) {
      // 从第一页开始加载表格数据
      initAuthorTableFromFirstPage();
    }
  }, [viewMode, authorPapersViewMode, detailAuthorId, allAuthorPapers.length, authorPapersLoading, initAuthorTableFromFirstPage]);

  // 监听 URL 中的 paperId 或 authorId 参数变化
  useEffect(() => {
    const paperId = searchParams.get('paperId');
    const authorId = searchParams.get('authorId');
    const query = searchParams.get('query');
    
    console.log('[SearchResultsPage] URL params changed - paperId:', paperId, 'authorId:', authorId, 'query:', query);
    
    if (authorId) {
      // URL 中有 authorId，加载作者详情
      loadAuthorDetail(authorId);
      // 如果有 query 参数，也设置搜索框的值
      if (query) {
        setSearchQuery(query);
      }
    } else if (paperId) {
      // URL 中有 paperId，加载论文详情
      loadPaperDetail(paperId);
      // 如果有 query 参数，也设置搜索框的值
      if (query) {
        setSearchQuery(query);
      }
      // 注意：相似论文引导的显示逻辑移到单独的 useEffect 中，等待论文详情加载完成后再显示
    }
  }, [searchParams]); // 监听 URL 参数变化

  // 相似论文新手引导 - 等待论文详情加载完成后显示
  useEffect(() => {
    // 只有当论文详情加载完成且有选中的论文时才考虑显示引导
    if (detailLoading || !selectedPaper) return;
    
    // 检查是否需要显示相似论文引导弹窗（每个用户只显示一次）
    const hasSeenSimilarGuide = localStorage.getItem('similarPapersGuideShown');
    if (hasSeenSimilarGuide) return;
    
    // 检查用户是否已经点击过相似论文标签
    if (hasClickedSimilarTabRef.current) return;
    
    // 延迟显示，等待 DOM 渲染完成
    const timer = setTimeout(() => {
      // 再次检查用户是否点击过
      if (hasClickedSimilarTabRef.current) return;
      
      // 检查相似论文标签按钮是否在可见范围内
      if (similarPapersTabRef.current) {
        const rect = similarPapersTabRef.current.getBoundingClientRect();
        const isVisible = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
        
        if (!isVisible) {
          // 如果不在可见范围内，先滚动到可见位置
          similarPapersTabRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          // 等待滚动完成后再显示引导
          setTimeout(() => {
            // 再次检查用户是否点击过
            if (!hasClickedSimilarTabRef.current) {
              setShowSimilarPapersGuide(true);
            }
          }, 500);
        } else {
          // 已经在可见范围内，直接显示引导
          setShowSimilarPapersGuide(true);
        }
      } else {
        // 如果 ref 还没准备好，直接显示引导
        setShowSimilarPapersGuide(true);
      }
    }, 800); // 等待 DOM 渲染
    
    return () => clearTimeout(timer);
  }, [detailLoading, selectedPaper]); // 监听论文详情加载状态和选中的论文

  // 标记是否已经点击过表格按钮
  const hasClickedTableBtnRef = useRef(false);

  // 初始化时从URL参数加载搜索结果（不包含 paperId 或 authorId 的情况）
  useEffect(() => {
    const query = searchParams.get('query');
    const paperId = searchParams.get('paperId');
    const authorId = searchParams.get('authorId');
    
    // 如果有 paperId 或 authorId，由上面的 useEffect 处理
    if (paperId || authorId) return;
    
    if (query) {
      setSearchQuery(query);
      performSearch(query, filters, currentPage);
    }
  }, []); // 只在组件挂载时执行一次
    
  // 监听搜索结果加载完成，显示表格视图引导
  useEffect(() => {
    // 只有当不在加载中、有结果、且用户没点击过表格按钮时才显示引导
    if (!loading && papers.length > 0 && !hasClickedTableBtnRef.current) {
    const hasSeenTableGuide = localStorage.getItem('hasSeenTableViewGuide');
      if (!hasSeenTableGuide) {
        // 延迟一点显示，让用户先看到结果
        const timer = setTimeout(() => {
          if (!hasClickedTableBtnRef.current) {
        setShowTableGuide(true);
          }
        }, 500);
        return () => clearTimeout(timer);
    }
    }
  }, [loading, papers.length]); // 当 loading 状态或 papers 变化时检查

  // 监听相似论文加载完成，显示表格视图引导
  useEffect(() => {
    // 只有当：
    // 1. 论文详情加载完成（detailLoading = false）
    // 2. 切换到相似论文 tab
    // 3. 相似论文不在加载中
    // 4. 有相似论文结果
    // 5. 用户没点击过表格按钮
    // 才显示引导
    if (!detailLoading && detailActiveTab === 'similar' && !similarPapersLoading && similarPapersData.papers.length > 0 && !hasClickedSimilarTableBtnRef.current) {
      const hasSeenTableGuide = localStorage.getItem('hasSeenTableViewGuide');
      if (!hasSeenTableGuide) {
        // 延迟一点显示，让用户先看到结果
        const timer = setTimeout(() => {
          if (!hasClickedSimilarTableBtnRef.current) {
            setShowSimilarTableGuide(true);
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [detailLoading, detailActiveTab, similarPapersLoading, similarPapersData.papers.length]);

  // 监听作者页面数据加载完成，显示表格视图引导
  useEffect(() => {
    // 只有当：
    // 1. 是作者视图模式
    // 2. 作者详情加载完成（authorLoading = false）
    // 3. 作者数据存在（有 detailAuthor）
    // 4. 作者论文加载完成（authorPapersLoading = false）
    // 5. 有作者论文结果
    // 6. 用户没点击过作者表格按钮
    // 才显示引导
    if (viewMode === 'author' && !authorLoading && detailAuthor && !authorPapersLoading && authorPapers.length > 0 && !hasClickedAuthorTableBtnRef.current) {
      const hasSeenTableGuide = localStorage.getItem('hasSeenTableViewGuide');
      if (!hasSeenTableGuide) {
        // 页面数据加载完成后，延迟800ms显示引导
        const timer = setTimeout(() => {
          if (!hasClickedAuthorTableBtnRef.current) {
            setShowAuthorTableGuide(true);
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, authorLoading, detailAuthor, authorPapersLoading, authorPapers.length]);

  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
      setPreviewWidth(prev => clampPreviewWidth(prev, viewportWidth));
      setIsCompactLayout(viewportWidth <= 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPreviewWidth]);

  // 监听论文列表滚动，控制搜索框收缩
  useEffect(() => {
    let scrollHandler = null;
    let retryCount = 0;
    const maxRetries = 10;
    
    const setupScrollListener = () => {
      const container = papersContainerRef.current;
      
      if (!container) {
        // 如果容器还不存在，重试
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(setupScrollListener, 200);
        }
        return;
      }

      const scrollThreshold = 50; // 滚动多少像素后触发收缩

      scrollHandler = () => {
        const scrollTop = container.scrollTop;
        
        // 向下滚动超过阈值时收缩
        if (scrollTop > scrollThreshold) {
          setIsSearchBarCollapsed(true);
        }
        // 滚动回顶部时展开
        else if (scrollTop <= 10) {
          setIsSearchBarCollapsed(false);
        }
      };

      // 初始化时检查滚动位置
      scrollHandler();

      // 添加滚动监听器
      container.addEventListener('scroll', scrollHandler, { passive: true });
    };

    // 开始设置监听器
    setupScrollListener();

    // 清理函数
    return () => {
      if (scrollHandler && papersContainerRef.current) {
        papersContainerRef.current.removeEventListener('scroll', scrollHandler);
      }
    };
  }, [location.pathname, papers.length]); // 依赖于路径变化和论文数据变化

  // 论文详情模式下：点击外部或滚动时收起搜索框，展开时自动聚焦
  useEffect(() => {
    if (viewMode !== 'paper') return;

    // 展开时自动聚焦到输入框
    if (showDetailSearch) {
      setTimeout(() => {
        const textarea = document.querySelector('.results-chat-input');
        if (textarea) {
          textarea.focus();
        }
      }, 100);
    }

    // 点击外部收起搜索框
    const handleClickOutside = (e) => {
      if (!showDetailSearch) return;
      
      const searchArea = document.querySelector('.search-results-centered-area');
      const searchBtn = document.querySelector('.epd-navbar-search-btn');
      
      if (searchArea && !searchArea.contains(e.target) && 
          searchBtn && !searchBtn.contains(e.target)) {
        setShowDetailSearch(false);
      }
    };

    // 滚动时收起搜索框
    const handleScroll = () => {
      if (showDetailSearch) {
        setShowDetailSearch(false);
      }
    };

    const container = papersContainerRef.current;

    document.addEventListener('click', handleClickOutside);
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [viewMode, showDetailSearch]);

  // 论文详情加载后，自动加载引用文献（默认Tab）
  useEffect(() => {
    if (detailPaper && viewMode === 'paper') {
      // 重置数据
      setCitationsData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
      setReferencesData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
      setSimilarPapersData({ papers: [], currentPage: 1, total: 0, totalPages: 0 });
      setAllSimilarPapers([]);
      // 加载默认 Tab 的数据
      if (detailActiveTab === 'citations') {
        loadCitations(1);
      } else if (detailActiveTab === 'references') {
        loadReferences(1);
      } else if (detailActiveTab === 'similar') {
        loadSimilarPapers(1);
      }
    }
  }, [detailPaper, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 切换 Tab 时加载对应数据
  useEffect(() => {
    if (!detailPaper || viewMode !== 'paper') return;
    
    if (detailActiveTab === 'citations' && citationsData.papers.length === 0 && citationsData.total === 0) {
      loadCitations(1);
    } else if (detailActiveTab === 'references' && referencesData.papers.length === 0 && referencesData.total === 0) {
      loadReferences(1);
    } else if (detailActiveTab === 'similar' && allSimilarPapers.length === 0 && similarPapersData.total === 0) {
      loadSimilarPapers(1);
    }
  }, [detailActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听相似论文列表滚动和点击，自动收起展开的头部
  useEffect(() => {
    if (detailActiveTab !== 'similar' || detailHeaderCollapsed) return;
    
    const handleScrollOrClick = () => {
      // 展开状态下，滚动或点击时自动收起
      setDetailHeaderCollapsed(true);
    };
    
    const listEl = similarPapersListRef.current;
    if (listEl) {
      listEl.addEventListener('scroll', handleScrollOrClick);
      listEl.addEventListener('click', handleScrollOrClick);
    }
    
    return () => {
      if (listEl) {
        listEl.removeEventListener('scroll', handleScrollOrClick);
        listEl.removeEventListener('click', handleScrollOrClick);
      }
    };
  }, [detailActiveTab, detailHeaderCollapsed]);

  // 处理搜索
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // 关闭搜索建议
    setShowSuggestions(false);
    
    // 设置输入框为单行显示
    setIsInputSingleLine(true);
    // 重置 textarea 高度为单行
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // 重置分页
    setCurrentPage(1);
    
    // 如果查询词改变了，清除翻译缓存和查询信息
    if (cachedTranslation.query !== searchQuery) {
      setCachedTranslation({ query: '', translated: '', actual: '' });
      // 立即清除旧的查询信息提示
      setQueryInfo({
        originalQuery: '',
        translatedQuery: '',
        actualQuery: '',
        translationEnabled: false
      });
    }

    // 更新URL参数
    updateURL(searchQuery, filters, 1);

    // 执行搜索
    performSearch(searchQuery, filters, 1);
  };

  // 处理选择论文建议 - 切换到论文详情视图
  const handleSelectPaper = async (paper) => {
    setShowSuggestions(false);
    // 保存当前搜索查询用于返回
    setSearchQuery(paper.title);
    setDetailActiveTab('citations');
    
    // 更新URL参数，添加paperId
    const params = new URLSearchParams(searchParams);
    params.set('paperId', paper.id);
    setSearchParams(params);
    
    // 直接调用加载函数
    loadPaperDetail(paper.id);
  };

  // 返回搜索结果列表
  const handleBackToSearch = () => {
    setViewMode('list');
    setDetailPaper(null);
    setDetailPaperId(null);
    setDetailError(null);
    // 从URL中移除paperId参数
    const params = new URLSearchParams(searchParams);
    params.delete('paperId');
    setSearchParams(params);
  };

  // 复制DOI
  const copyDetailDoi = (e) => {
    e.stopPropagation();
    if (detailPaper?.externalIds?.DOI) {
      navigator.clipboard.writeText(detailPaper.externalIds.DOI);
      setDetailCopiedDoi(true);
      setTimeout(() => setDetailCopiedDoi(false), 2000);
    }
  };

  // 复制CorpusId
  const copyDetailCorpusId = (e) => {
    e.stopPropagation();
    if (detailPaper?.externalIds?.CorpusId) {
      navigator.clipboard.writeText(detailPaper.externalIds.CorpusId.toString());
      setDetailCopiedCorpusId(true);
      setTimeout(() => setDetailCopiedCorpusId(false), 2000);
    }
  };

  // 加载引用文献（分页）- 使用 batch API 获取详细信息
  const loadCitations = useCallback(async (page = 1) => {
    if (!detailPaper || citationsLoading) return;
    
    // 翻页时关闭右侧预览
    setSelectedPaper(null);
    
    // 获取原始引用列表中的 paper IDs
    const allCitations = detailPaper.citations || [];
    if (allCitations.length === 0) return;
    
    const totalPages = Math.ceil(allCitations.length / REFS_PER_PAGE);
    const startIndex = (page - 1) * REFS_PER_PAGE;
    const endIndex = startIndex + REFS_PER_PAGE;
    
    // 获取当前页的 paper IDs
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
      console.error('Failed to load citations:', error);
    } finally {
      setCitationsLoading(false);
    }
  }, [detailPaper, citationsLoading, REFS_PER_PAGE]);

  // 加载参考文献（分页）- 使用 batch API 获取详细信息
  const loadReferences = useCallback(async (page = 1) => {
    if (!detailPaper || referencesLoading) return;
    
    // 翻页时关闭右侧预览
    setSelectedPaper(null);
    
    // 获取原始参考文献列表中的 paper IDs
    const allReferences = detailPaper.references || [];
    if (allReferences.length === 0) return;
    
    const totalPages = Math.ceil(allReferences.length / REFS_PER_PAGE);
    const startIndex = (page - 1) * REFS_PER_PAGE;
    const endIndex = startIndex + REFS_PER_PAGE;
    
    // 获取当前页的 paper IDs
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
      console.error('Failed to load references:', error);
    } finally {
      setReferencesLoading(false);
    }
  }, [detailPaper, referencesLoading, REFS_PER_PAGE]);

  // 加载相似论文（分页）- 先获取推荐论文ID列表，再通过batch接口获取详细信息
  // append 参数用于表格视图的累积加载模式
  const loadSimilarPapers = useCallback(async (page = 1, append = false) => {
    if (!detailPaper || similarPapersLoading) return;
    
    // 翻页时关闭右侧预览
    setSelectedPaper(null);
    
    setSimilarPapersLoading(true);
    try {
      // 如果还没有加载过所有相似论文ID，先获取推荐列表
      let allPaperIds = allSimilarPapers;
      if (allPaperIds.length === 0) {
        // 只获取论文ID（推荐接口默认只返回paperId和title）
        const recResponse = await publicScholarAPI.getRecommendations(
          detailPaper.paperId,
          100 // 最多获取100篇推荐论文
        );
        
        const recommendedPapers = recResponse.data?.data?.recommendedPapers || recResponse.data?.recommendedPapers || [];
        // 提取论文ID列表
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
      
      // 分页获取当前页的论文ID
      const totalPages = Math.ceil(allPaperIds.length / REFS_PER_PAGE);
      const startIndex = (page - 1) * REFS_PER_PAGE;
      const endIndex = startIndex + REFS_PER_PAGE;
      const pageIds = allPaperIds.slice(startIndex, endIndex);
      
      // 通过batch接口获取详细信息
      const batchResponse = await publicScholarAPI.getPaperBatch(
        pageIds,
        ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      );
      
      const pagePapers = batchResponse.data?.data || batchResponse.data || [];
      
      setSimilarPapersData(prev => {
        // 如果是累积模式（表格视图的加载更多），追加到现有数据
        if (append && prev.papers.length > 0) {
          // 去重
          const existingIds = new Set(prev.papers.map(p => p.paperId));
          const newPapers = pagePapers.filter(p => !existingIds.has(p.paperId));
          return {
            papers: [...prev.papers, ...newPapers],
            currentPage: page,
            total: allPaperIds.length,
            totalPages: totalPages
          };
        }
        // 否则替换数据（列表视图的分页）
        return {
          papers: pagePapers,
          currentPage: page,
          total: allPaperIds.length,
          totalPages: totalPages
        };
      });
    } catch (error) {
      console.error('Failed to load similar papers:', error);
      setSimilarPapersData({
        papers: [],
        currentPage: 1,
        total: 0,
        totalPages: 0
      });
    } finally {
      setSimilarPapersLoading(false);
    }
  }, [detailPaper, similarPapersLoading, allSimilarPapers, REFS_PER_PAGE]);

  // 处理选择作者建议
  const handleSelectAuthor = (author) => {
    // 使用作者名字作为搜索查询
    const name = author.name || '';
    const authorId = author.authorId || '';
    setSearchQuery(name);
    setShowSuggestions(false);
    // 跳转到搜索结果页面，并带上 authorId 以显示作者详情
    const params = new URLSearchParams();
    if (name) params.set('query', name);
    if (authorId) params.set('authorId', authorId);
    navigate(`/search-results?${params.toString()}`);
  };

  // 更新URL参数
  const updateURL = (query, currentFilters, page) => {
    const params = new URLSearchParams();
    params.set('query', query);

    if (currentFilters.yearFrom) params.set('yearFrom', currentFilters.yearFrom);
    if (currentFilters.yearTo) params.set('yearTo', currentFilters.yearTo);
    if (currentFilters.publicationTypes.length > 0) params.set('publicationTypes', currentFilters.publicationTypes.join(','));
    if (currentFilters.fieldsOfStudy.length > 0) params.set('fieldsOfStudy', currentFilters.fieldsOfStudy.join(','));
    if (currentFilters.openAccessPdf) params.set('openAccessPdf', currentFilters.openAccessPdf);
    if (currentFilters.venue) params.set('venue', currentFilters.venue);
    if (currentFilters.minCitationCount) params.set('minCitationCount', currentFilters.minCitationCount);
    if (page > 1) params.set('page', page);

    setSearchParams(params);
  };

  // 处理使用推荐搜索词搜索（从表格视图空状态触发）
  const handleSearchWithRecommendedQuery = (recommendedQuery) => {
    if (!recommendedQuery || !recommendedQuery.trim()) return;
    
    console.log('[SearchResultsPage] Searching with recommended query:', recommendedQuery);
    
    // 更新搜索框内容
    setSearchQuery(recommendedQuery);
    
    // 关闭搜索建议
    setShowSuggestions(false);
    
    // 重置分页
    setCurrentPage(1);
    
    // 清除翻译缓存
    setCachedTranslation({ query: '', translated: '', actual: '' });
    setQueryInfo({
      originalQuery: '',
      translatedQuery: '',
      actualQuery: '',
      translationEnabled: false
    });
    
    // 更新URL参数
    updateURL(recommendedQuery, filters, 1);
    
    // 执行搜索
    performSearch(recommendedQuery, filters, 1);
  };

  // 处理顶部筛选面板的筛选条件变化（不立即搜索，只更新状态）
  const handleTopFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  // 处理顶部筛选面板关闭（只在有结果页面关闭时触发搜索）
  const handleTopFiltersToggle = (shouldSearchOnClose = false) => {
    if (showFilters && shouldSearchOnClose) {
      // 面板正在关闭，且明确要求搜索时才触发
      if (searchQuery.trim()) {
        setCurrentPage(1);
        updateURL(searchQuery, filters, 1);
        performSearch(searchQuery, filters, 1);
      }
    }
    setShowFilters(!showFilters);
  };

  // 检查是否有筛选条件
  const hasActiveFilters = () => {
    return filters.yearFrom ||
           filters.yearTo ||
           filters.publicationTypes.length > 0 ||
           filters.fieldsOfStudy.length > 0 ||
           filters.openAccessPdf ||
           filters.venue ||
           filters.minCitationCount;
  };

  // 获取当前筛选标签列表
  const getFilterTags = () => {
    const tags = [];
    
    if (filters.yearFrom && filters.yearTo) {
      tags.push({ key: 'year', label: `${filters.yearFrom}-${filters.yearTo}`, type: 'year' });
    } else if (filters.yearFrom) {
      tags.push({ key: 'yearFrom', label: `${filters.yearFrom}年起`, type: 'year' });
    } else if (filters.yearTo) {
      tags.push({ key: 'yearTo', label: `至${filters.yearTo}年`, type: 'year' });
    }
    
    if (filters.openAccessPdf) {
      tags.push({ key: 'openAccess', label: '开放获取', type: 'openAccess' });
    }

    if (filters.minCitationCount) {
      tags.push({ key: 'minCitationCount', label: `引用≥${filters.minCitationCount}`, type: 'minCitationCount' });
    }
    
    filters.fieldsOfStudy.forEach(field => {
      tags.push({ key: `field-${field}`, label: field, type: 'field' });
    });
    
    filters.publicationTypes.forEach(type => {
      tags.push({ key: `type-${type}`, label: type, type: 'pubType' });
    });
    
    if (filters.venue) {
      tags.push({ key: 'venue', label: filters.venue, type: 'venue' });
    }
    
    return tags;
  };

  // 移除单个筛选条件
  const removeFilter = (tagKey, tagType) => {
    const newFilters = { ...filters };
    
    if (tagType === 'year') {
      newFilters.yearFrom = '';
      newFilters.yearTo = '';
    } else if (tagType === 'openAccess') {
      newFilters.openAccessPdf = '';
    } else if (tagType === 'minCitationCount') {
      newFilters.minCitationCount = '';
    } else if (tagType === 'field') {
      const fieldName = tagKey.replace('field-', '');
      newFilters.fieldsOfStudy = newFilters.fieldsOfStudy.filter(f => f !== fieldName);
    } else if (tagType === 'pubType') {
      const typeName = tagKey.replace('type-', '');
      newFilters.publicationTypes = newFilters.publicationTypes.filter(t => t !== typeName);
    } else if (tagType === 'venue') {
      newFilters.venue = '';
    }
    
    setFilters(newFilters);
    
    // 如果已经执行过搜索，自动重新搜索
    if (searchQuery.trim()) {
    setCurrentPage(1);
    updateURL(searchQuery, newFilters, 1);
    performSearch(searchQuery, newFilters, 1);
    }
  };

  // 清除所有筛选条件
  const clearAllFilters = () => {
    const newFilters = {
      yearFrom: '',
      yearTo: '',
      publicationTypes: [],
      fieldsOfStudy: [],
      openAccessPdf: '',
      venue: '',
      minCitationCount: '',
    };
    setFilters(newFilters);
    
    // 如果已经执行过搜索，自动重新搜索
    if (searchQuery.trim()) {
      setCurrentPage(1);
      updateURL(searchQuery, newFilters, 1);
      performSearch(searchQuery, newFilters, 1);
    }
  };

  // 处理分页
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    updateURL(searchQuery, filters, newPage);
    performSearch(searchQuery, filters, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 处理每页数量变化
  const handlePageSizeChange = (newSize) => {
    setPapersPerPage(newSize);
    localStorage.setItem('papersPerPage', newSize.toString());
    setCurrentPage(1); // 重置到第一页
    performSearch(searchQuery, filters, 1);
  };

  const startPreviewResize = (startClientX) => {
    setIsResizingPreview(true);
    const startWidth = previewWidth;
    let currentWidth = startWidth;

    const updateWidth = (clientX) => {
      if (typeof clientX !== 'number' || Number.isNaN(clientX)) {
        return;
      }
      const diff = startClientX - clientX;
      const rawWidth = startWidth + diff;
      const clampedWidth = clampPreviewWidth(rawWidth);
      currentWidth = clampedWidth;
      setPreviewWidth(clampedWidth);
    };

    const handleMouseMove = (event) => {
      updateWidth(event.clientX);
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) {
        return;
      }
      event.preventDefault();
      updateWidth(event.touches[0].clientX);
    };

    const touchMoveOptions = { passive: false };

    const finishResize = () => {
      setIsResizingPreview(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', finishResize);
      document.removeEventListener('touchmove', handleTouchMove, touchMoveOptions);
      document.removeEventListener('touchend', finishResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', finishResize);
    document.addEventListener('touchmove', handleTouchMove, touchMoveOptions);
    document.addEventListener('touchend', finishResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handlePreviewResizeMouseDown = (event) => {
    event.preventDefault();
    startPreviewResize(event.clientX);
  };

  const handlePreviewResizeTouchStart = (event) => {
    if (event.touches.length !== 1) {
      return;
    }
    event.preventDefault();
    startPreviewResize(event.touches[0].clientX);
  };

  // 计算分页信息
  const totalPages = Math.ceil(total / papersPerPage);
  const startIndex = (currentPage - 1) * papersPerPage + 1;
  const endIndex = Math.min(currentPage * papersPerPage, total);

  // 判断是否为空状态（没有查询参数且不是论文详情视图）
  const isEmptyState = !searchParams.get('query') && viewMode !== 'paper' && viewMode !== 'author';

  // 生成SEO数据
  const pageTitle = searchQuery
    ? `"${searchQuery}"的搜索结果 - Scholay学术搜索`
    : '搜索结果 - Scholay学术搜索';

  const pageDescription = searchQuery && papers.length > 0
    ? `为您找到${total}篇关于"${searchQuery}"的学术论文。${truncateText(papers[0]?.title || '', 100)}`
    : `使用Scholay智能搜索引擎查找学术论文、研究文献和科研资料。`;

  const breadcrumbData = [
    { name: '首页', url: '/' },
    { name: '搜索结果', url: `/search-results?query=${encodeURIComponent(searchQuery)}` }
  ];

  return (
    <div className="search-results-page">
      <SEO
        title={pageTitle}
        description={pageDescription}
        keywords={`${searchQuery},学术搜索,论文检索,文献查找,${filters.fieldsOfStudy.join(',')}`}
        canonical={`/search-results?query=${encodeURIComponent(searchQuery)}`}
        structuredData={papers.length > 0 ? generateSearchResultsSchema(searchQuery, papers) : generateBreadcrumbSchema(breadcrumbData)}
      />

      {/* 主内容区域 */}
      <div className={`search-results-content ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        {isEmptyState ? (
          // 空状态：类似首页的简洁布局
          <div className="empty-search-layout">
            <nav className="empty-navbar">
              {/* 移动端菜单按钮 */}
              {isMobile && (
                <button 
                  className="mobile-menu-btn"
                  onClick={openMobileSidebar}
                  aria-label="打开菜单"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="16" x2="14" y2="16" />
                  </svg>
                </button>
              )}
              <h1 className="empty-page-title">学术检索</h1>
              
              {/* 未登录状态下显示登录按钮 */}
              {!isAuthenticated && !isMobile && (
                <div className="navbar-auth-buttons">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="btn-auth btn-pricing"
                  >
                    价格方案
                  </button>
                  <ThemeToggle />
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="btn-auth btn-login-register"
                  >
                    登录 / 注册
                  </button>
                </div>
              )}
            </nav>

            <div className="empty-search-content">
              <form onSubmit={handleSearch} className="normal-search-composer-wrapper">
                {/* 输入区域 */}
                <div className="normal-search-composer-input-area">
                  <textarea
                    ref={emptyTextareaRef}
                    className="normal-search-chat-input"
                    placeholder={searchExamples[currentExampleIndex]}
                    value={searchQuery}
                    maxLength={1000}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                      // 显示搜索建议
                      if (e.target.value.trim().length >= 2) {
                        setShowSuggestions(true);
                      } else {
                        setShowSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      // 如果有输入内容则显示搜索建议
                      if (searchQuery.trim().length >= 2) {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      // 延迟关闭，以便点击建议项时不会立即关闭
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                        e.preventDefault();
                        setShowSuggestions(false);
                        if (searchQuery.trim()) {
                          handleSearch(e);
                        }
                      }
                      if (e.key === 'Escape') {
                        setShowSuggestions(false);
                      }
                    }}
                    rows={1}
                  />
                  <button type="submit" className="btn-send" disabled={!searchQuery.trim()}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>

                {/* 搜索建议下拉框 */}
                <SearchSuggestions
                  query={searchQuery}
                  onSelectPaper={handleSelectPaper}
                  onSelectAuthor={handleSelectAuthor}
                  onClose={() => setShowSuggestions(false)}
                  visible={showSuggestions}
                  inputRef={emptyTextareaRef}
                />

                {/* 底部操作栏 */}
                <div className="normal-search-composer-footer">
                  <div className="normal-search-composer-footer-left">
                    {/* 搜索模式切换 - 分段控制器设计 */}
                    <div className="normal-search-mode-segmented">
                      <button
                        type="button"
                        className="mode-segment active"
                      >
                        <span className="mode-segment-icon">
                          <NormalSearchIcon size={16} />
                        </span>
                        <span className="mode-segment-label">学术检索</span>
                      </button>
                      <button
                        type="button"
                        className="mode-segment"
                        onClick={() => {
                          // 使用 View Transitions API 实现平滑过渡
                          if (document.startViewTransition) {
                            document.startViewTransition(() => {
                              navigate('/advanced-search');
                            });
                          } else {
                            navigate('/advanced-search');
                          }
                        }}
                      >
                        <span className="mode-segment-icon">
                          <AdvancedSearchIcon size={16} />
                        </span>
                      </button>
                    </div>

                    {/* 分隔线 */}
                    <div className="footer-divider"></div>

                    {/* 筛选按钮 */}
                    {(() => {
                      const hasFilters = filters.yearFrom ||
                                       filters.yearTo ||
                                       filters.publicationTypes.length > 0 ||
                                       filters.fieldsOfStudy.length > 0 ||
                                       filters.openAccessPdf ||
                                       filters.venue ||
                                       filters.minCitationCount;

                      return (
                        <button
                          type="button"
                          className={`footer-btn filter-btn ${showFilters ? 'panel-open' : ''} ${hasFilters ? 'has-filters' : ''}`}
                          onClick={() => setShowFilters(!showFilters)}
                          title={hasFilters ? "点击打开筛选" : "筛选条件"}
                        >
                          <div className="filter-icon-wrapper">
                            <svg className="filter-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2.5 3.75C2.5 3.19772 2.94772 2.75 3.5 2.75H16.5C17.0523 2.75 17.5 3.19772 17.5 3.75V5.25C17.5 5.51522 17.3946 5.76957 17.2071 5.95711L11.75 11.4142V16.25C11.75 16.6297 11.5085 16.9705 11.1522 17.1094L8.65217 18.1094C8.15522 18.3078 7.58333 17.9469 7.58333 17.4167V11.4142L2.79289 5.95711C2.60536 5.76957 2.5 5.51522 2.5 5.25V3.75Z"/>
                            </svg>
                            <svg className="clear-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.5355 5.46447C13.9261 5.85499 13.9261 6.48816 13.5355 6.87868L11.4142 9L13.5355 11.1213C13.9261 11.5118 13.9261 12.145 13.5355 12.5355C13.145 12.9261 12.5118 12.9261 12.1213 12.5355L10 10.4142L7.87868 12.5355C7.48816 12.9261 6.85499 12.9261 6.46447 12.5355C6.07394 12.145 6.07394 11.5118 6.46447 11.1213L8.58579 9L6.46447 6.87868C6.07394 6.48816 6.07394 5.85499 6.46447 5.46447C6.85499 5.07394 7.48816 5.07394 7.87868 5.46447L10 7.58579L12.1213 5.46447C12.5118 5.07394 13.145 5.07394 13.5355 5.46447Z"/>
                            </svg>
                          </div>
                          <span>筛选</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </form>

              {/* 筛选条件面板 */}
              <SearchFilters
                filters={filters}
                onFiltersChange={handleTopFiltersChange}
                isExpanded={showFilters}
                onToggle={() => handleTopFiltersToggle(false)}
              />
            </div>
          </div>
        ) : (
          // 有搜索结果时的布局
          <div className="results-layout">
            {/* 顶部标题栏 */}
            <nav className="results-navbar">
              {/* 移动端菜单按钮 */}
              {isMobile && (
                <button 
                  className="mobile-menu-btn"
                  onClick={openMobileSidebar}
                  aria-label="打开菜单"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="16" x2="14" y2="16" />
                  </svg>
                </button>
              )}
              <h1 className="page-title">学术检索</h1>
              {/* 论文详情模式下显示搜索按钮 - 展开时隐藏 */}
              {(viewMode === 'paper' || viewMode === 'author') && (
                <button 
                  className={`epd-navbar-search-btn ${showDetailSearch ? 'hidden' : ''}`}
                  onClick={() => setShowDetailSearch(true)}
                  title="搜索论文"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                </button>
              )}
              
              {/* 未登录状态下显示登录按钮 */}
              {!isAuthenticated && !isMobile && (
                <div className="navbar-auth-buttons">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="btn-auth btn-pricing"
                  >
                    价格方案
                  </button>
                  <ThemeToggle />
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="btn-auth btn-login-register"
                  >
                    登录 / 注册
                  </button>
                </div>
              )}
            </nav>

            {/* 居中搜索区域 - 论文详情模式下可通过按钮展开 */}
            {((viewMode !== 'paper' && viewMode !== 'author') || showDetailSearch) && (
            <div 
              className={`search-results-centered-area ${isSearchBarCollapsed ? 'collapsed' : ''} ${viewMode === 'table' ? 'table-mode' : ''} ${(viewMode === 'paper' || viewMode === 'author') && showDetailSearch ? 'paper-mode-search' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              {viewMode === 'table' ? (
                // 表格模式下的简化搜索词展示
                <div 
                  className="srp-table-search-display"
                  onClick={() => {
                    setViewMode('list');
                    // 延迟聚焦，等待视图切换完成
                    setTimeout(() => {
                      const textarea = document.querySelector('.results-chat-input');
                      if (textarea) {
                        textarea.focus();
                        textarea.select();
                      }
                    }, 100);
                  }}
                >
                  <div className="srp-table-search-content">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <span className="srp-table-search-query">{searchQuery}</span>
                  </div>
                  <span className="srp-table-search-hint">点击修改搜索</span>
                </div>
              ) : (
                // 列表模式下的完整搜索表单
                <form onSubmit={handleSearch} className="results-composer-wrapper">
                  {/* 输入区域 */}
                  <div className="results-composer-input-area">
                    <textarea
                      ref={textareaRef}
                      className={`results-chat-input ${isInputSingleLine ? 'single-line' : ''}`}
                      placeholder={searchExamples[currentExampleIndex]}
                      value={searchQuery}
                      maxLength={1000}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        // 显示搜索建议
                        if (e.target.value.trim().length >= 2) {
                          setShowSuggestions(true);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={(e) => {
                        // 展开输入框为多行
                        setIsInputSingleLine(false);
                        // 恢复 textarea 高度
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        // 如果有输入内容则显示搜索建议
                        if (searchQuery.trim().length >= 2) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // 延迟关闭，以便点击建议项时不会立即关闭
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                          e.preventDefault();
                          setShowSuggestions(false);
                          if (searchQuery.trim()) {
                            handleSearch(e);
                          }
                        }
                        if (e.key === 'Escape') {
                          setShowSuggestions(false);
                        }
                      }}
                      rows={1}
                    />

                    {/* 筛选按钮 - 放在发送按钮左侧 */}
                    {(() => {
                      const hasFilters = filters.yearFrom ||
                                       filters.yearTo ||
                                       filters.publicationTypes.length > 0 ||
                                       filters.fieldsOfStudy.length > 0 ||
                                       filters.openAccessPdf ||
                                       filters.venue ||
                                       filters.minCitationCount;

                      return (
                        <button
                          type="button"
                          className={`filter-btn-minimal ${showFilters ? 'panel-open' : ''} ${hasFilters ? 'has-filters' : ''}`}
                          onClick={() => setShowFilters(!showFilters)}
                          title={hasFilters ? "已设置筛选条件" : "筛选条件"}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2.5 3.75C2.5 3.19772 2.94772 2.75 3.5 2.75H16.5C17.0523 2.75 17.5 3.19772 17.5 3.75V5.25C17.5 5.51522 17.3946 5.76957 17.2071 5.95711L11.75 11.4142V16.25C11.75 16.6297 11.5085 16.9705 11.1522 17.1094L8.65217 18.1094C8.15522 18.3078 7.58333 17.9469 7.58333 17.4167V11.4142L2.79289 5.95711C2.60536 5.76957 2.5 5.51522 2.5 5.25V3.75Z"/>
                            </svg>
                          {hasFilters && <span className="filter-dot"></span>}
                        </button>
                      );
                    })()}

                    <button type="submit" className="btn-send" disabled={!searchQuery.trim() || loading}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>

                  {/* 搜索建议下拉框 */}
                  <SearchSuggestions
                    query={searchQuery}
                    onSelectPaper={handleSelectPaper}
                    onSelectAuthor={handleSelectAuthor}
                    onClose={() => setShowSuggestions(false)}
                    visible={showSuggestions}
                    inputRef={textareaRef}
                  />
                </form>
              )}

              {/* 筛选条件面板（列表模式下显示） */}
              {viewMode !== 'table' && (
                <SearchFilters
                  filters={filters}
                  onFiltersChange={handleTopFiltersChange}
                  isExpanded={showFilters}
                  onToggle={() => handleTopFiltersToggle(true)}
                />
              )}

              {/* AI翻译提示 - 类似Google/百度搜索的提示（列表模式下显示） */}
              {/* 只在 combined 或 translated 策略时显示，original 策略不需要提示 */}
              {viewMode !== 'table' && queryInfo.translationEnabled && queryInfo.translatedQuery && 
               queryInfo.searchStrategy !== 'original' && (
                <div className="search-translation-hint">
                  {/* 根据搜索策略显示不同的提示 */}
                  {(queryInfo.searchStrategy === 'combined' || !queryInfo.searchStrategy) && (
                    <>
                      <span className="hint-text">
                        已为你找到 "
                        <span className="hint-query-original" title={queryInfo.originalQuery}>
                          {queryInfo.originalQuery}
                        </span>
                        {' '}
                        <span className="hint-query-translated" title={queryInfo.translatedQuery}>
                          {queryInfo.translatedQuery}
                        </span>
                        " 的结果
                      </span>
                      <button
                        className="hint-action-btn"
                        onClick={() => performSearch(queryInfo.originalQuery, filters, 1, false, false)}
                        title={`仅按 "${queryInfo.originalQuery}" 查找`}
                      >
                        仅按 "<span className="hint-btn-query" title={queryInfo.originalQuery}>{queryInfo.originalQuery}</span>" 查找
                      </button>
                    </>
                  )}
                  {queryInfo.searchStrategy === 'translated' && (
                    <>
                      <span className="hint-text">
                        已为你找到 "
                        <span className="hint-query-translated" title={queryInfo.translatedQuery}>
                          {queryInfo.translatedQuery}
                        </span>
                        " 的结果
                      </span>
                      <span className="hint-fallback-notice">
                        原始词 "<span className="hint-query-highlight">{queryInfo.originalQuery}</span>" 无结果，已使用翻译词搜索
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* 当前筛选条件标签 - 始终保留空间（表格模式下隐藏） */}
              <div className={`active-filters-bar ${hasActiveFilters() ? 'has-filters' : 'empty'} ${viewMode === 'table' ? 'hidden' : ''}`}>
                {hasActiveFilters() && (
                  <>
                    <div className="filter-tags">
                      {getFilterTags().map(tag => (
                        <span key={tag.key} className={`filter-tag filter-tag-${tag.type}`}>
                          {tag.label}
                          <button 
                            className="filter-tag-remove"
                            onClick={() => removeFilter(tag.key, tag.type)}
                            aria-label={`移除筛选: ${tag.label}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M9.35355 3.35355C9.54882 3.15829 9.54882 2.84171 9.35355 2.64645C9.15829 2.45118 8.84171 2.45118 8.64645 2.64645L6 5.29289L3.35355 2.64645C3.15829 2.45118 2.84171 2.45118 2.64645 2.64645C2.45118 2.84171 2.45118 3.15829 2.64645 3.35355L5.29289 6L2.64645 8.64645C2.45118 8.84171 2.45118 9.15829 2.64645 9.35355C2.84171 9.54882 3.15829 9.54882 3.35355 9.35355L6 6.70711L8.64645 9.35355C8.84171 9.54882 9.15829 9.54882 9.35355 9.35355C9.54882 9.15829 9.54882 8.84171 9.35355 8.64645L6.70711 6L9.35355 3.35355Z"/>
                            </svg>
                          </button>
                        </span>
                      ))}
          </div>
                    <button className="clear-all-filters" onClick={clearAllFilters}>
                      清除全部
                    </button>
                  </>
                )}
              </div>
            </div>
            )}

      {/* 两栏布局 */}
      <div className="results-main" ref={resultsMainRef}>
        {/* 论文列表/详情区域 */}
        <div className="papers-container" ref={papersContainerRef}>
            {viewMode === 'author' ? (
              /* 作者详情视图 - 顶部信息 + 下方论文列表 */
              <div className="author-detail-page">
                {authorLoading ? (
                  <PaperDetailSkeleton />
                ) : authorError ? (
                  <div className="epd-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <h3>加载失败</h3>
                    <p>{authorError}</p>
                    <button className="epd-retry-btn" onClick={() => loadAuthorDetail(detailAuthorId)}>
                      重试
                    </button>
                  </div>
                ) : detailAuthor ? (
                  <>
                    {/* 顶部作者信息卡片 - 简洁美观设计 */}
                    <div className="author-profile-card">
                      <div className="author-profile-main">
                        <div className="author-profile-avatar">
                          <span className="author-avatar-letter">{detailAuthor.name ? detailAuthor.name.charAt(0).toUpperCase() : 'A'}</span>
                        </div>
                        <div className="author-profile-info">
                          <h1 className="author-profile-name">{detailAuthor.name}</h1>
                          {detailAuthor.affiliations && detailAuthor.affiliations.length > 0 && (
                            <p className="author-profile-affiliation">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              {detailAuthor.affiliations[0]}
                            </p>
                          )}
                          {detailAuthor.homepage && (
                            <a href={detailAuthor.homepage} target="_blank" rel="noopener noreferrer" className="author-profile-homepage">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="2" y1="12" x2="22" y2="12"/>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                              </svg>
                              个人主页
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="author-profile-metrics">
                        <div className="author-metric-item">
                          <span className="author-metric-value">{detailAuthor.paperCount || 0}</span>
                          <span className="author-metric-label">发表论文</span>
                        </div>
                        <div className="author-metric-divider"></div>
                        <div className="author-metric-item">
                          <span className="author-metric-value">{detailAuthor.hIndex || 0}</span>
                          <span className="author-metric-label">H 指数</span>
                        </div>
                        <div className="author-metric-divider"></div>
                        <div className="author-metric-item">
                          <span className="author-metric-value">{(detailAuthor.citationCount || 0).toLocaleString()}</span>
                          <span className="author-metric-label">总被引</span>
                        </div>
                      </div>
                    </div>

                    {/* 论文列表工具栏 - 复用 results-header 样式 */}
                    <div className="results-header">
                      <p className="results-info">
                        {authorPapersViewMode === 'list' ? (
                          // 列表视图：显示当前页范围
                          <>显示 <strong>{(authorPapersPage - 1) * 20 + 1}-{Math.min(authorPapersPage * 20, authorPapersTotal || detailAuthor.paperCount || authorPapers.length)}</strong> / 共 <strong>{authorPapersTotal || detailAuthor.paperCount || authorPapers.length}</strong> 篇论文</>
                        ) : (
                          // 表格视图：显示总数和提示
                          <>共 <strong>{authorPapersTotal || detailAuthor.paperCount || 0}</strong> 篇论文<span className="srp-results-info-hint">（仅显示有摘要的论文）</span></>
                        )}
                      </p>
                      <div className="srp-view-mode-switcher">
                        <button 
                          className={`srp-view-mode-btn ${authorPapersViewMode === 'list' ? 'active' : ''}`}
                          onClick={() => {
                            setAuthorPapersViewMode('list');
                            // 切换到列表视图时，关闭右侧面板（清除选中的论文和列）
                            setSelectedPaper(null);
                            setSelectedDimensionKey(null);
                          }}
                          title="列表视图"
                        >
                          <List size={18} />
                          <span>列表</span>
                        </button>
                        <button 
                          ref={authorTableBtnRef}
                          className={`srp-view-mode-btn ${authorPapersViewMode === 'table' ? 'active' : ''}`}
                          onClick={() => {
                            hasClickedAuthorTableBtnRef.current = true;
                            setShowAuthorTableGuide(false);
                            setAuthorPapersViewMode('table');
                            // 切换到表格视图时，关闭预览窗口（表格有自己的右侧列配置面板）
                            setSelectedPaper(null);
                            // 重置表格数据，从第一页开始加载
                            setAllAuthorPapers([]);
                          }}
                          title="表格视图"
                        >
                          <Table2 size={18} />
                          <span>表格</span>
                        </button>
                      </div>
                    </div>

                    {/* 论文列表 - 完全复用学术检索的样式 */}
                    {authorPapersViewMode === 'list' ? (
                      <div className="papers-list">
                        {authorPapers.map((paper, index) => (
                          <div
                            key={paper.paperId || index}
                            className={`search-result-paper-item ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
                            onClick={() => setSelectedPaper(paper)}
                          >
                            <div className="search-result-paper-number">{index + 1}</div>
                            <div className="search-result-paper-content">
                              <h3 
                                className="search-result-paper-title" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaper(paper);
                                }}
                              >
                                {paper.title}
                              </h3>

                              {/* 作者列表 */}
                              {paper.authors && paper.authors.length > 0 && (
                                <div className="search-result-paper-authors-row">
                                  <div className="search-result-paper-author-tags">
                                    {paper.authors.slice(0, 4).map((author, idx) => (
                                      <span 
                                        key={idx} 
                                        className={`author-tag ${author.authorId === detailAuthorId ? 'current-author' : ''}`}
                                      >
                                        {author.name}
                                      </span>
                                    ))}
                                    {paper.authors.length > 4 && (
                                      <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                                    )}
                                  </div>
                                  {/* 研究领域 */}
                                  {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                                    <span className="search-result-paper-fields">
                                      {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* 期刊/会议 + 日期 */}
                              {(paper.venue || paper.publicationDate || paper.year) && (
                                <p className="search-result-paper-venue-date">
                                  {paper.venue && (
                                    <span className="search-result-venue-name">{paper.venue}</span>
                                  )}
                                  {paper.venue && (paper.publicationDate || paper.year) && ' · '}
                                  {paper.publicationDate ? (
                                    <span className="pub-date">
                                      {new Date(paper.publicationDate).toLocaleDateString('zh-CN', { 
                                        year: 'numeric',
                                        month: 'long', 
                                        day: 'numeric'
                                      })}
                                    </span>
                                  ) : paper.year && (
                                    <span className="pub-date">{paper.year}年</span>
                                  )}
                                </p>
                              )}

                              {/* TLDR 摘要 */}
                              {paper.tldr && paper.tldr.text && (
                                <div className={`paper-tldr ${expandedTldr[paper.paperId] ? 'expanded' : ''}`}>
                                  <span className="tldr-label">TLDR</span>
                                  <span className="tldr-text">
                                    {expandedTldr[paper.paperId] 
                                      ? paper.tldr.text 
                                      : (paper.tldr.text.length > 300 
                                          ? paper.tldr.text.substring(0, 300) + '...' 
                                          : paper.tldr.text)
                                    }
                                  </span>
                                  {paper.tldr.text.length > 300 && (
                                    <button 
                                      className="expand-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTldrExpand(paper.paperId);
                                      }}
                                    >
                                      {expandedTldr[paper.paperId] ? '收起' : '展开'}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* 完整摘要 */}
                              {paper.abstract && (
                                <div className={`paper-abstract-section ${expandedAbstract[paper.paperId] ? 'expanded' : ''}`}>
                                  <span className="abstract-label">Abstract</span>
                                  <span className="abstract-text">
                                    {expandedAbstract[paper.paperId] 
                                      ? paper.abstract 
                                      : (paper.abstract.length > 300 
                                          ? paper.abstract.substring(0, 300) + '...' 
                                          : paper.abstract)
                                    }
                                  </span>
                                  {paper.abstract.length > 300 && (
                                    <button 
                                      className="expand-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAbstractExpand(paper.paperId);
                                      }}
                                    >
                                      {expandedAbstract[paper.paperId] ? '收起' : '展开'}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* 底部元信息和操作 */}
                              <div className="search-result-paper-meta">
                                {/* 被引用数 */}
                                {paper.citationCount !== undefined && (
                                  <>
                                    <span className="citation-count">
                                      <span className="citation-number">{paper.citationCount}</span>
                                      <span className="citation-label">被引</span>
                                    </span>
                                    <span className="meta-divider"></span>
                                  </>
                                )}
                                
                                {/* DOI 链接 */}
                                {paper.externalIds?.DOI && (
                                  <a
                                    href={`https://doi.org/${paper.externalIds.DOI}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="search-result-paper-doi-link"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                                    </svg>
                                    DOI
                                  </a>
                                )}
                                
                                {/* PDF 链接 */}
                                {paper.openAccessPdf && paper.openAccessPdf.url && (
                                  <a 
                                    href={paper.openAccessPdf.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="meta-item pdf-link"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                      <polyline points="14 2 14 8 20 8"/>
                                      <line x1="16" y1="13" x2="8" y2="13"/>
                                      <line x1="16" y1="17" x2="8" y2="17"/>
                                      <polyline points="10 9 9 9 8 9"/>
                                    </svg>
                                    PDF
                                  </a>
                                )}
                                
                                {/* Cite 按钮 */}
                                <button
                                  className="search-result-paper-cite-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCitePaper(paper);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
                                  </svg>
                                  Cite
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 分页器 */}
                        {authorPapersTotalPages > 1 && (
                          <div className="pagination">
                            <button
                              className="pagination-btn"
                              onClick={() => handleAuthorPapersPageChange(authorPapersPage - 1)}
                              disabled={authorPapersPage === 1 || authorLoading}
                            >
                              上一页
                            </button>

                            <div className="pagination-pages">
                              {Array.from({ length: Math.min(5, authorPapersTotalPages) }, (_, i) => {
                                let pageNum;
                                if (authorPapersTotalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (authorPapersPage <= 3) {
                                  pageNum = i + 1;
                                } else if (authorPapersPage >= authorPapersTotalPages - 2) {
                                  pageNum = authorPapersTotalPages - 4 + i;
                                } else {
                                  pageNum = authorPapersPage - 2 + i;
                                }

                                return (
                                  <button
                                    key={pageNum}
                                    className={`pagination-page ${authorPapersPage === pageNum ? 'active' : ''}`}
                                    onClick={() => handleAuthorPapersPageChange(pageNum)}
                                    disabled={authorLoading}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              className="pagination-btn"
                              onClick={() => handleAuthorPapersPageChange(authorPapersPage + 1)}
                              disabled={authorPapersPage === authorPapersTotalPages || authorLoading}
                            >
                              下一页
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      
                      /* 表格视图 - 使用 PaperTableView 组件，与相似论文逻辑一致 */
                      <div className="papers-list ptv-wrapper author-papers-table">
                        {authorPapersLoading && allAuthorPapers.length === 0 ? (
                          /* 初始加载状态 */
                          <div className="epd-loading">
                            <div className="epd-loading-spinner"></div>
                            <p>加载论文数据中...</p>
                          </div>
                        ) : (
                          <PaperTableView 
                            papers={allAuthorPapers}
                            onPaperClick={handleTablePaperClick}
                            totalResults={authorPapersTotal || detailAuthor?.paperCount || 0}
                            onLoadMore={loadMoreAuthorPapersForTable}
                            hasMore={Math.ceil(allAuthorPapers.length / 20) < authorPapersTotalPages}
                            loadingMore={authorPapersLoading}
                            reloadTrigger={null}
                            selectedDimensionKey={selectedDimensionKey}
                            onDimensionSelect={handleDimensionSelect}
                          />
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            ) : viewMode === 'paper' ? (
              /* 论文详情视图 */
              <div className="epd-container">
                {detailLoading ? (
                  <PaperDetailSkeleton />
                ) : detailError ? (
                  <div className="epd-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <h3>加载失败</h3>
                    <p>{detailError}</p>
                    <button className="epd-retry-btn" onClick={() => handleSelectPaper({ id: detailPaperId, title: '' })}>
                      重试
                    </button>
                  </div>
                ) : detailPaper ? (
                  <div className={`epd-content ${detailHeaderCollapsed ? 'epd-header-collapsed' : ''}`}>
                    {/* 论文头部信息 - 可折叠 */}
                    <div className={`epd-header ${detailHeaderCollapsed ? 'collapsed' : ''}`}>
                      {/* DOI 和 Corpus ID */}
                      <div className="epd-meta-ids">
                        {detailPaper.externalIds?.DOI && (
                          <span className="epd-meta-id epd-copyable" onClick={copyDetailDoi}>
                            <span className="epd-meta-text">DOI: {detailPaper.externalIds.DOI}</span>
                            <button className={`epd-copy-btn ${detailCopiedDoi ? 'copied' : ''}`} title={detailCopiedDoi ? '已复制' : '复制'}>
                              {detailCopiedDoi ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                              )}
                            </button>
                          </span>
                        )}
                        {detailPaper.externalIds?.CorpusId && (
                          <>
                            {detailPaper.externalIds?.DOI && <span className="epd-meta-dot">•</span>}
                            <span className="epd-meta-id epd-copyable" onClick={copyDetailCorpusId}>
                              <span className="epd-meta-text">Corpus ID: {detailPaper.externalIds.CorpusId}</span>
                              <button className={`epd-copy-btn ${detailCopiedCorpusId ? 'copied' : ''}`} title={detailCopiedCorpusId ? '已复制' : '复制'}>
                                {detailCopiedCorpusId ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                )}
                              </button>
                            </span>
                          </>
                        )}
                      </div>

                      {/* 标题 */}
                      <h1 className="epd-title">{detailPaper.title}</h1>

                      {/* 作者和出版信息 */}
                      <div className="epd-pub-meta">
                        {detailPaper.authors?.length > 0 && (
                          <>
                            {detailPaper.authors.map((author, idx) => (
                              <React.Fragment key={idx}>
                                <span className="epd-author">{author.name}</span>
                                {idx < detailPaper.authors.length - 1 && <span className="epd-author-sep">, </span>}
                              </React.Fragment>
                            ))}
                            {(detailPaper.venue || detailPaper.year || detailPaper.fieldsOfStudy?.length > 0) && <span className="epd-meta-dot"> · </span>}
                          </>
                        )}
                        {(detailPaper.venue || detailPaper.year) && (
                          <>
                            <span className="epd-meta-text">Published in </span>
                            {detailPaper.venue && <span className="epd-venue">{detailPaper.venue}</span>}
                            {detailPaper.venue && detailPaper.year && <span> </span>}
                            {detailPaper.year && <span className="epd-year">{detailPaper.year}</span>}
                            {detailPaper.fieldsOfStudy?.length > 0 && <span className="epd-meta-dot"> · </span>}
                          </>
                        )}
                        {detailPaper.fieldsOfStudy?.length > 0 && (
                          <span className="epd-fields">{detailPaper.fieldsOfStudy.join(', ')}</span>
                        )}
                      </div>
                      
                      {/* 折叠状态下显示展开按钮 */}
                      {detailHeaderCollapsed && (
                        <button 
                          className="epd-header-toggle"
                          onClick={() => setDetailHeaderCollapsed(false)}
                          title="展开详情"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                          展开详情
                        </button>
                      )}
                    </div>

                    {/* TLDR - 折叠时隐藏 */}
                    {!detailHeaderCollapsed && detailPaper.tldr && (
                      <div className="epd-tldr">
                        <span className="epd-tldr-badge">TLDR</span>
                        <p className="epd-tldr-text">{detailPaper.tldr.text}</p>
                      </div>
                    )}

                    {/* 摘要 - 折叠时隐藏，默认显示4行 */}
                    {!detailHeaderCollapsed && detailPaper.abstract && (
                      <div className="epd-section">
                        <h2 className="epd-section-title">摘要</h2>
                        <p className={`epd-abstract ${detailAbstractExpanded ? 'epd-abstract-expanded' : ''}`}>
                          {detailPaper.abstract}
                        </p>
                        {detailPaper.abstract.length > 200 && (
                          <button 
                            className="epd-abstract-toggle"
                            onClick={() => setDetailAbstractExpanded(!detailAbstractExpanded)}
                          >
                            {detailAbstractExpanded ? (
                              <>
                                收起
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="18 15 12 9 6 15"/>
                                </svg>
                              </>
                            ) : (
                              <>
                                展开全文
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* 操作按钮 - 折叠时隐藏 */}
                    {!detailHeaderCollapsed && (
                    <div className="search-result-paper-meta epd-paper-meta">
                      {/* 被引用数 */}
                      {detailPaper.citationCount !== undefined && (
                        <>
                          <span className="citation-count">
                            <span className="citation-number">{detailPaper.citationCount}</span>
                            <span className="citation-label">被引</span>
                          </span>
                          <span className="meta-divider"></span>
                        </>
                      )}
                      
                      {/* DOI 链接 */}
                      {detailPaper.externalIds?.DOI && (
                        <a
                          href={`https://doi.org/${detailPaper.externalIds.DOI}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="search-result-paper-doi-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                          </svg>
                          DOI
                        </a>
                      )}
                      
                      {/* PDF 链接 */}
                      {detailPaper.openAccessPdf?.url && (
                        <a 
                          href={detailPaper.openAccessPdf.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="meta-item pdf-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          PDF
                        </a>
                      )}
                      
                      {/* Cite 按钮 */}
                      <button
                        className="search-result-paper-cite-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCitePaper(detailPaper);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
                        </svg>
                        Cite
                      </button>
                    </div>
                    )}

                    {/* 引用文献 & 参考文献 & 相似论文 Tabs */}
                    <div className="epd-section epd-citations-refs">
                      <div className="epd-tabs">
                        <button className={`epd-tab ${detailActiveTab === 'citations' ? 'active' : ''}`} onClick={() => { setDetailActiveTab('citations'); setDetailHeaderCollapsed(false); setSelectedPaper(null); }}>
                          引用文献 <span className="epd-tab-count">{detailPaper.citationCount || 0}</span>
                        </button>
                        <button className={`epd-tab ${detailActiveTab === 'references' ? 'active' : ''}`} onClick={() => { setDetailActiveTab('references'); setDetailHeaderCollapsed(false); setSelectedPaper(null); }}>
                          参考文献 <span className="epd-tab-count">{detailPaper.referenceCount || 0}</span>
                        </button>
                        <button 
                          ref={similarPapersTabRef}
                          className={`epd-tab epd-tab-similar ${detailActiveTab === 'similar' ? 'active' : ''}`} 
                          onClick={() => { setDetailActiveTab('similar'); setDetailHeaderCollapsed(true); handleSimilarTabClick(); setSelectedPaper(null); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
                          </svg>
                          相似论文 {similarPapersData.total > 0 && <span className="epd-tab-count epd-tab-count-similar">{similarPapersData.total}</span>}
                        </button>
                      </div>

                      <div className="epd-tab-content">
                        {detailActiveTab === 'citations' && (
                          <div className="epd-papers-list">
                            {citationsData.papers.length > 0 ? (
                              <>
                                {citationsData.papers.map((paper, idx) => (
                                  <div 
                                    key={paper?.paperId || idx} 
                                    className={`search-result-paper-item ${selectedPaper?.paperId === paper?.paperId ? 'selected' : ''}`}
                                    onClick={() => paper?.paperId && setSelectedPaper(paper)}
                                  >
                                    <div className="search-result-paper-content">
                                      <h3 className="search-result-paper-title">{paper?.title || 'Untitled'}</h3>
                                      
                                      {/* 作者列表 */}
                                      {paper?.authors && paper.authors.length > 0 && (
                                        <div className="search-result-paper-authors-row">
                                          <div className="search-result-paper-author-tags">
                                            {paper.authors.slice(0, 4).map((author, i) => (
                                              <span key={i} className="author-tag">{author.name}</span>
                                            ))}
                                            {paper.authors.length > 4 && (
                                              <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                                            )}
                                          </div>
                                          {/* 研究领域 */}
                                          {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                                            <span className="search-result-paper-fields">
                                              {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* 期刊/会议 + 日期 */}
                                      {(paper?.venue || paper?.publicationDate || paper?.year) && (
                                        <p className="search-result-paper-venue-date">
                                          {paper.venue && (
                                            <span className="search-result-venue-name">{paper.venue}</span>
                                          )}
                                          {paper.venue && (paper.publicationDate || paper.year) && ' · '}
                                          {paper.publicationDate ? (
                                            <span className="pub-date">
                                              {new Date(paper.publicationDate).toLocaleDateString('zh-CN', { 
                                                year: 'numeric',
                                                month: 'long', 
                                                day: 'numeric'
                                              })}
                                            </span>
                                          ) : paper.year && (
                                            <span className="pub-date">{paper.year}年</span>
                                          )}
                                        </p>
                                      )}

                                      {/* TLDR 摘要 */}
                                      {paper?.tldr?.text && (
                                        <div className="paper-tldr">
                                          <span className="tldr-label">TLDR</span>
                                          <span className="tldr-text">
                                            {paper.tldr.text.length > 300 
                                              ? paper.tldr.text.substring(0, 300) + '...' 
                                              : paper.tldr.text}
                                          </span>
                                        </div>
                                      )}

                                      {/* 完整摘要 */}
                                      {paper?.abstract && (
                                        <div className="paper-abstract-section">
                                          <span className="abstract-label">Abstract</span>
                                          <span className="abstract-text">
                                            {paper.abstract.length > 300 
                                              ? paper.abstract.substring(0, 300) + '...' 
                                              : paper.abstract}
                                          </span>
                                        </div>
                                      )}

                                      {/* 底部元信息和操作 */}
                                      <div className="search-result-paper-meta">
                                        {paper?.citationCount !== undefined && (
                                          <>
                                            <span className="citation-count">
                                              <span className="citation-number">{paper.citationCount}</span>
                                              <span className="citation-label">被引</span>
                                            </span>
                                            <span className="meta-divider"></span>
                                          </>
                                        )}
                                        {paper?.externalIds?.DOI && (
                                          <a href={`https://doi.org/${paper.externalIds.DOI}`} target="_blank" rel="noopener noreferrer" className="search-result-paper-doi-link" onClick={(e) => e.stopPropagation()}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                                            DOI
                                          </a>
                                        )}
                                        {paper?.openAccessPdf?.url && (
                                          <a href={paper.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="meta-item pdf-link" onClick={(e) => e.stopPropagation()}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                            PDF
                                          </a>
                                        )}
                                        <button className="search-result-paper-cite-btn" onClick={(e) => { e.stopPropagation(); setCitePaper(paper); }}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/></svg>
                                          Cite
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {/* 分页组件 */}
                                {citationsData.totalPages > 1 && (
                                  <div className="epd-pagination">
                                    <button
                                      className="epd-pagination-btn"
                                      onClick={() => loadCitations(citationsData.currentPage - 1)}
                                      disabled={citationsData.currentPage === 1 || citationsLoading}
                                    >
                                      上一页
                                    </button>
                                    <div className="epd-pagination-pages">
                                      {Array.from({ length: Math.min(5, citationsData.totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (citationsData.totalPages <= 5) {
                                          pageNum = i + 1;
                                        } else if (citationsData.currentPage <= 3) {
                                          pageNum = i + 1;
                                        } else if (citationsData.currentPage >= citationsData.totalPages - 2) {
                                          pageNum = citationsData.totalPages - 4 + i;
                                        } else {
                                          pageNum = citationsData.currentPage - 2 + i;
                                        }
                                        return (
                                          <button
                                            key={pageNum}
                                            className={`epd-pagination-page ${citationsData.currentPage === pageNum ? 'active' : ''}`}
                                            onClick={() => loadCitations(pageNum)}
                                            disabled={citationsLoading}
                                          >
                                            {pageNum}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <button
                                      className="epd-pagination-btn"
                                      onClick={() => loadCitations(citationsData.currentPage + 1)}
                                      disabled={citationsData.currentPage === citationsData.totalPages || citationsLoading}
                                    >
                                      下一页
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : citationsLoading ? (
                              <div className="epd-loading-inline">
                                <div className="epd-loading-spinner"></div>
                                <span>加载引用文献中...</span>
                              </div>
                            ) : (
                              <p className="epd-empty-text">暂无引用信息</p>
                            )}
                          </div>
                        )}

                        {detailActiveTab === 'references' && (
                          <div className="epd-papers-list">
                            {referencesData.papers.length > 0 ? (
                              <>
                                {referencesData.papers.map((paper, idx) => (
                                  <div 
                                    key={paper?.paperId || idx} 
                                    className={`search-result-paper-item ${selectedPaper?.paperId === paper?.paperId ? 'selected' : ''}`}
                                    onClick={() => paper?.paperId && setSelectedPaper(paper)}
                                  >
                                    <div className="search-result-paper-content">
                                      <h3 className="search-result-paper-title">{paper?.title || 'Untitled'}</h3>
                                      
                                      {/* 作者列表 */}
                                      {paper?.authors && paper.authors.length > 0 && (
                                        <div className="search-result-paper-authors-row">
                                          <div className="search-result-paper-author-tags">
                                            {paper.authors.slice(0, 4).map((author, i) => (
                                              <span key={i} className="author-tag">{author.name}</span>
                                            ))}
                                            {paper.authors.length > 4 && (
                                              <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                                            )}
                                          </div>
                                          {/* 研究领域 */}
                                          {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                                            <span className="search-result-paper-fields">
                                              {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* 期刊/会议 + 日期 */}
                                      {(paper?.venue || paper?.publicationDate || paper?.year) && (
                                        <p className="search-result-paper-venue-date">
                                          {paper.venue && (
                                            <span className="search-result-venue-name">{paper.venue}</span>
                                          )}
                                          {paper.venue && (paper.publicationDate || paper.year) && ' · '}
                                          {paper.publicationDate ? (
                                            <span className="pub-date">
                                              {new Date(paper.publicationDate).toLocaleDateString('zh-CN', { 
                                                year: 'numeric',
                                                month: 'long', 
                                                day: 'numeric'
                                              })}
                                            </span>
                                          ) : paper.year && (
                                            <span className="pub-date">{paper.year}年</span>
                                          )}
                                        </p>
                                      )}

                                      {/* TLDR 摘要 */}
                                      {paper?.tldr?.text && (
                                        <div className="paper-tldr">
                                          <span className="tldr-label">TLDR</span>
                                          <span className="tldr-text">
                                            {paper.tldr.text.length > 300 
                                              ? paper.tldr.text.substring(0, 300) + '...' 
                                              : paper.tldr.text}
                                          </span>
                                        </div>
                                      )}

                                      {/* 完整摘要 */}
                                      {paper?.abstract && (
                                        <div className="paper-abstract-section">
                                          <span className="abstract-label">Abstract</span>
                                          <span className="abstract-text">
                                            {paper.abstract.length > 300 
                                              ? paper.abstract.substring(0, 300) + '...' 
                                              : paper.abstract}
                                          </span>
                                        </div>
                                      )}

                                      {/* 底部元信息和操作 */}
                                      <div className="search-result-paper-meta">
                                        {paper?.citationCount !== undefined && (
                                          <>
                                            <span className="citation-count">
                                              <span className="citation-number">{paper.citationCount}</span>
                                              <span className="citation-label">被引</span>
                                            </span>
                                            <span className="meta-divider"></span>
                                          </>
                                        )}
                                        {paper?.externalIds?.DOI && (
                                          <a href={`https://doi.org/${paper.externalIds.DOI}`} target="_blank" rel="noopener noreferrer" className="search-result-paper-doi-link" onClick={(e) => e.stopPropagation()}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                                            DOI
                                          </a>
                                        )}
                                        {paper?.openAccessPdf?.url && (
                                          <a href={paper.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="meta-item pdf-link" onClick={(e) => e.stopPropagation()}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                            PDF
                                          </a>
                                        )}
                                        <button className="search-result-paper-cite-btn" onClick={(e) => { e.stopPropagation(); setCitePaper(paper); }}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/></svg>
                                          Cite
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {/* 分页组件 */}
                                {referencesData.totalPages > 1 && (
                                  <div className="epd-pagination">
                                    <button
                                      className="epd-pagination-btn"
                                      onClick={() => loadReferences(referencesData.currentPage - 1)}
                                      disabled={referencesData.currentPage === 1 || referencesLoading}
                                    >
                                      上一页
                                    </button>
                                    <div className="epd-pagination-pages">
                                      {Array.from({ length: Math.min(5, referencesData.totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (referencesData.totalPages <= 5) {
                                          pageNum = i + 1;
                                        } else if (referencesData.currentPage <= 3) {
                                          pageNum = i + 1;
                                        } else if (referencesData.currentPage >= referencesData.totalPages - 2) {
                                          pageNum = referencesData.totalPages - 4 + i;
                                        } else {
                                          pageNum = referencesData.currentPage - 2 + i;
                                        }
                                        return (
                                          <button
                                            key={pageNum}
                                            className={`epd-pagination-page ${referencesData.currentPage === pageNum ? 'active' : ''}`}
                                            onClick={() => loadReferences(pageNum)}
                                            disabled={referencesLoading}
                                          >
                                            {pageNum}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <button
                                      className="epd-pagination-btn"
                                      onClick={() => loadReferences(referencesData.currentPage + 1)}
                                      disabled={referencesData.currentPage === referencesData.totalPages || referencesLoading}
                                    >
                                      下一页
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : referencesLoading ? (
                              <div className="epd-loading-inline">
                                <div className="epd-loading-spinner"></div>
                                <span>加载参考文献中...</span>
                              </div>
                            ) : (
                              <p className="epd-empty-text">暂无参考文献信息</p>
                            )}
                          </div>
                        )}

                        {detailActiveTab === 'similar' && (
                          <div className="epd-similar-papers" ref={similarPapersListRef}>
                            {/* 头部：统计信息 + 视图切换 - 只有有数据且不在加载时才显示 */}
                            {!similarPapersLoading && similarPapersData.papers.length > 0 && (
                            <div className="results-header">
                              <p className="results-info">
                                  显示 <strong>{(similarPapersData.currentPage - 1) * REFS_PER_PAGE + 1}-{Math.min(similarPapersData.currentPage * REFS_PER_PAGE, similarPapersData.total)}</strong> / 共 <strong>{similarPapersData.total}</strong> 篇相似论文
                              </p>
                              <div className="srp-view-mode-switcher">
                                <button 
                                  className={`srp-view-mode-btn ${similarPapersViewMode === 'list' ? 'active' : ''}`}
                                  onClick={() => {
                                    setSimilarPapersViewMode('list');
                                    // 切换到列表视图时，关闭右侧面板（清除选中的论文和列）
                                    setSelectedPaper(null);
                                    setSimilarSelectedDimensionKey(null);
                                  }}
                                  title="列表视图"
                                >
                                  <List size={18} />
                                  <span>列表</span>
                                </button>
                                <button 
                                    ref={similarTableBtnRef}
                                  className={`srp-view-mode-btn ${similarPapersViewMode === 'table' ? 'active' : ''}`}
                                    onClick={() => {
                                      setSimilarPapersViewMode('table');
                                      // 切换到表格视图时，关闭预览，默认显示列配置面板
                                      setSelectedPaper(null);
                                      // 用户主动点击表格按钮，标记为已点击和已看过引导
                                      hasClickedSimilarTableBtnRef.current = true;
                                      localStorage.setItem('hasSeenTableViewGuide', 'true');
                                      setShowSimilarTableGuide(false);
                                    }}
                                  title="表格视图"
                                >
                                  <Table2 size={18} />
                                  <span>表格</span>
                                </button>
                              </div>
                            </div>
                            )}

                            {similarPapersLoading ? (
                              <div className="epd-loading">
                                <div className="epd-loading-spinner"></div>
                                <p>加载相似论文中...</p>
                              </div>
                            ) : similarPapersData.papers.length > 0 ? (
                              <>
                                {similarPapersViewMode === 'list' ? (
                                  /* 列表视图 - 复用搜索结果列表样式 */
                                  <div className="papers-list">
                                    {similarPapersData.papers.map((paper, idx) => {
                                      const itemIndex = (similarPapersData.currentPage - 1) * REFS_PER_PAGE + idx + 1;
                                      return (
                                        <div 
                                          key={paper?.paperId || idx} 
                                          className={`search-result-paper-item ${selectedPaper?.paperId === paper?.paperId ? 'selected' : ''}`}
                                          onClick={() => paper?.paperId && setSelectedPaper(paper)}
                                        >
                                          <div className="search-result-paper-number">{itemIndex}</div>
                                          <div className="search-result-paper-content">
                                            <h3 className="search-result-paper-title">
                                              {paper?.title || 'Untitled'}
                                            </h3>
                                            
                                            {/* 作者列表 */}
                                            {paper?.authors && paper.authors.length > 0 && (
                                              <div className="search-result-paper-authors-row">
                                                <div className="search-result-paper-author-tags">
                                                  {paper.authors.slice(0, 4).map((author, i) => (
                                                    <span key={i} className="author-tag">{author.name}</span>
                                                  ))}
                                                  {paper.authors.length > 4 && (
                                                    <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                                                  )}
                                                </div>
                                                {/* 研究领域 */}
                                                {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                                                  <span className="search-result-paper-fields">
                                                    {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                                                  </span>
                                                )}
                                              </div>
                                            )}

                                            {/* 期刊/会议 + 日期 */}
                                            {(paper?.venue || paper?.publicationDate || paper?.year) && (
                                              <p className="search-result-paper-venue-date">
                                                {paper.venue && (
                                                  <span className="search-result-venue-name">{paper.venue}</span>
                                                )}
                                                {paper.venue && (paper.publicationDate || paper.year) && ' · '}
                                                {paper.publicationDate ? (
                                                  <span className="pub-date">
                                                    {new Date(paper.publicationDate).toLocaleDateString('zh-CN', { 
                                                      year: 'numeric',
                                                      month: 'long', 
                                                      day: 'numeric'
                                                    })}
                                                  </span>
                                                ) : paper.year && (
                                                  <span className="pub-date">{paper.year}年</span>
                                                )}
                                              </p>
                                            )}

                                            {/* TLDR 摘要 */}
                                            {paper?.tldr?.text && (
                                              <div className="paper-tldr">
                                                <span className="tldr-label">TLDR</span>
                                                <span className="tldr-text">
                                                  {paper.tldr.text.length > 300 
                                                    ? paper.tldr.text.substring(0, 300) + '...' 
                                                    : paper.tldr.text}
                                                </span>
                                              </div>
                                            )}

                                            {/* 完整摘要 */}
                                            {paper?.abstract && (
                                              <div className="paper-abstract-section">
                                                <span className="abstract-label">Abstract</span>
                                                <span className="abstract-text">
                                                  {paper.abstract.length > 300 
                                                    ? paper.abstract.substring(0, 300) + '...' 
                                                    : paper.abstract}
                                                </span>
                                              </div>
                                            )}

                                            {/* 底部元信息和操作 */}
                                            <div className="search-result-paper-meta">
                                              {paper?.citationCount !== undefined && (
                                                <>
                                                  <span className="citation-count">
                                                    <span className="citation-number">{paper.citationCount}</span>
                                                    <span className="citation-label">被引</span>
                                                  </span>
                                                  <span className="meta-divider"></span>
                                                </>
                                              )}
                                              {paper?.externalIds?.DOI && (
                                                <a href={`https://doi.org/${paper.externalIds.DOI}`} target="_blank" rel="noopener noreferrer" className="search-result-paper-doi-link" onClick={(e) => e.stopPropagation()}>
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                                                  DOI
                                                </a>
                                              )}
                                              {paper?.openAccessPdf?.url && (
                                                <a href={paper.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="meta-item pdf-link" onClick={(e) => e.stopPropagation()}>
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                                  PDF
                                                </a>
                                              )}
                                              <button className="search-result-paper-cite-btn" onClick={(e) => { e.stopPropagation(); setCitePaper(paper); }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/></svg>
                                                Cite
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    
                                    {/* 分页组件 - 在列表末尾 */}
                                    {similarPapersData.totalPages > 1 && (
                                      <div className="epd-pagination">
                                        <button
                                          className="epd-pagination-btn"
                                          onClick={() => loadSimilarPapers(similarPapersData.currentPage - 1)}
                                          disabled={similarPapersData.currentPage === 1 || similarPapersLoading}
                                        >
                                          上一页
                                        </button>
                                        <div className="epd-pagination-pages">
                                          {Array.from({ length: Math.min(5, similarPapersData.totalPages) }, (_, i) => {
                                            let pageNum;
                                            if (similarPapersData.totalPages <= 5) {
                                              pageNum = i + 1;
                                            } else if (similarPapersData.currentPage <= 3) {
                                              pageNum = i + 1;
                                            } else if (similarPapersData.currentPage >= similarPapersData.totalPages - 2) {
                                              pageNum = similarPapersData.totalPages - 4 + i;
                                            } else {
                                              pageNum = similarPapersData.currentPage - 2 + i;
                                            }
                                            return (
                                              <button
                                                key={pageNum}
                                                className={`epd-pagination-page ${similarPapersData.currentPage === pageNum ? 'active' : ''}`}
                                                onClick={() => loadSimilarPapers(pageNum)}
                                                disabled={similarPapersLoading}
                                              >
                                                {pageNum}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        <button
                                          className="epd-pagination-btn"
                                          onClick={() => loadSimilarPapers(similarPapersData.currentPage + 1)}
                                          disabled={similarPapersData.currentPage === similarPapersData.totalPages || similarPapersLoading}
                                        >
                                          下一页
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* 表格视图 - 使用 PaperTableView 组件 */
                                  <div className="papers-list ptv-wrapper epd-similar-table">
                                    <PaperTableView 
                                      papers={similarPapersData.papers}
                                      onPaperClick={handleSimilarTablePaperClick}
                                      totalResults={similarPapersData.total}
                                      onLoadMore={() => loadSimilarPapers(similarPapersData.currentPage + 1, true)}
                                      hasMore={similarPapersData.currentPage < similarPapersData.totalPages}
                                      loadingMore={similarPapersLoading}
                                      selectedDimensionKey={similarSelectedDimensionKey}
                                      onDimensionSelect={handleSimilarDimensionSelect}
                                      reloadTrigger={similarTableReloadTrigger}
                                      hideLoadMore={!isAuthenticated}
                                      isSimilarPapersTable={true}
                                    />
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="epd-empty-text">暂无相似论文推荐</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : loading ? (
              <PaperListSkeleton />
            ) : papers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                </div>
                <h3 className="empty-state-title">未找到相关论文</h3>
                <p className="empty-state-description">
                  请尝试使用其他关键词或调整筛选条件
                </p>

                {/* 快捷操作按钮 */}
                <div className="empty-state-actions">
                  <button 
                    className="empty-state-button primary"
                    onClick={() => navigate(`/advanced-search?query=${encodeURIComponent(searchQuery)}`)}
                  >
                    使用智能分析
                  </button>
                </div>
              </div>
            ) : (
            <>
              <div className="results-header">
                {/* 列表视图显示分页统计，表格视图显示总数 */}
                {viewMode === 'list' ? (
                  <p className="results-info">
                    显示 <strong>{startIndex}-{endIndex}</strong> / 共 <strong>{total.toLocaleString()}</strong> 篇论文
                  </p>
                ) : (
                  <p className="results-info">
                    共 <strong>{total.toLocaleString()}</strong> 篇论文
                    <span className="srp-results-info-hint">（仅显示有摘要的论文）</span>
                  </p>
                )}
                
                {/* 视图切换按钮 */}
                <div className="srp-view-mode-switcher">
                  <button
                    className={`srp-view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => {
                      setViewMode('list');
                      // 切换到列表视图时，关闭右侧面板（清除选中的论文和列）
                      setSelectedPaper(null);
                      setSelectedDimensionKey(null);
                    }}
                    title="列表视图"
                  >
                    <List size={18} />
                    <span>列表</span>
                  </button>
                  <button
                    ref={tableViewBtnRef}
                    className={`srp-view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                    onClick={() => {
                      setViewMode('table');
                      // 切换到表格视图时，关闭预览，默认显示列配置面板
                      setSelectedPaper(null);
                      // 用户主动点击表格按钮，标记为已点击和已看过引导
                      hasClickedTableBtnRef.current = true;
                      localStorage.setItem('hasSeenTableViewGuide', 'true');
                      setShowTableGuide(false);
                    }}
                    title="表格视图 (AI分析)"
                  >
                    <Table2 size={18} />
                    <span>表格</span>
                  </button>
                </div>
              </div>

              {viewMode === 'list' ? (
              <div className="papers-list">
                {papers.map((paper, index) => (
                  <div
                    key={paper.paperId}
                    className={`search-result-paper-item ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
                  >
                    <div className="search-result-paper-number">{startIndex + index}</div>
                    <div className="search-result-paper-content">
                      <h3 
                        className="search-result-paper-title" 
                        onClick={() => setSelectedPaper(paper)}
                      >
                        {paper.title}
                      </h3>

                      {/* 作者列表 */}
                      {paper.authors && paper.authors.length > 0 && (
                        <div className="search-result-paper-authors-row">
                          <div className="search-result-paper-author-tags">
                            {paper.authors.slice(0, 4).map((author, idx) => (
                              <span key={idx} className="author-tag">{author.name}</span>
                            ))}
                            {paper.authors.length > 4 && (
                              <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                            )}
                          </div>
                          {/* 研究领域 */}
                          {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                            <span className="search-result-paper-fields">
                              {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 期刊/会议 + 日期 */}
                      {(paper.venue || paper.publicationDate || paper.year) && (
                        <p className="search-result-paper-venue-date">
                          {paper.venue && (
                            <span className="search-result-venue-name">{paper.venue}</span>
                          )}
                          {paper.venue && (paper.publicationDate || paper.year) && ' · '}
                          {paper.publicationDate ? (
                            <span className="pub-date">
                              {new Date(paper.publicationDate).toLocaleDateString('zh-CN', { 
                                year: 'numeric',
                                month: 'long', 
                                day: 'numeric'
                              })}
                            </span>
                          ) : paper.year && (
                            <span className="pub-date">{paper.year}年</span>
                          )}
                        </p>
                      )}

                      {/* TLDR 摘要 */}
                      {paper.tldr && paper.tldr.text && (
                        <div className={`paper-tldr ${expandedTldr[paper.paperId] ? 'expanded' : ''}`}>
                          <span className="tldr-label">TLDR</span>
                          <span className="tldr-text">
                            {expandedTldr[paper.paperId] 
                              ? paper.tldr.text 
                              : (paper.tldr.text.length > 300 
                                  ? paper.tldr.text.substring(0, 300) + '...' 
                                  : paper.tldr.text)
                            }
                          </span>
                          {paper.tldr.text.length > 300 && (
                            <button 
                              className="expand-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTldrExpand(paper.paperId);
                              }}
                            >
                              {expandedTldr[paper.paperId] ? '收起' : '展开'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* 完整摘要 */}
                      {paper.abstract && (
                        <div className={`paper-abstract-section ${expandedAbstract[paper.paperId] ? 'expanded' : ''}`}>
                          <span className="abstract-label">Abstract</span>
                          <span className="abstract-text">
                            {expandedAbstract[paper.paperId] 
                              ? paper.abstract 
                              : (paper.abstract.length > 300 
                                  ? paper.abstract.substring(0, 300) + '...' 
                                  : paper.abstract)
                            }
                          </span>
                          {paper.abstract.length > 300 && (
                            <button 
                              className="expand-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAbstractExpand(paper.paperId);
                              }}
                            >
                              {expandedAbstract[paper.paperId] ? '收起' : '展开'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* 底部元信息和操作 */}
                      <div className="search-result-paper-meta">
                        {/* 被引用数 */}
                        {paper.citationCount !== undefined && (
                          <>
                            <span className="citation-count">
                              <span className="citation-number">{paper.citationCount}</span>
                              <span className="citation-label">被引</span>
                            </span>
                            <span className="meta-divider"></span>
                          </>
                        )}
                        
                        {/* DOI 链接 */}
                        {paper.externalIds?.DOI && (
                          <a
                            href={`https://doi.org/${paper.externalIds.DOI}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="search-result-paper-doi-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                            </svg>
                            DOI
                          </a>
                        )}
                        
                        {/* PDF 链接 */}
                        {paper.openAccessPdf && paper.openAccessPdf.url && (
                          <a 
                            href={paper.openAccessPdf.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meta-item pdf-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                              <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            PDF
                          </a>
                        )}
                        
                        {/* Cite 按钮 */}
                        <button
                          className="search-result-paper-cite-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCitePaper(paper);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
                          </svg>
                          Cite
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              ) : (
                <div className="papers-list ptv-wrapper">
                  <PaperTableView 
                    searchQuery={queryInfo.actualQuery || searchQuery}
                    filters={filters}
                    onPaperClick={handleTablePaperClick}
                    totalResults={total}
                    selectedDimensionKey={selectedDimensionKey}
                    onDimensionSelect={handleDimensionSelect}
                    reloadTrigger={tableReloadTrigger}
                    onSearchWithQuery={handleSearchWithRecommendedQuery}
                  />
                </div>
              )}

              {/* 分页器（表格模式下隐藏） */}
              {viewMode === 'list' && totalPages > 1 && (
                <div className="pagination">
                  {/* 每页数量选择器 - 移到最左侧 */}
                  <div className="page-size-selector">
                    <span className="page-size-label">每页</span>
                    <select
                      className="page-size-select"
                      value={papersPerPage}
                      onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                    <span className="page-size-label">条</span>
                  </div>

                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    上一页
                  </button>

                  <div className="pagination-pages">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          className={`pagination-page ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    下一页
                  </button>
                </div>
                )}
              </>
            )}
        </div>

        {/* 右侧预览区 - PC端始终显示 */}
        {!isCompactLayout && !isMobile && (
          viewMode === 'table' ? (
            // 表格视图：有选中论文时显示预览，否则显示列配置面板
            selectedPaper ? (
              <PaperPreview
                paper={selectedPaper}
                onClose={() => setSelectedPaper(null)}
                width={previewWidth}
                onResizeMouseDown={handlePreviewResizeMouseDown}
                onResizeTouchStart={handlePreviewResizeTouchStart}
                isResizing={isResizingPreview}
              />
            ) : (
            <div 
              className="preview-panel table-column-panel-wrapper"
              style={{ width: previewWidth }}
            >
                {/* 拖拽分隔条 */}
                <div
                  className={`resize-handle ${isResizingPreview ? 'resizing' : ''}`}
                  onMouseDown={handlePreviewResizeMouseDown}
                  onTouchStart={handlePreviewResizeTouchStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="调整面板宽度"
                >
                  <div className="resize-handle-line" />
                </div>
              <TableColumnPanel 
                selectedDimensionKey={selectedDimensionKey}
                onDimensionSelect={setSelectedDimensionKey}
                onDimensionsUpdated={handleDimensionsUpdated}
              />
            </div>
            )
          ) : viewMode === 'paper' && detailActiveTab === 'similar' && similarPapersViewMode === 'table' ? (
            // 论文详情视图 + 相似论文表格视图：有选中论文时显示预览，否则显示列配置面板
            selectedPaper ? (
              <PaperPreview
                paper={selectedPaper}
                onClose={() => setSelectedPaper(null)}
                width={previewWidth}
                onResizeMouseDown={handlePreviewResizeMouseDown}
                onResizeTouchStart={handlePreviewResizeTouchStart}
                isResizing={isResizingPreview}
              />
            ) : (
            <div 
              className="preview-panel table-column-panel-wrapper"
              style={{ width: previewWidth }}
            >
                {/* 拖拽分隔条 */}
                <div
                  className={`resize-handle ${isResizingPreview ? 'resizing' : ''}`}
                  onMouseDown={handlePreviewResizeMouseDown}
                  onTouchStart={handlePreviewResizeTouchStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="调整面板宽度"
                >
                  <div className="resize-handle-line" />
                </div>
              <TableColumnPanel 
                selectedDimensionKey={similarSelectedDimensionKey}
                onDimensionSelect={setSimilarSelectedDimensionKey}
                onDimensionsUpdated={handleSimilarDimensionsUpdated}
              />
            </div>
            )
          ) : viewMode === 'author' && authorPapersViewMode === 'table' ? (
            // 作者视图表格模式：有选中论文时显示预览，否则显示列配置面板
            selectedPaper ? (
              <PaperPreview
                paper={selectedPaper}
                onClose={() => setSelectedPaper(null)}
                width={previewWidth}
                onResizeMouseDown={handlePreviewResizeMouseDown}
                onResizeTouchStart={handlePreviewResizeTouchStart}
                isResizing={isResizingPreview}
              />
            ) : (
              <div 
                className="preview-panel table-column-panel-wrapper"
                style={{ width: previewWidth }}
              >
                {/* 拖拽分隔条 */}
                <div
                  className={`resize-handle ${isResizingPreview ? 'resizing' : ''}`}
                  onMouseDown={handlePreviewResizeMouseDown}
                  onTouchStart={handlePreviewResizeTouchStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="调整面板宽度"
                >
                  <div className="resize-handle-line" />
                </div>
                <TableColumnPanel 
                  selectedDimensionKey={selectedDimensionKey}
                  onDimensionSelect={setSelectedDimensionKey}
                  onDimensionsUpdated={handleDimensionsUpdated}
                />
              </div>
            )
          ) : (
            // 列表视图、论文详情列表视图或作者视图列表模式：显示论文预览
            <PaperPreview
              paper={selectedPaper}
              onClose={() => setSelectedPaper(null)}
              width={previewWidth}
              onResizeMouseDown={handlePreviewResizeMouseDown}
              onResizeTouchStart={handlePreviewResizeTouchStart}
              isResizing={isResizingPreview}
            />
          )
        )}
      </div>
    </div>
        )}
      </div>

      {/* 移动端底部弹窗预览 */}
      {isMobile && selectedPaper && (
        <div className="mobile-preview-overlay" onClick={() => setSelectedPaper(null)}>
          <div className="mobile-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-preview-header">
              <span className="mobile-preview-title">论文详情</span>
              <button 
                className="mobile-preview-close" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedPaper(null);
                }}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="mobile-preview-body">
              <PaperPreview
                paper={selectedPaper}
                onClose={() => setSelectedPaper(null)}
                isMobileModal={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* 引用弹窗 */}
      {citePaper && (
        <CiteModal
          paper={citePaper}
          onClose={() => setCitePaper(null)}
        />
      )}

      {/* 表格视图引导弹窗 */}
      {showTableGuide && (
        <TableViewGuide
          targetRef={tableViewBtnRef}
          onDismiss={() => {
            // X 按钮 - 只关闭，下次还会显示
            setShowTableGuide(false);
          }}
          onClose={() => {
            // "稍后再说" - 关闭并记住
            setShowTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
          }}
          onTryIt={() => {
            // "立即体验" - 关闭并记住，切换到表格视图
            setShowTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
            setViewMode('table');
            // 切换到表格视图时，关闭预览，默认显示列配置面板
            setSelectedPaper(null);
          }}
        />
      )}

      {/* 相似论文引导弹窗 */}
      {showSimilarPapersGuide && (
        <SimilarPapersGuide
          targetRef={similarPapersTabRef}
          onDismiss={() => {
            // X 按钮 - 只关闭，下次还会显示
            setShowSimilarPapersGuide(false);
          }}
          onClose={() => {
            // "稍后再说" - 关闭并记住
            setShowSimilarPapersGuide(false);
            localStorage.setItem('similarPapersGuideShown', 'true');
          }}
          onTryIt={() => {
            // "立即体验" - 关闭并记住，切换到相似论文 Tab
            setShowSimilarPapersGuide(false);
            localStorage.setItem('similarPapersGuideShown', 'true');
            setDetailActiveTab('similar');
            setDetailHeaderCollapsed(true);
          }}
        />
      )}

      {/* 相似论文表格视图引导弹窗 */}
      {showSimilarTableGuide && (
        <TableViewGuide
          targetRef={similarTableBtnRef}
          onDismiss={() => {
            // X 按钮 - 只关闭，下次还会显示
            setShowSimilarTableGuide(false);
          }}
          onClose={() => {
            // "稍后再说" - 关闭并记住
            setShowSimilarTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
          }}
          onTryIt={() => {
            // "立即体验" - 关闭并记住，切换到表格视图
            setShowSimilarTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
            hasClickedSimilarTableBtnRef.current = true;
            setSimilarPapersViewMode('table');
          }}
        />
      )}

      {/* 作者页面表格视图引导弹窗 */}
      {showAuthorTableGuide && (
        <TableViewGuide
          targetRef={authorTableBtnRef}
          onDismiss={() => {
            // X 按钮 - 只关闭，下次还会显示
            setShowAuthorTableGuide(false);
          }}
          onClose={() => {
            // "稍后再说" - 关闭并记住
            setShowAuthorTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
          }}
          onTryIt={() => {
            // "立即体验" - 关闭并记住，切换到表格视图
            setShowAuthorTableGuide(false);
            localStorage.setItem('hasSeenTableViewGuide', 'true');
            hasClickedAuthorTableBtnRef.current = true;
            setAuthorPapersViewMode('table');
            // 切换到表格视图时，关闭预览窗口
            setSelectedPaper(null);
            // 重置表格数据，从第一页开始加载
            setAllAuthorPapers([]);
          }}
        />
      )}

      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default SearchResultsPage;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { publicScholarAPI, analysisDimensionAPI } from '../services/api';
import PaperPreview from '../components/PaperPreview';
import PaperListSkeleton from '../components/PaperListSkeleton';
import PaperDetailSkeleton from '../components/PaperDetailSkeleton';
import CiteModal from '../components/CiteModal';
import SimilarPapersGuide from '../components/SimilarPapersGuide';
import SearchSuggestions from '../components/SearchSuggestions';
import SimplePaperItem from '../components/SimplePaperItem';
import AnalysisCellText from '../components/AnalysisCellText';
import FilterSidebar from '../components/FilterSidebar';
import Pagination from '../components/Pagination';
import SEO from '../components/SEO';
import SearchToAITransition from '../components/SearchToAITransition';
import InsufficientBalanceModal from '../components/InsufficientBalanceModal';
import wsClient from '../services/websocket';
import { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from '../utils/seoHelpers';
import { trackAcademicSearch, EntryPoint } from '../utils/usageTracker';
import { getSearchQuery, setSearchQuery as saveSearchQuery, getSearchFilters, setSearchFilters as saveSearchFilters, setSearchMode as saveSearchMode, getAIModelLevel, setAIConversationId } from '../utils/searchStorage';
import logger from '../utils/logger';
import './styles/search-results/index.css';

// 懒加载 AuthModal 和 AISearchView
const AuthModal = lazy(() => import('../components/AuthModal'));
const AISearchView = lazy(() => import('../components/AISearchView'));

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isMobile } = useSidebar();
  const outletContext = useOutletContext();
  // outletContext 保留用于未来扩展
  void outletContext;

  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 过渡到AI模式的状态
  const [isTransitioningToAI, setIsTransitioningToAI] = useState(false);
  // 标记是否刚从学术检索切换到AI模式（用于显示过渡动画）
  const [justSwitchedToAI, setJustSwitchedToAI] = useState(false);
  // 搜索框的位置信息（用于过渡动画）
  const [searchBoxRect, setSearchBoxRect] = useState(null);
  const searchFormRef = useRef(null);

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

  // 检查是否为 AI 搜索模式
  const isAIMode = searchParams.get('mode') === 'ai';
  
  // 从 sessionStorage 或 URL 参数初始化状态
  const [searchQuery, setSearchQuery] = useState(() => {
    // 优先从 sessionStorage 读取
    const storedQuery = getSearchQuery();
    if (storedQuery) return storedQuery;
    // 兼容旧的 URL 参数方式
    return searchParams.get('query') || '';
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => {
    // 优先从 sessionStorage 读取
    const storedFilters = getSearchFilters();
    if (storedFilters && Object.keys(storedFilters).some(k => storedFilters[k] && (Array.isArray(storedFilters[k]) ? storedFilters[k].length > 0 : storedFilters[k] !== ''))) {
      return storedFilters;
    }
    // 兼容旧的 URL 参数方式
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
  const [showAbstractMode, setShowAbstractMode] = useState({}); // 显示模式：'tldr' 或 'abstract'
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
    return saved ? parseInt(saved, 10) : 20; // 默认20条/页
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

  // 分析维度相关状态
  const [dimensions, setDimensions] = useState([]);
  const [selectedDimensions, setSelectedDimensions] = useState([]); // 支持多选
  const [showDimensionDropdown, setShowDimensionDropdown] = useState(false);
  const [analysisResults, setAnalysisResults] = useState({}); // { paperId: { dimensionKey: result } }
  const [analyzingPapers, setAnalyzingPapers] = useState({}); // { paperId: Set<dimensionKey> } 正在分析的维度
  const [floatPanelExpanded, setFloatPanelExpanded] = useState(false); // 悬浮面板展开状态
  const [floatPanelView, setFloatPanelView] = useState('list'); // 'list' | 'detail' | 'edit' - 面板视图状态
  const [viewingDimension, setViewingDimension] = useState(null); // 当前查看详情的维度
  const [editingDimension, setEditingDimension] = useState(null); // 编辑中的维度，null 表示新增
  const [editForm, setEditForm] = useState({ name: '', description: '' }); // 编辑表单
  const [isSavingDimension, setIsSavingDimension] = useState(false); // 保存中状态
  
  // 扣费相关状态
  const [totalDeducted, setTotalDeducted] = useState(0); // 累计扣费金额
  const [showBalanceModal, setShowBalanceModal] = useState(false); // 是否显示余额不足弹窗
  const [balanceError, setBalanceError] = useState(null); // 余额不足的详细信息
  const analysisAbortedRef = useRef(false); // 是否已中止分析
  const analysisSessionRef = useRef(0); // 分析会话 ID，用于追踪当前页面的分析
  const accumulatedDeductRef = useRef(0); // 使用 ref 累计扣费，避免闭包问题
  // showCustomYearRange, customYearFrom, customYearTo, showAllFields 已移至 FilterSidebar 组件
  const dimensionDropdownRef = useRef(null);
  const [showPaperDrawer, setShowPaperDrawer] = useState(false); // 论文预览抽屉

  const resultsMainRef = useRef(null);
  const papersContainerRef = useRef(null);
  const similarPapersListRef = useRef(null); // 相似论文列表引用
  const similarPapersTabRef = useRef(null); // 相似论文 Tab 引用
  const textareaRef = useRef(null); // 搜索输入框引用（用于搜索建议定位）
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
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
    
    logger.log('[SearchResultsPage] initState:', { hasPaperId, hasAuthorId, returnToTable, returnToSimilarTableFlag });
    
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
  const [authorPapersViewMode, setAuthorPapersViewMode] = useState('list'); // 作者论文视图模式: 'list' 或 'table'
  void setAuthorPapersViewMode; // setter 预留供将来使用
  const [allAuthorPapers, setAllAuthorPapers] = useState([]); // 表格视图累积的所有论文（用于表格视图）
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
  // 合并复制状态为一个对象
  const [detailCopyState, setDetailCopyState] = useState({ doi: false, corpusId: false });
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
  const [allSimilarPapers, setAllSimilarPapers] = useState([]); // 存储所有相似论文数据（用于分页）
  const [showSimilarPapersGuide, setShowSimilarPapersGuide] = useState(false); // 相似论文新手引导
  const hasClickedSimilarTabRef = useRef(false); // 标记用户是否已点击过相似论文标签
  const hasClickedSimilarTableBtnRef = useRef(false); // 标记用户是否已点击过相似论文表格按钮
  
  // 作者页面表格引导相关
  const hasClickedAuthorTableBtnRef = useRef(false); // 标记用户是否已点击过作者页面表格按钮

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
  const performSearch = async (query, currentFilters, page = 1, isNewSearch = true, enableTranslation = true) => {
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
        (page > 1 || !isNewSearch); // 分页或筛选时复用
      
      const params = {
        query: query,
        offset: (page - 1) * papersPerPage,
        limit: papersPerPage,
        // 如果可以复用缓存，禁用后端翻译；否则根据参数决定
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
            logger.log('[Search] Cached new translation:', {
              query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery,
              searchStrategy: responseData.searchStrategy
            });
          }
        }
        
        // 保存查询信息用于展示
        setQueryInfo(finalQueryInfo);

      }
    } catch (error) {
      logger.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 搜索示例轮播效果
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex((prevIndex) => (prevIndex + 1) % searchExamples.length);
    }, 3000); // 每3秒切换一次

    return () => clearInterval(interval);
  }, [searchExamples.length]);

  // 加载分析维度
  useEffect(() => {
    const loadDimensions = async () => {
      try {
        let response;
        if (isAuthenticated) {
          response = await analysisDimensionAPI.getDimensions();
        } else {
          response = await publicScholarAPI.getSystemDimensions();
        }

        if (response.data.code === 0 && response.data.data) {
          const dims = response.data.data.dimensions || [];
          setDimensions(dims);
        }
      } catch (err) {
        logger.error('Failed to load dimensions:', err);
      }
    };
    loadDimensions();
  }, [isAuthenticated]);

  // 点击外部关闭维度下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dimensionDropdownRef.current && !dimensionDropdownRef.current.contains(event.target)) {
        setShowDimensionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 切换维度选择（多选）
  // 注意：维度数据可能使用 dimensionKey 或 key 作为字段名
  const getDimensionKey = useCallback((dim) => dim.dimensionKey || dim.key, []);
  
  const handleDimensionToggle = useCallback((dimension) => {
    // 未登录时，选择维度需要先登录
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    
    const dimKey = getDimensionKey(dimension);
    setSelectedDimensions(prev => {
      const isSelected = prev.some(d => getDimensionKey(d) === dimKey);
      if (isSelected) {
        return prev.filter(d => getDimensionKey(d) !== dimKey);
      } else {
        return [...prev, dimension];
      }
    });
  }, [getDimensionKey, isAuthenticated]);

  // 全选/取消全选维度
  const handleSelectAllDimensions = useCallback(() => {
    // 未登录时，需要先登录
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    
    if (selectedDimensions.length === dimensions.length) {
      setSelectedDimensions([]);
    } else {
      setSelectedDimensions([...dimensions]);
    }
  }, [dimensions, selectedDimensions.length, isAuthenticated]);

  // 清除所有选中的维度
  const handleClearDimensions = useCallback(() => {
    setSelectedDimensions([]);
  }, []);

  // 打开编辑视图（新增或编辑）
  const handleOpenEditView = useCallback((dimension = null) => {
    setEditingDimension(dimension);
    setEditForm({
      name: dimension?.name || '',
      description: dimension?.description || ''
    });
    setFloatPanelView('edit');
  }, []);

  // 关闭编辑视图
  const handleCloseEditView = useCallback(() => {
    setFloatPanelView('list');
    setEditingDimension(null);
    setEditForm({ name: '', description: '' });
  }, []);

  // 生成 dimensionKey
  const generateDimensionKey = useCallback((name) => {
    // 使用时间戳 + 随机数生成唯一 key
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `custom_${timestamp}_${random}`;
  }, []);

  // 刷新维度列表
  const refreshDimensions = useCallback(async () => {
    try {
      const response = isAuthenticated
        ? await analysisDimensionAPI.getDimensions()
        : await publicScholarAPI.getSystemDimensions();
      
      if (response.data.code === 0) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('刷新维度列表失败:', error);
    }
  }, [isAuthenticated]);

  // 保存维度（新增或修改）
  const handleSaveDimension = useCallback(async () => {
    if (!editForm.name.trim() || !editForm.description.trim()) {
      return;
    }

    setIsSavingDimension(true);
    try {
      // 确定 dimensionKey
      let dimensionKey;
      if (editingDimension) {
        // 编辑模式：使用原有的 dimensionKey
        dimensionKey = getDimensionKey(editingDimension);
      } else {
        // 新增模式：生成新的 key
        dimensionKey = generateDimensionKey(editForm.name);
      }

      // 调用 API 创建/更新维度
      const response = await analysisDimensionAPI.createDimension(
        dimensionKey,
        editForm.name.trim(),
        editForm.description.trim()
      );

      if (response.data.code === 0) {
        // 刷新维度列表
        await refreshDimensions();
        // 关闭编辑视图
        handleCloseEditView();
      } else {
        console.error('保存维度失败:', response.data.message);
        alert(response.data.message || '保存失败');
      }
    } catch (error) {
      console.error('保存维度失败:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setIsSavingDimension(false);
    }
  }, [editForm, editingDimension, getDimensionKey, generateDimensionKey, refreshDimensions, handleCloseEditView]);

  // 删除维度
  const handleDeleteDimension = useCallback(async (dimension) => {
    if (!dimension || dimension.userId <= 0) {
      return; // 只能删除自定义维度
    }

    if (!window.confirm(`确定要删除维度「${dimension.name}」吗？`)) {
      return;
    }

    try {
      const response = await analysisDimensionAPI.deleteDimension(dimension.id);
      if (response.data.code === 0) {
        // 从选中列表中移除
        setSelectedDimensions(prev => 
          prev.filter(d => getDimensionKey(d) !== getDimensionKey(dimension))
        );
        // 刷新维度列表
        await refreshDimensions();
        // 如果在详情视图，返回列表
        if (floatPanelView === 'detail') {
          setFloatPanelView('list');
          setViewingDimension(null);
        }
      } else {
        alert(response.data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除维度失败:', error);
      alert('删除失败，请稍后重试');
    }
  }, [getDimensionKey, refreshDimensions, floatPanelView]);

  // 为论文分析所有维度（一次请求返回所有维度结果）
  // 注意：此功能需要登录，未登录用户在选择维度时会被拦截并弹出登录框
  // 返回: { success: boolean, aborted: boolean, deducted: number } - aborted 表示因余额不足中止
  const analyzePaper = useCallback(async (paper) => {
    // 未登录不执行分析
    if (!isAuthenticated) return { success: false, aborted: false, deducted: 0 };
    
    // 如果已中止，跳过
    if (analysisAbortedRef.current) return { success: false, aborted: true, deducted: 0 };
    
    // 优先使用 abstract，如果没有则使用 TLDR
    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) return { success: false, aborted: false, deducted: 0 };

    // 标记为正在分析
    setAnalyzingPapers(prev => ({
      ...prev,
      [paper.paperId]: true
    }));

    try {
      const response = await analysisDimensionAPI.analyzePaper(paper.paperId, paper.title, abstractText);

      if (response.data.code === 0 && response.data.data) {
        // 接口返回格式: { data: { data: { key: value }, dimensions: [...], deducted_amount: number } }
        const responseData = response.data.data;
        const dimensionData = responseData.data || responseData;
        const deductedAmount = responseData.deducted_amount || 0;
        
        // 保存所有维度的分析结果
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: dimensionData
        }));
        
        return { success: true, aborted: false, deducted: deductedAmount };
      } else {
        // API 返回错误
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: response.data.message || '分析失败' }
        }));
        return { success: false, aborted: false, deducted: 0 };
      }
    } catch (error) {
      logger.error('Failed to analyze paper:', paper.paperId, error);
      
      // 检查是否是余额不足错误
      if (error.response?.data?.code === 4020) {
        analysisAbortedRef.current = true;
        setBalanceError({
          ...error.response.data.data,
          alreadyDeducted: accumulatedDeductRef.current // 使用 ref 获取累计扣费
        });
        setShowBalanceModal(true);
        return { success: false, aborted: true, deducted: 0 };
      }
      
      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { _error: true, _message: error.response?.data?.message || '分析失败' }
      }));
      return { success: false, aborted: false, deducted: 0 };
    } finally {
      setAnalyzingPapers(prev => ({
        ...prev,
        [paper.paperId]: false
      }));
    }
  }, [isAuthenticated]);

  // 并发控制：每次最多并发5个请求
  // 分析完成后显示扣费提示 toast（整页分析完成后才显示一次）
  const analyzeWithConcurrency = useCallback(async (papersToAnalyze) => {
    const CONCURRENCY_LIMIT = 5;
    
    // 生成新的会话 ID，用于追踪当前分析任务
    const currentSession = ++analysisSessionRef.current;
    
    // 重置中止标记和累计扣费
    analysisAbortedRef.current = false;
    accumulatedDeductRef.current = 0;
    setTotalDeducted(0);
    
    let aborted = false;
    let totalDeductedInSession = 0;
    
    for (let i = 0; i < papersToAnalyze.length; i += CONCURRENCY_LIMIT) {
      // 如果会话已过期（被新的分析任务取代），停止当前任务
      if (analysisSessionRef.current !== currentSession) {
        return; // 静默退出，不发送 toast
      }
      
      // 如果已中止，跳过后续批次
      if (analysisAbortedRef.current) {
        aborted = true;
        break;
      }
      
      const batch = papersToAnalyze.slice(i, i + CONCURRENCY_LIMIT);
      // 并发执行这一批
      const results = await Promise.all(batch.map(paper => analyzePaper(paper)));
      
      // 累计本批次的扣费
      for (const result of results) {
        if (result.deducted > 0) {
          totalDeductedInSession += result.deducted;
          accumulatedDeductRef.current = totalDeductedInSession;
        }
      }
      
      // 检查是否有中止
      if (results.some(r => r.aborted)) {
        aborted = true;
        break;
      }
    }
    
    // 再次检查会话是否有效
    if (analysisSessionRef.current !== currentSession) {
      return; // 静默退出，不发送 toast
    }
    
    // 整页分析完成后，如果有扣费且未中止，发送 toast 通知
    if (!aborted && totalDeductedInSession > 0) {
      wsClient.emit('toast', {
        title: '扣费提醒',
        content: `本次分析共消耗 ${totalDeductedInSession} 经费`,
        category: 'transaction',
        created_at: new Date().toISOString()
      });
    }
    
    // 重置累计扣费
    accumulatedDeductRef.current = 0;
    setTotalDeducted(0);
  }, [analyzePaper]);

  // 当选中维度变化时，为当前页面论文执行分析
  useEffect(() => {
    if (selectedDimensions.length === 0) return;

    // 找出需要分析的论文（有摘要或TLDR、没有结果、不在分析中）
    const papersToAnalyze = papers.filter(paper => 
      (paper.abstract || paper.tldr?.text) && 
      !analysisResults[paper.paperId] && 
      !analyzingPapers[paper.paperId]
    );

    if (papersToAnalyze.length > 0) {
      // 使用并发控制进行分析
      analyzeWithConcurrency(papersToAnalyze);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimensions.length, papers, analyzeWithConcurrency]); // 移除 analysisResults 和 analyzingPapers 避免循环

  // 点击论文显示抽屉预览
  const handlePaperClick = useCallback((paper) => {
    setSelectedPaper(paper);
    setShowPaperDrawer(true);
  }, []);

  // 关闭论文预览抽屉
  const handleClosePaperDrawer = useCallback(() => {
    setShowPaperDrawer(false);
    setSelectedPaper(null); // 同时取消论文选中状态
  }, []);

  // 表头已集成到表格内部，不再需要滚动同步逻辑

  // 不再需要认证检查 - 允许未登录用户访问

  // 加载论文详情的函数
  const loadPaperDetail = useCallback(async (paperId) => {
    if (!paperId) return;
    
    logger.log('[SearchResultsPage] Loading paper detail:', paperId);
    setViewMode('paper');
    setDetailPaperId(paperId);
    setDetailLoading(true);
    setDetailError(null);
    setDetailPaper(null);
    setDetailAbstractExpanded(false); // 重置摘要展开状态
    
    try {
      // 使用公共 API，支持未登录用户访问
      const response = await publicScholarAPI.getPaper(paperId);
      logger.log('[SearchResultsPage] Paper detail loaded:', response.data);
      // API 返回格式是 {code: 0, message: 'success', data: {...}}，需要取 data.data
      setDetailPaper(response.data.data);
      setDetailLoading(false);
    } catch (error) {
      logger.error('[SearchResultsPage] Failed to load paper details:', error);
      setDetailError('加载论文详情失败');
      setDetailLoading(false);
    }
  }, []);

  // 加载作者详情的函数
  const loadAuthorDetail = useCallback(async (authorId, page = 1) => {
    if (!authorId) return;
    
    logger.log('[SearchResultsPage] Loading author detail:', authorId, 'page:', page);
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
        logger.log('[SearchResultsPage] Author detail loaded:', authorResponse.data);
        if (authorResponse.data.code === 0 && authorResponse.data.data) {
          setDetailAuthor(authorResponse.data.data);
          // 计算总页数
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
            logger.log('[SearchResultsPage] First paper:', papersData[0]);
            setAuthorPapers(papersData);
          } else {
            logger.log('[SearchResultsPage] Batch response failed:', batchResponse.data);
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
  const handleAuthorPapersPageChange = useCallback((newPage) => {
    if (newPage < 1 || newPage > authorPapersTotalPages || newPage === authorPapersPage) return;
    loadAuthorDetail(detailAuthorId, newPage);
  }, [detailAuthorId, authorPapersTotalPages, authorPapersPage, loadAuthorDetail]);

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
      logger.error('[SearchResultsPage] Failed to init author table from first page:', error);
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
    
    logger.log('[SearchResultsPage] URL params changed - paperId:', paperId, 'authorId:', authorId, 'query:', query);
    
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // 监听 URL 参数变化，其他依赖故意省略避免循环

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

  // 初始化时从 sessionStorage 加载搜索结果（不包含 paperId 或 authorId 的情况）
  useEffect(() => {
    const paperId = searchParams.get('paperId');
    const authorId = searchParams.get('authorId');
    
    // 如果有 paperId 或 authorId，由上面的 useEffect 处理
    if (paperId || authorId) return;
    
    // 从 sessionStorage 读取查询（在组件初始化时已经设置了 searchQuery）
    if (searchQuery) {
      performSearch(searchQuery, filters, currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次，故意省略依赖
    
  // 表格视图引导功能已移除（相关状态变量已清理）

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

    // 记录使用统计
    trackAcademicSearch(EntryPoint.RESULT_PAGE, searchQuery);

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

  // 复制DOI
  const copyDetailDoi = (e) => {
    e.stopPropagation();
    if (detailPaper?.externalIds?.DOI) {
      navigator.clipboard.writeText(detailPaper.externalIds.DOI);
      setDetailCopyState(prev => ({ ...prev, doi: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, doi: false })), 2000);
    }
  };

  // 复制CorpusId
  const copyDetailCorpusId = (e) => {
    e.stopPropagation();
    if (detailPaper?.externalIds?.CorpusId) {
      navigator.clipboard.writeText(detailPaper.externalIds.CorpusId.toString());
      setDetailCopyState(prev => ({ ...prev, corpusId: true }));
      setTimeout(() => setDetailCopyState(prev => ({ ...prev, corpusId: false })), 2000);
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
      logger.error('Failed to load citations:', error);
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
      logger.error('Failed to load references:', error);
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
  }, [detailPaper, similarPapersLoading, allSimilarPapers, REFS_PER_PAGE]);

  // 处理选择作者建议
  const handleSelectAuthor = (author) => {
    // 使用作者名字作为搜索查询
    const name = author.name || '';
    const authorId = author.authorId || '';
    setSearchQuery(name);
    saveSearchQuery(name);
    setShowSuggestions(false);
    // 跳转到搜索结果页面，并带上 authorId 以显示作者详情
    const params = new URLSearchParams();
    if (authorId) params.set('authorId', authorId);
    setSearchParams(params);
  };

  // 更新 sessionStorage 和 URL 参数
  const updateURL = (query, currentFilters, page) => {
    // 保存到 sessionStorage
    saveSearchQuery(query);
    saveSearchFilters(currentFilters);
    
    // URL 只保留必要的参数（不包含 query）
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page);

    setSearchParams(params);
  };

  // 应用筛选条件并触发搜索
  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    saveSearchFilters(newFilters);
    
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

    const updateWidth = (clientX) => {
      if (typeof clientX !== 'number' || Number.isNaN(clientX)) {
        return;
      }
      const diff = startClientX - clientX;
      const rawWidth = startWidth + diff;
      const clampedWidth = clampPreviewWidth(rawWidth);
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


  // 生成SEO数据
  const pageTitle = searchQuery
    ? `"${searchQuery}"的搜索结果 - Scholay学术搜索`
    : '搜索结果 - Scholay学术搜索';

  const pageDescription = searchQuery && papers.length > 0
    ? `为您找到${total}篇关于"${searchQuery}"的学术论文。${truncateText(papers[0]?.title || '', 100)}`
    : `使用Scholay智能搜索引擎查找学术论文、研究文献和科研资料。`;

  const breadcrumbData = [
    { name: '首页', url: '/' },
    { name: '搜索结果', url: `/search-results` }
  ];

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
    
    // 未登录时，需要先登录才能使用智能分析
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    
    // 获取搜索框的位置信息
    if (searchFormRef.current) {
      const rect = searchFormRef.current.getBoundingClientRect();
      setSearchBoxRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
    
    // 开始过渡动画
    setIsTransitioningToAI(true);
    
    // 保存搜索词和模式
    saveSearchQuery(searchQuery);
    saveSearchMode('ai');
    // 清除旧的对话ID，确保新搜索会创建新对话
    setAIConversationId(null);
  }, [searchQuery, isAuthenticated]);

  // 过渡动画完成后的回调
  const handleTransitionComplete = useCallback(() => {
    // 关闭过渡动画
    setIsTransitioningToAI(false);
    setSearchBoxRect(null);
    
    // 标记从学术检索切换过来，触发 AI 面板的入场动画
    setJustSwitchedToAI(true);
    
    // 切换到 AI 模式
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('mode', 'ai');
      return newParams;
    });
    
    // 3秒后清除标记
    setTimeout(() => {
      setJustSwitchedToAI(false);
    }, 3000);
  }, [setSearchParams]);

  // 如果是 AI 模式，渲染 AISearchView
  if (isAIMode) {
    return (
      <div className={`search-results-page ai-mode ${justSwitchedToAI ? 'from-academic-search' : ''}`}>
        <Suspense fallback={<div className="loading-placeholder">加载中...</div>}>
          <AISearchView
            initialQuery={searchQuery}
            initialModelLevel={getAIModelLevel()}
            onSwitchToNormal={handleSwitchToNormal}
            fromAcademicSearch={justSwitchedToAI}
          />
        </Suspense>

        {/* 登录弹窗 */}
        {showAuthModal && (
          <Suspense fallback={null}>
            <AuthModal
              isOpen={showAuthModal}
              onClose={() => setShowAuthModal(false)}
              onSuccess={() => setShowAuthModal(false)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`search-results-page ${isTransitioningToAI ? 'transitioning-to-ai' : ''}`}>
        <SEO
          title={pageTitle}
          description={pageDescription}
          keywords={`${searchQuery},学术搜索,论文检索,文献查找,${filters.fieldsOfStudy.join(',')}`}
          canonical={`/search-results`}
          structuredData={papers.length > 0 ? generateSearchResultsSchema(searchQuery, papers) : generateBreadcrumbSchema(breadcrumbData)}
        />

        {/* 过渡遮罩层 */}
        {isTransitioningToAI && (
          <div className="search-transition-overlay" />
        )}

      {/* 主内容区域 */}
      <div className="search-results-content">
          {/* 搜索结果布局 */}
          <div className="results-layout">
            {/* 顶部搜索栏 - 类似 Google 布局 */}
            {((viewMode !== 'paper' && viewMode !== 'author') || showDetailSearch) && (
            <>
            <div className="results-search-header">
              {/* 左侧 Logo 文案 */}
              <div className="results-logo" onClick={() => navigate('/')}>
                <span className="results-logo-text">Scholay</span>
              </div>
              
              {/* 右侧搜索区域 */}
              <div 
                className={`search-results-centered-area ${viewMode === 'table' ? 'table-mode' : ''} ${(viewMode === 'paper' || viewMode === 'author') && showDetailSearch ? 'paper-mode-search' : ''}`}
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
                <form ref={searchFormRef} onSubmit={handleSearch} className="results-composer-wrapper">
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
                      disabled={isTransitioningToAI}
                    />

                    <button type="submit" className="btn-send" disabled={!searchQuery.trim() || loading || isTransitioningToAI}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                    
                    {/* 智能分析切换按钮 */}
                    {searchQuery.trim() && papers.length > 0 && !isTransitioningToAI && (
                      <div className="ai-switch-button-container">
                        <div className="search-box-divider"></div>
                        <button 
                          type="button"
                          className="switch-to-ai-btn"
                          onClick={handleSwitchToAI}
                          disabled={isTransitioningToAI}
                          title="使用当前搜索词进行智能分析"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                          </svg>
                          <span>智能分析</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 搜索建议下拉框 */}
                  {!isTransitioningToAI && (
                    <SearchSuggestions
                      query={searchQuery}
                      onSelectPaper={handleSelectPaper}
                      onSelectAuthor={handleSelectAuthor}
                      onClose={() => setShowSuggestions(false)}
                      visible={showSuggestions}
                      inputRef={textareaRef}
                    />
                  )}
                </form>
              )}

              </div>
            </div>
            {/* 搜索结果提示行已移至表格第一列列头 */}
            </>
            )}

      {/* 三栏布局：筛选侧边栏 + 论文列表 + 分析面板 */}
      <div className={`results-main ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`} ref={resultsMainRef}>
        {/* 左侧筛选侧边栏 - Google Scholar 风格 */}
        {viewMode === 'list' && (
          <FilterSidebar filters={filters} onApplyFilters={applyFilters} />
        )}

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
                        显示 <strong>{(authorPapersPage - 1) * 20 + 1}-{Math.min(authorPapersPage * 20, authorPapersTotal || detailAuthor.paperCount || authorPapers.length)}</strong> / 共 <strong>{authorPapersTotal || detailAuthor.paperCount || authorPapers.length}</strong> 篇论文
                      </p>
                    </div>

                    {/* 论文列表 - 完全复用学术检索的样式 */}
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
                                  {(paper.publicationDate || paper.year) && (
                                    <span className="pub-date pub-year">
                                      {paper.publicationDate 
                                        ? new Date(paper.publicationDate).getFullYear() 
                                        : paper.year}
                                    </span>
                                  )}
                                </p>
                              )}

                              {/* TLDR / 摘要 - 优先显示TLDR，可切换 */}
                              {(paper.tldr?.text || paper.abstract) && (() => {
                                const hasTldr = paper.tldr?.text;
                                const hasAbstract = paper.abstract;
                                // 默认显示 TLDR，如果没有 TLDR 则显示 Abstract
                                const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
                                const showTldr = currentMode === 'tldr' && hasTldr;
                                const showAbstract = currentMode === 'abstract' && hasAbstract;
                                const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
                                const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];
                                
                                return (
                                  <div className="paper-summary-section">
                                    <div className="paper-summary-header">
                                      <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
                                        {showTldr ? 'TLDR' : 'Abstract'}
                                      </span>
                                      {/* 切换按钮 - 只有两者都有时才显示 */}
                                      {hasTldr && hasAbstract && (
                                        <button 
                                          className="summary-toggle-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAbstractMode(prev => ({
                                              ...prev,
                                              [paper.paperId]: currentMode === 'tldr' ? 'abstract' : 'tldr'
                                            }));
                                          }}
                                        >
                                          {showTldr ? '显示摘要' : '显示TLDR'}
                                        </button>
                                      )}
                                    </div>
                                    <span className="summary-text">
                                      {/* 缓冲区逻辑：如果折叠后只剩10个字符以内，直接全部展示 */}
                                      {isExpanded || content.length <= 120
                                        ? content 
                                        : content.substring(0, 100) + '...'
                                      }
                                    </span>
                                    {content.length > 120 && (
                                      <button 
                                        className="expand-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (showTldr) {
                                            toggleTldrExpand(paper.paperId);
                                          } else {
                                            toggleAbstractExpand(paper.paperId);
                                          }
                                        }}
                                      >
                                        {isExpanded ? '收起' : '展开'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}

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
                        <Pagination
                          currentPage={authorPapersPage}
                          totalPages={authorPapersTotalPages}
                          onPageChange={handleAuthorPapersPageChange}
                          showPageSize={false}
                        />
                      </div>
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
                            <button className={`epd-copy-btn ${detailCopyState.doi ? 'copied' : ''}`} title={detailCopyState.doi ? '已复制' : '复制'}>
                              {detailCopyState.doi ? (
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
                              <button className={`epd-copy-btn ${detailCopyState.corpusId ? 'copied' : ''}`} title={detailCopyState.corpusId ? '已复制' : '复制'}>
                                {detailCopyState.corpusId ? (
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
                                  <SimplePaperItem
                                    key={paper?.paperId || idx}
                                    paper={paper}
                                    index={idx}
                                    isSelected={selectedPaper?.paperId === paper?.paperId}
                                    onSelect={(p) => p?.paperId && setSelectedPaper(p)}
                                    onCite={(p) => setCitePaper(p)}
                                  />
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
                                  <SimplePaperItem
                                    key={paper?.paperId || idx}
                                    paper={paper}
                                    index={idx}
                                    isSelected={selectedPaper?.paperId === paper?.paperId}
                                    onSelect={(p) => p?.paperId && setSelectedPaper(p)}
                                    onCite={(p) => setCitePaper(p)}
                                  />
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
                            {/* 头部：统计信息 - 只有有数据且不在加载时才显示 */}
                            {!similarPapersLoading && similarPapersData.papers.length > 0 && (
                            <div className="results-header">
                              <p className="results-info">
                                  显示 <strong>{(similarPapersData.currentPage - 1) * REFS_PER_PAGE + 1}-{Math.min(similarPapersData.currentPage * REFS_PER_PAGE, similarPapersData.total)}</strong> / 共 <strong>{similarPapersData.total}</strong> 篇相似论文
                              </p>
                            </div>
                            )}

                            {similarPapersLoading ? (
                              <div className="epd-loading">
                                <div className="epd-loading-spinner"></div>
                                <p>加载相似论文中...</p>
                              </div>
                            ) : similarPapersData.papers.length > 0 ? (
                              <>
                                  {/* 列表视图 - 复用搜索结果列表样式 */}
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
                                                {(paper.publicationDate || paper.year) && (
                                                  <span className="pub-date pub-year">
                                                    {paper.publicationDate 
                                                      ? new Date(paper.publicationDate).getFullYear() 
                                                      : paper.year}
                                                  </span>
                                                )}
                                              </p>
                                            )}

                                            {/* TLDR 摘要 */}
                                            {paper?.tldr?.text && (
                                              <div className="paper-tldr">
                                                <span className="tldr-label">TLDR</span>
                                                <span className="tldr-text">
                                                  {paper.tldr.text.length > 120 
                                                    ? paper.tldr.text.substring(0, 100) + '...' 
                                                    : paper.tldr.text}
                                                </span>
                                              </div>
                                            )}

                                            {/* 完整摘要 */}
                                            {paper?.abstract && (
                                              <div className="paper-abstract-section">
                                                <span className="abstract-label">Abstract</span>
                                                <span className="abstract-text">
                                                  {paper.abstract.length > 120 
                                                    ? paper.abstract.substring(0, 100) + '...' 
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
                    onClick={() => {
                      // 未登录时，需要先登录才能使用智能分析
                      if (!isAuthenticated) {
                        setShowAuthModal(true);
                        return;
                      }
                      saveSearchMode('ai');
                      setSearchParams(prev => {
                        const newParams = new URLSearchParams(prev);
                        newParams.set('mode', 'ai');
                        return newParams;
                      });
                    }}
                  >
                    使用智能分析
                  </button>
                </div>
              </div>
            ) : (
            <>
              {/* 统一表格结构 - 论文列表作为第一列，分析结果作为后续列 */}
              <div className={`unified-results-table ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`}>
                {/* 表格表头行 - 第一列是搜索结果提示，后面是分析维度列头 */}
                <div className="unified-table-header">
                  {/* 第一列：搜索结果提示 */}
                  <div className="unified-header-info">
                    {queryInfo.translationEnabled && queryInfo.translatedQuery && 
                     queryInfo.searchStrategy !== 'original' && 
                     queryInfo.originalQuery !== queryInfo.translatedQuery ? (
                      <>
                        {(queryInfo.searchStrategy === 'combined' || !queryInfo.searchStrategy) && (
                          <>
                            <span className="hint-text">
                              共找到 <strong>{total.toLocaleString()}</strong> 个 "
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
                              共找到 <strong>{total.toLocaleString()}</strong> 个 "
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
                      </>
                    ) : (
                      <span className="hint-text">
                        共找到 <strong>{total.toLocaleString()}</strong> 个结果
                      </span>
                    )}
                  </div>
                  {/* 分析维度列头 - 只在有选中维度时显示 */}
                  {selectedDimensions.length > 0 && (
                    <div className="unified-header-dims">
                      {/* 已选维度列头 */}
                      {selectedDimensions.map(dim => (
                        <div key={getDimensionKey(dim)} className="unified-header-dim">
                          <span className="dim-header-name">{dim.name}</span>
                          <button 
                            className="dim-header-remove-btn"
                            onClick={() => handleDimensionToggle(dim)}
                            title={`移除 ${dim.name} 维度`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* 表格内容区域 */}
                <div className="unified-table-body">
                  {papers.map((paper, index) => {
                    const paperResults = analysisResults[paper.paperId];
                    const isAnalyzing = analyzingPapers[paper.paperId];
                    const hasError = paperResults?._error;
                    
                    return (
                      <div
                        key={paper.paperId}
                        className={`unified-table-row ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
                        data-paper-index={index}
                      >
                        {/* 论文信息列 - 第一列 */}
                        <div className="unified-cell-paper">
                          <div className="search-result-paper-number">{startIndex + index}</div>
                          <div className="search-result-paper-content">
                      <h3 
                        className="search-result-paper-title" 
                        onClick={() => handlePaperClick(paper)}
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
                          {(paper.publicationDate || paper.year) && (
                            <span className="pub-date pub-year">
                              {paper.publicationDate 
                                ? new Date(paper.publicationDate).getFullYear() 
                                : paper.year}
                            </span>
                          )}
                        </p>
                      )}

                      {/* TLDR / 摘要 - 优先显示TLDR，可切换 */}
                      {(paper.tldr?.text || paper.abstract) && (() => {
                        const hasTldr = paper.tldr?.text;
                        const hasAbstract = paper.abstract;
                        const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
                        const showTldr = currentMode === 'tldr' && hasTldr;
                        const showAbstract = currentMode === 'abstract' && hasAbstract;
                        const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
                        const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];
                        
                        return (
                          <div className="paper-summary-section">
                            <div className="paper-summary-header">
                              <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
                                {showTldr ? 'TLDR' : 'Abstract'}
                              </span>
                              {hasTldr && hasAbstract && (
                                <button 
                                  className="summary-toggle-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAbstractMode(prev => ({
                                      ...prev,
                                      [paper.paperId]: currentMode === 'tldr' ? 'abstract' : 'tldr'
                                    }));
                                  }}
                                >
                                  {showTldr ? '显示摘要' : '显示TLDR'}
                                </button>
                              )}
                            </div>
                            <span className="summary-text">
                              {/* 缓冲区逻辑：如果折叠后只剩10个字符以内，直接全部展示 */}
                              {isExpanded || content.length <= 120
                                ? content 
                                : content.substring(0, 100) + '...'
                              }
                            </span>
                            {content.length > 120 && (
                              <button 
                                className="expand-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (showTldr) {
                                    toggleTldrExpand(paper.paperId);
                                  } else {
                                    toggleAbstractExpand(paper.paperId);
                                  }
                                }}
                              >
                                {isExpanded ? '收起' : '展开'}
                              </button>
                            )}
                          </div>
                        );
                      })()}

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
                  
                  {/* 分析结果列 - 只在有选中维度时显示 */}
                  {selectedDimensions.length > 0 && (
                    <div className="unified-cell-analysis">
                      {selectedDimensions.map(dim => {
                        const dimKey = getDimensionKey(dim);
                        const result = paperResults?.[dimKey];
                        const resultText = typeof result === 'string' ? result : (result ? JSON.stringify(result) : '');
                        
                        return (
                          <div key={dimKey} className="unified-analysis-cell">
                            {isAnalyzing ? (
                              <div className="analysis-cell-loading">
                                <div className="analysis-cell-spinner"></div>
                              </div>
                            ) : (!paper.abstract && !paper.tldr?.text) ? (
                              <span className="analysis-cell-na">无摘要</span>
                            ) : hasError ? (
                              <span className="analysis-cell-error" title={paperResults._message}>分析失败</span>
                            ) : result ? (
                              <AnalysisCellText text={resultText} />
                            ) : paperResults ? (
                              <span className="analysis-cell-na">-</span>
                            ) : (
                              <span className="analysis-cell-pending">等待分析...</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

              {/* 分页器 */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={papersPerPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
              
              {/* 右侧悬浮面板 - AI 分析维度入口 */}
              {papers.length > 0 && (
                <div className={`dimension-float-panel ${selectedDimensions.length > 0 ? 'collapsed' : ''} ${floatPanelExpanded ? 'expanded' : ''}`}>
                  {/* 收起状态的侧边标签 - hover 时展开面板 */}
                  <div 
                    className="dimension-float-collapsed-tab"
                    onMouseEnter={() => setFloatPanelExpanded(true)}
                  >
                    <span>智能矩阵分析</span>
                  </div>
                  {/* 展开状态的完整内容 - 鼠标离开时收起 */}
                  <div 
                    className="dimension-float-content"
                    onMouseLeave={() => setFloatPanelExpanded(false)}
                  >
                    {floatPanelView === 'list' && (
                      <>
                        {/* 列表视图 */}
                        <div className="dimension-float-header">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                            <path d="M2 17l10 5 10-5"/>
                            <path d="M2 12l10 5 10-5"/>
                          </svg>
                          <span>智能矩阵分析</span>
                        </div>
                        <p className="dimension-float-desc">
                          点击维度标签，AI 将从不同角度分析论文
                        </p>
                        <div className="dimension-float-tags">
                          {dimensions.map(dim => {
                            const isSelected = selectedDimensions.some(s => getDimensionKey(s) === getDimensionKey(dim));
                            const isCustom = dim.userId > 0; // userId > 0 表示自定义维度
                            return (
                              <div key={getDimensionKey(dim)} className={`dimension-tag-row ${isCustom ? 'custom' : ''}`}>
                                <button
                                  className={`dimension-tag-btn ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
                                  onClick={() => handleDimensionToggle(dim)}
                                  title={isSelected ? `点击移除 ${dim.name}` : dim.description}
                                >
                                  {isSelected && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                  <span className="dimension-tag-name">{dim.name}</span>
                                </button>
                                <div className="dimension-tag-actions">
                                  <button
                                    className="dimension-tag-action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingDimension(dim);
                                      setFloatPanelView('detail');
                                    }}
                                    title="查看维度详情"
                                  >
                                    详情
                                  </button>
                                  <button
                                    className="dimension-tag-action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEditView(dim);
                                    }}
                                    title={isCustom ? "编辑维度" : "自定义此维度"}
                                  >
                                    修改
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* 底部统计和新增按钮 */}
                        <div className="dimension-float-footer">
                          <div className="dimension-float-stats">
                            已选 {selectedDimensions.length} / 共 {dimensions.length} 个
                            {dimensions.filter(d => d.userId > 0).length > 0 && (
                              <span className="custom-count">（自定义 {dimensions.filter(d => d.userId > 0).length} 个）</span>
                            )}
                          </div>
                          <button 
                            className="dimension-add-btn"
                            onClick={() => handleOpenEditView(null)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19"/>
                              <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            新增
                          </button>
                        </div>
                      </>
                    )}

                    {floatPanelView === 'detail' && (
                      <>
                        {/* 详情视图 */}
                        <div className="dimension-detail-header">
                          <button 
                            className="dimension-detail-back"
                            onClick={() => {
                              setFloatPanelView('list');
                              setViewingDimension(null);
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            返回
                          </button>
                          <div className="dimension-detail-title-wrapper">
                            <span className="dimension-detail-title">{viewingDimension?.name}</span>
                            {viewingDimension?.userId > 0 ? (
                              <span className="custom-badge small">自定义</span>
                            ) : (
                              <span className="system-badge small">系统</span>
                            )}
                          </div>
                        </div>
                        <div className="dimension-detail-content">
                          <div className="dimension-detail-section">
                            <h4 className="dimension-detail-label">分析指令</h4>
                            <p className="dimension-detail-prompt">{viewingDimension?.description}</p>
                          </div>
                        </div>
                        <div className="dimension-detail-actions">
                          <button 
                            className="dimension-action-btn edit"
                            onClick={() => handleOpenEditView(viewingDimension)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            {viewingDimension?.userId > 0 ? '编辑' : '自定义'}
                          </button>
                          {viewingDimension?.userId > 0 && (
                            <button 
                              className="dimension-action-btn delete"
                              onClick={() => handleDeleteDimension(viewingDimension)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                              删除
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {floatPanelView === 'edit' && (
                      <>
                        {/* 编辑/新增视图 */}
                        <div className="dimension-detail-header">
                          <button 
                            className="dimension-detail-back"
                            onClick={handleCloseEditView}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            返回
                          </button>
                          <span className="dimension-detail-title">
                            {editingDimension ? '编辑维度' : '新增维度'}
                          </span>
                        </div>
                        <div className="dimension-edit-form">
                          <div className="dimension-form-group">
                            <label className="dimension-form-label">维度名称</label>
                            <input
                              type="text"
                              className="dimension-form-input"
                              placeholder="输入维度名称..."
                              value={editForm.name}
                              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              maxLength={50}
                            />
                          </div>
                          <div className="dimension-form-group">
                            <label className="dimension-form-label">分析指令</label>
                            <textarea
                              className="dimension-form-textarea"
                              placeholder="输入 AI 分析时使用的指令..."
                              value={editForm.description}
                              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                              rows={5}
                            />
                          </div>
                        </div>
                        <div className="dimension-edit-actions">
                          <button 
                            className="dimension-action-btn cancel"
                            onClick={handleCloseEditView}
                            disabled={isSavingDimension}
                          >
                            取消
                          </button>
                          <button 
                            className="dimension-action-btn save"
                            onClick={handleSaveDimension}
                            disabled={isSavingDimension || !editForm.name.trim() || !editForm.description.trim()}
                          >
                            {isSavingDimension ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              </>
            )}
        </div>


        {/* 右侧预览面板 - 仅在论文详情或作者视图时显示（非抽屉模式） */}
        {!isCompactLayout && !isMobile && (viewMode === 'paper' || viewMode === 'author') && (
          <PaperPreview
            paper={selectedPaper}
            onClose={() => setSelectedPaper(null)}
            width={previewWidth}
            onResizeMouseDown={handlePreviewResizeMouseDown}
            onResizeTouchStart={handlePreviewResizeTouchStart}
            isResizing={isResizingPreview}
          />
        )}
      </div>
    </div>
      </div>

      {/* 论文预览抽屉 - 列表视图时使用 */}
      {showPaperDrawer && selectedPaper && viewMode === 'list' && (
        <div className="paper-drawer-overlay" onClick={handleClosePaperDrawer}>
          <PaperPreview
            paper={selectedPaper}
            onClose={handleClosePaperDrawer}
            isDrawerMode={true}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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

      {/* 经费不足弹窗 */}
      <InsufficientBalanceModal
        isOpen={showBalanceModal}
        onClose={() => {
          setShowBalanceModal(false);
          setBalanceError(null);
          // 重置中止标记，允许用户充值后继续
          analysisAbortedRef.current = false;
        }}
        balance={balanceError?.balance || 0}
        required={balanceError?.required || 0}
        shortage={balanceError?.shortage || 0}
        alreadyDeducted={balanceError?.alreadyDeducted || 0}
      />

      {/* 学术检索到智能分析的过渡动画 */}
      <SearchToAITransition
        isActive={isTransitioningToAI}
        searchQuery={searchQuery}
        sourceRect={searchBoxRect}
        onComplete={handleTransitionComplete}
      />
    </div>
    </>
  );
};

export default SearchResultsPage;

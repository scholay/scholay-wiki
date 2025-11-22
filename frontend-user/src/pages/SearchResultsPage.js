import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { scholarAPI, publicScholarAPI } from '../services/api';
import PaperPreview from '../components/PaperPreview';
import SearchFilters from '../components/SearchFilters';
import PaperListSkeleton from '../components/PaperListSkeleton';
import CiteModal from '../components/CiteModal';
import { NormalSearchIcon, AdvancedSearchIcon } from '../components/SearchIcons';
import { getFormattedSearchHistory, addSearchHistory, deleteSearchHistory, renameSearchHistory, migrateOldSearchHistory } from '../utils/searchHistory';
import SEO from '../components/SEO';
import { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from '../utils/seoHelpers';
import './SearchResultsPage.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('../components/AuthModal'));

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { updateSidebarConfig } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;

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
  });

  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 查询信息状态
  const [queryInfo, setQueryInfo] = useState({
    originalQuery: '',
    translatedQuery: '',
    actualQuery: '',
    translationEnabled: false
  });
  
  // 当前查询的翻译缓存（用于筛选和分页时复用，避免重复翻译）
  const [cachedTranslation, setCachedTranslation] = useState({
    query: '',           // 缓存的查询
    translated: '',      // 翻译结果
    actual: ''           // 实际使用的查询
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
  const [selectedHistoryId, setSelectedHistoryId] = useState(null); // 选中的搜索历史ID
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const [isSearchBarCollapsed, setIsSearchBarCollapsed] = useState(false); // 搜索框收缩状态

  // 执行搜索
  const performSearch = async (query, currentFilters, page = 1, saveToHistory = true, enableTranslation = true) => {
    if (!query.trim()) return;

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

      // 根据用户是否登录选择不同的API
      const searchAPI = isAuthenticated ? scholarAPI : publicScholarAPI;
      const response = await searchAPI.searchPapers(params);

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
            translationEnabled: true
          };
        } else {
          finalQueryInfo = {
            originalQuery: responseData.originalQuery || query,
            translatedQuery: responseData.translatedQuery || '',
            actualQuery: responseData.actualQuery || query,
            translationEnabled: responseData.translationEnabled || false
          };
          
          // 如果是新的翻译结果，更新缓存
          if (responseData.translationEnabled && responseData.translatedQuery) {
            setCachedTranslation({
              query: query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery
            });
            console.log('[Search] Cached new translation:', {
              query,
              translated: responseData.translatedQuery,
              actual: responseData.actualQuery
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

  // 初始化时从URL参数加载并搜索
  useEffect(() => {
    const query = searchParams.get('query');
    if (query) {
      setSearchQuery(query);
      performSearch(query, filters, currentPage);
    }
  }, []);

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

  // 处理搜索
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

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
    if (page > 1) params.set('page', page);

    setSearchParams(params);
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
           filters.venue;
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

  // 判断是否为空状态（没有查询参数）
  const isEmptyState = !searchParams.get('query');

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
              <h1 className="empty-page-title">学术检索</h1>
            </nav>

            <div className="empty-search-content">
              <form onSubmit={handleSearch} className="normal-search-composer-wrapper">
                {/* 输入区域 */}
                <div className="normal-search-composer-input-area">
                  <textarea
                    className="normal-search-chat-input"
                    placeholder={searchExamples[currentExampleIndex]}
                    value={searchQuery}
                    maxLength={1000}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          handleSearch(e);
                        }
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
                                       filters.venue;

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
              <h1 className="page-title">学术检索</h1>
            </nav>

            {/* 居中搜索区域 */}
            <div className={`search-results-centered-area ${isSearchBarCollapsed ? 'collapsed' : ''}`}>
              <form onSubmit={handleSearch} className="results-composer-wrapper">
                {/* 输入区域 */}
                <div className="results-composer-input-area">
                  <textarea
                    className="results-chat-input"
                    placeholder={searchExamples[currentExampleIndex]}
                    value={searchQuery}
                    maxLength={1000}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          handleSearch(e);
                        }
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
                                     filters.venue;

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
              </form>

              {/* 筛选条件面板 */}
              <SearchFilters
                filters={filters}
                onFiltersChange={handleTopFiltersChange}
                isExpanded={showFilters}
                onToggle={() => handleTopFiltersToggle(true)}
              />

              {/* AI翻译提示 - 类似Google/百度搜索的提示 */}
              {queryInfo.translationEnabled && queryInfo.translatedQuery && (
                <div className="search-translation-hint">
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
                </div>
              )}

              {/* 当前筛选条件标签 - 始终保留空间 */}
              <div className={`active-filters-bar ${hasActiveFilters() ? 'has-filters' : 'empty'}`}>
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

      {/* 两栏布局 */}
      <div className="results-main" ref={resultsMainRef}>
        {/* 论文列表区域 */}
        <div className="papers-container" ref={papersContainerRef}>
            {loading ? (
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
                <p className="results-info">
                  显示 <strong>{startIndex}-{endIndex}</strong> / 共 <strong>{total.toLocaleString()}</strong> 篇论文
                </p>
              </div>

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

              {/* 分页器 */}
              {totalPages > 1 && (
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

        {/* 右侧预览区 - 始终显示，无论是否选中论文 */}
        {!isCompactLayout && (
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
        )}
      </div>

      {/* 引用弹窗 */}
      {citePaper && (
        <CiteModal
          paper={citePaper}
          onClose={() => setCitePaper(null)}
        />
      )}
    </div>
  );
};

export default SearchResultsPage;

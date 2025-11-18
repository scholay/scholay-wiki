import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { scholarAPI } from '../services/api';
import FilterSidebar from '../components/FilterSidebar';
import PaperPreview from '../components/PaperPreview';
import SearchFilters from '../components/SearchFilters';
import PaperListSkeleton from '../components/PaperListSkeleton';
import { NormalSearchIcon, AdvancedSearchIcon } from '../components/SearchIcons';
import { getFormattedSearchHistory, addSearchHistory, deleteSearchHistory, renameSearchHistory, migrateOldSearchHistory } from '../utils/searchHistory';
import SEO from '../components/SEO';
import { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from '../utils/seoHelpers';
import './SearchResultsPage.css';

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
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

  const [previewWidth, setPreviewWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedWidth = window.localStorage.getItem('previewPanelWidth');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed)) {
          return clampPreviewWidth(parsed);
        }
      }
    }
    return clampPreviewWidth(480);
  });
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false));

  const initialFilterCollapsed = () => {
    if (typeof window === 'undefined') {
      return true; // 默认收起
    }
    const stored = window.localStorage.getItem('resultsFilterCollapsed');
    if (stored !== null) {
      return stored === 'true';
    }
    return true; // 默认收起状态
  };
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(initialFilterCollapsed);
  const resultsMainRef = useRef(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null); // 选中的搜索历史ID

  // 执行搜索
  const performSearch = async (query, currentFilters, page = 1, saveToHistory = true) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const params = {
        query: query,
        offset: (page - 1) * papersPerPage,
        limit: papersPerPage,
        fields: 'paperId,title,abstract,authors,year,citationCount,url,venue,publicationDate,openAccessPdf,fieldsOfStudy,isOpenAccess,referenceCount,influentialCitationCount,tldr'
      };

      // 添加筛选条件
      if (currentFilters.yearFrom && currentFilters.yearTo) {
        params.year = `${currentFilters.yearFrom}-${currentFilters.yearTo}`;
      } else if (currentFilters.yearFrom) {
        params.year = currentFilters.yearFrom;
      } else if (currentFilters.yearTo) {
        params.year = currentFilters.yearTo;
      }

      if (currentFilters.publicationTypes && currentFilters.publicationTypes.length > 0) {
        params.publicationTypes = currentFilters.publicationTypes.join(',');
      }

      if (currentFilters.fieldsOfStudy && currentFilters.fieldsOfStudy.length > 0) {
        params.fieldsOfStudy = currentFilters.fieldsOfStudy.join(',');
      }

      if (currentFilters.openAccessPdf) {
        params.openAccessPdf = currentFilters.openAccessPdf;
      }

      if (currentFilters.venue) {
        params.venue = currentFilters.venue;
      }

      const response = await scholarAPI.searchPapers(params);

      if (response.data.code === 0 && response.data.data) {
        const searchResults = response.data.data.data || [];
        const resultsTotal = response.data.data.total || 0;
        setPapers(searchResults);
        setTotal(resultsTotal);

        // 只有在saveToHistory为true时才添加到搜索历史
        if (saveToHistory) {
          const historyItem = addSearchHistory(query, currentFilters, resultsTotal, user?.id);
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

  // 更新侧边栏配置
  useEffect(() => {
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
  }, [searchHistory, selectedHistoryId, updateSidebarConfig]);

  // Check authentication - redirect to home if not logged in
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
      if (viewportWidth <= 1024) {
        setFilterSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPreviewWidth]);

  useEffect(() => {
    if (!isCompactLayout && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('resultsFilterCollapsed');
      if (stored !== null) {
        setFilterSidebarCollapsed(stored === 'true');
      }
    }
  }, [isCompactLayout]);

  const toggleFilterSidebar = () => {
    if (isCompactLayout) {
      return;
    }

    setFilterSidebarCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('resultsFilterCollapsed', next ? 'true' : 'false');
      }
      return next;
    });
  };

  // 处理搜索
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // 重置分页
    setCurrentPage(1);

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

  // 处理筛选条件变化
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    updateURL(searchQuery, newFilters, 1);
    performSearch(searchQuery, newFilters, 1);
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
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('previewPanelWidth', Math.round(currentWidth).toString());
      }
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
      <div className={`search-results-content ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded') : 'no-sidebar'}`}>
        {isEmptyState ? (
          // 空状态：类似首页的简洁布局
          <div className="empty-search-layout">
            <nav className="empty-navbar">
              <h1 className="empty-page-title">普通搜索</h1>
            </nav>

            <div className="empty-search-content">
              <form onSubmit={handleSearch} className="normal-search-composer-wrapper">
                {/* 输入区域 */}
                <div className="normal-search-composer-input-area">
                  <textarea
                    className="normal-search-chat-input"
                    placeholder={searchExamples[currentExampleIndex]}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
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
                        <span className="mode-segment-label">普通搜索</span>
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
                onFiltersChange={setFilters}
                isExpanded={showFilters}
                onToggle={() => setShowFilters(!showFilters)}
              />
            </div>
          </div>
        ) : (
          // 有搜索结果时的布局
          <div className="results-layout">
            {/* 顶部标题栏 */}
            <nav className="results-navbar">
              <h1 className="page-title">普通搜索</h1>
            </nav>

            {/* 居中搜索区域 */}
            <div className="centered-search-area">
              <form onSubmit={handleSearch} className="results-composer-wrapper">
                {/* 输入区域 */}
                <div className="results-composer-input-area">
                  {/* 搜索模式标识 - 最左边 */}
                  <div className="search-mode-indicator">
                    <NormalSearchIcon size={16} />
                    <span>普通搜索</span>
                  </div>

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
                      </button>
                    );
                  })()}

                  <textarea
                    className="results-chat-input"
                    placeholder="搜索论文标题、作者、关键词..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          handleSearch(e);
                        }
                      }
                    }}
                    rows={1}
                  />
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
                onFiltersChange={setFilters}
                isExpanded={showFilters}
                onToggle={() => setShowFilters(!showFilters)}
              />
            </div>

      {/* 三栏布局 */}
      <div className="results-main" ref={resultsMainRef}>
        {/* 左侧筛选栏 */}
        {!isCompactLayout && (
          <div className={`filter-sidebar-wrapper ${filterSidebarCollapsed ? 'collapsed' : ''}`}>
            <FilterSidebar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              resultsTotal={total}
            />
          </div>
        )}

        {/* 中间论文列表区域 */}
        <div className="papers-container">
            {loading ? (
              <PaperListSkeleton />
            ) : papers.length === 0 ? (
              <div className="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <h3>未找到相关论文</h3>
                <p>请尝试其他关键词或调整筛选条件</p>
              </div>
            ) : (
            <>
              <div className="results-header">
                {!isCompactLayout && (
                  <button
                    type="button"
                    className={`filter-sidebar-toggle ${filterSidebarCollapsed ? 'collapsed' : ''}`}
                    onClick={toggleFilterSidebar}
                    aria-label={filterSidebarCollapsed ? '展开筛选' : '收起筛选'}
                    aria-expanded={!filterSidebarCollapsed}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    <span>{filterSidebarCollapsed ? '展开筛选' : '收起筛选'}</span>
                  </button>
                )}
                <p className="results-info">
                  显示 <strong>{startIndex}-{endIndex}</strong> / 共 <strong>{total.toLocaleString()}</strong> 篇论文
                </p>
              </div>

              <div className="papers-list">
                {papers.map((paper, index) => (
                  <div
                    key={paper.paperId}
                    className={`paper-item ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
                    onClick={() => setSelectedPaper(paper)}
                  >
                    <div className="paper-number">{startIndex + index}</div>
                    <div className="paper-content">
                      <h3 className="paper-title">{paper.title}</h3>

                      {paper.authors && paper.authors.length > 0 && (
                        <p className="paper-authors">
                          {paper.authors.slice(0, 3).map(a => a.name).join(', ')}
                          {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
                        </p>
                      )}

                      {paper.abstract && (
                        <p className="paper-abstract">
                          {paper.abstract.length > 200 ? paper.abstract.substring(0, 200) + '...' : paper.abstract}
                        </p>
                      )}

                      <div className="paper-meta">
                        {paper.year && <span className="meta-item">{paper.year}</span>}
                        {paper.venue && <span className="meta-item">{paper.venue}</span>}
                        {paper.citationCount !== undefined && (
                          <span className="meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                            </svg>
                            {paper.citationCount} 引用
                          </span>
                        )}
                        {paper.isOpenAccess && (
                          <span className="meta-item open-access">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            开放获取
                          </span>
                        )}
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

        {/* 右侧预览区 - 只在筛选区收起时显示 */}
        {!isCompactLayout && filterSidebarCollapsed && (
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
    </div>
  );
};

export default SearchResultsPage;

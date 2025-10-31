import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../utils/AuthContext';
import AppSidebar from '../components/AppSidebar';
import FilterSidebar from '../components/FilterSidebar';
import PaperPreview from '../components/PaperPreview';
import SearchFilters from '../components/SearchFilters';
import Logo from '../components/Logo';
import { getFormattedSearchHistory, addSearchHistory, deleteSearchHistory } from '../utils/searchHistory';
import './SearchResultsPage.css';

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  // 侧边栏状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [searchHistory, setSearchHistory] = useState([]);

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
  const papersPerPage = 10;

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
      return false;
    }
    const stored = window.localStorage.getItem('resultsFilterCollapsed');
    if (stored !== null) {
      return stored === 'true';
    }
    return window.innerWidth <= 1280;
  };
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(initialFilterCollapsed);
  const resultsMainRef = useRef(null);

  // 执行搜索
  const performSearch = async (query, currentFilters, page = 1) => {
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

      const response = await axios.get(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5411/api/v1'}/scholar/papers/search`,
        { params }
      );

      if (response.data.code === 0 && response.data.data) {
        const searchResults = response.data.data.data || [];
        const resultsTotal = response.data.data.total || 0;
        setPapers(searchResults);
        setTotal(resultsTotal);

        // 添加到搜索历史
        addSearchHistory(query, currentFilters, resultsTotal);
        loadSearchHistory();
      }
    } catch (error) {
      console.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 加载搜索历史
  useEffect(() => {
    loadSearchHistory();
  }, []);

  const loadSearchHistory = () => {
    const history = getFormattedSearchHistory();
    setSearchHistory(history);
  };

  const handleToggleSidebar = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    localStorage.setItem('sidebarCollapsed', newCollapsed.toString());
  };

  const handleSelectSearchHistory = (itemId) => {
    const history = searchHistory.find(h => h.id === itemId);
    if (history) {
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
      performSearch(history.query, history.filters, 1);
    }
  };

  const handleDeleteSearchHistory = (itemId) => {
    deleteSearchHistory(itemId);
    loadSearchHistory();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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

  // 检查是否有活动的筛选条件
  const hasActiveFilters = () => {
    return filters.yearFrom || filters.yearTo ||
           (filters.publicationTypes && filters.publicationTypes.length > 0) ||
           (filters.fieldsOfStudy && filters.fieldsOfStudy.length > 0) ||
           filters.openAccessPdf || filters.venue;
  };

  // 清除所有筛选条件
  const handleClearFilters = () => {
    const emptyFilters = {
      yearFrom: '',
      yearTo: '',
      publicationTypes: [],
      fieldsOfStudy: [],
      openAccessPdf: '',
      venue: '',
    };
    setFilters(emptyFilters);
    setCurrentPage(1);
    updateURL(searchQuery, emptyFilters, 1);
    performSearch(searchQuery, emptyFilters, 1);
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

  return (
    <div className="search-results-page">
      {/* 统一侧边栏 */}
      {isAuthenticated && (
        <AppSidebar
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showHistory={true}
          historyType="search"
          historyItems={searchHistory}
          currentItemId={null}
          onSelectItem={handleSelectSearchHistory}
          onDeleteItem={handleDeleteSearchHistory}
          onNewItem={null}
          historyLoading={false}
          disableActiveState={true}
        />
      )}

      {/* 主内容区域 */}
      <div className={`search-results-content ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded') : 'no-sidebar'}`}>
        {/* 顶部导航栏 */}
        <nav className="results-navbar">
        <div className="navbar-content">
          <div className="navbar-left" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <Logo width={32} height={32} variant="color" />
            <span className="logo-text">Scholabase</span>
          </div>

          {/* 搜索框 */}
          <form onSubmit={handleSearch} className="navbar-search-form">
            <div className="search-input-group">
              <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                className="navbar-search-input"
                placeholder="搜索论文..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className={`filter-toggle-btn ${showFilters ? 'active' : ''} ${hasActiveFilters() ? 'has-filters' : ''}`}
                onClick={(e) => {
                  if (hasActiveFilters() && e.currentTarget.classList.contains('hovering')) {
                    handleClearFilters();
                  } else {
                    setShowFilters(!showFilters);
                  }
                }}
                onMouseEnter={(e) => e.currentTarget.classList.add('hovering')}
                onMouseLeave={(e) => e.currentTarget.classList.remove('hovering')}
                title={hasActiveFilters() ? "悬停清除筛选 / 点击打开筛选" : "筛选条件"}
              >
                <svg className="filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                <svg className="clear-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button type="submit" className="navbar-search-btn" disabled={loading}>
                搜索
              </button>
            </div>
          </form>
        </div>

        {/* 展开的筛选条件 */}
        <div className="navbar-filters-container">
          <SearchFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            isExpanded={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
          />
        </div>
      </nav>

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
            <button
              type="button"
              className={`filter-sidebar-toggle ${filterSidebarCollapsed ? 'collapsed' : ''}`}
              onClick={toggleFilterSidebar}
              aria-label={filterSidebarCollapsed ? '展开筛选条件' : '收起筛选条件'}
              aria-expanded={!filterSidebarCollapsed}
            >
              {filterSidebarCollapsed ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              )}
            </button>
          </div>
        )}

        {/* 中间论文列表 */}
        <div className="papers-container">
          {loading && papers.length === 0 ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>正在搜索论文...</p>
            </div>
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

        {!isCompactLayout && (
          <div
            className={`resize-handle ${isResizingPreview ? 'resizing' : ''}`}
            onMouseDown={handlePreviewResizeMouseDown}
            onTouchStart={handlePreviewResizeTouchStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整预览区域宽度"
          >
            <div className="resize-handle-line" />
          </div>
        )}

        {/* 右侧预览区 */}
        <PaperPreview
          paper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
          width={isCompactLayout ? undefined : previewWidth}
        />
      </div>
      </div>
    </div>
  );
};

export default SearchResultsPage;

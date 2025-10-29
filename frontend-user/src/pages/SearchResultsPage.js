import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import FilterSidebar from '../components/FilterSidebar';
import PaperPreview from '../components/PaperPreview';
import SearchFilters from '../components/SearchFilters';
import './SearchResultsPage.css';

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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
        setPapers(response.data.data.data || []);
        setTotal(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 初始化时从URL参数加载并搜索
  useEffect(() => {
    const query = searchParams.get('query');
    if (query) {
      setSearchQuery(query);
      performSearch(query, filters, currentPage);
    }
  }, []);

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

  // 计算分页信息
  const totalPages = Math.ceil(total / papersPerPage);
  const startIndex = (currentPage - 1) * papersPerPage + 1;
  const endIndex = Math.min(currentPage * papersPerPage, total);

  return (
    <div className="search-results-page">
      {/* 顶部导航栏 */}
      <nav className="results-navbar">
        <div className="navbar-content">
          <div className="navbar-left" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="24" fill="url(#logo-gradient)" opacity="0.2"/>
              <path d="M24 10L34 20H29V34H19V20H14L24 10Z" fill="url(#logo-gradient)"/>
              <rect x="14" y="36" width="20" height="2" rx="1" fill="url(#logo-gradient)"/>
            </svg>
            <span className="logo-text">Scholar</span>
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
                className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                title="筛选条件"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
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
      <div className="results-main">
        {/* 左侧筛选栏 */}
        <FilterSidebar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          resultsTotal={total}
        />

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

        {/* 右侧预览区 */}
        <PaperPreview
          paper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
        />
      </div>
    </div>
  );
};

export default SearchResultsPage;

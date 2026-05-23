/**
 * ============================================================================
 * Scholay 搜索结果页 V2.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * ============================================================================
 *
 * 极简风（参考 scholay.pen 设计稿 [02-搜索]）：
 *   - 顶栏 NavBarV2（与首页共享）
 *   - 模块栏 moduleBar：搜索框 + 红色搜索按钮 + 命中数 + 关键词芯片 +
 *     "矩阵分析 / 科研智能体" 开关
 *   - 主区：
 *       • 默认（list 模式）：论文卡片列表
 *       • 矩阵模式：左侧论文 + 右侧维度分析单元格
 *
 * 旧版的侧拉详情面板（PaperDetailView / AuthorDetailView）已移除；
 * 点击论文标题 → 跳 DOI；摘要旁的 PDF 按钮 → 跳 openAccessPdf。
 * ============================================================================
 */

import React, { useEffect, useRef, useCallback, useState, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import SEO from '../../components/common/SEO';
import NavBarV2 from '../../components/v2/NavBarV2';
import PaperListSkeleton from '../../components/search/PaperListSkeleton';
import { useTranslation } from '../../hooks';
import { useLibrary } from '../../stores/library.store';
import { useJournals } from '../../stores/journals.store';
import { useSearchState } from './hooks/useSearchState';
import { useDimensionAnalysis } from './hooks/useDimensionAnalysis';
import PaperCardV2 from './PaperCardV2';
import MatrixView from './MatrixView';
import { generateSearchResultsSchema, truncateText } from '../../utils/seoHelpers';
import '../styles/SearchResultsV2.css';

// 当前阶段：UI 上还没暴露源切换，固定走 minicod STC 端点。
const FORCED_SOURCE = 'stc';

const AuthModal = lazy(() => import('../../components/auth/AuthModal'));
const CiteModal = lazy(() => import('../../components/search/CiteModal'));

// 默认在矩阵视图中自动加载的前 N 个维度
const MATRIX_AUTO_DIMENSIONS = 4;

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { slug } = useParams();
  const navigate = useNavigate();
  const searchState = useSearchState();
  const dimension = useDimensionAnalysis({
    isAuthenticated: searchState.isAuthenticated,
    setShowAuthModal: searchState.setShowAuthModal,
  });
  const translation = useTranslation();
  const library = useLibrary();
  const journals = useJournals();

  const {
    searchQuery,
    setSearchQuery,
    papers,
    total,
    loading,
    performSearch,
    filters,
    currentPage,
    handlePageChange,
    isAuthenticated,
    showAuthModal,
    setShowAuthModal,
    isAIMode,
    citePaper,
    setCitePaper,
    searchSource,
  } = searchState;

  // 输入框本地态：避免输入即触发搜索
  const [inputQuery, setInputQuery] = useState(searchQuery || '');
  useEffect(() => {
    setInputQuery(searchQuery || '');
  }, [searchQuery]);

  // 视图模式：list | matrix（持久化到 URL ?matrix=1）
  const initialMatrix = searchParams.get('matrix') === '1' || isAIMode;
  const [viewMode, setViewModeState] = useState(initialMatrix ? 'matrix' : 'list');

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'matrix') next.set('matrix', '1');
    else next.delete('matrix');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 进入页面 / query 变化：触发一次搜索
  const lastSearchedRef = useRef('');
  useEffect(() => {
    const q = (searchQuery || '').trim();
    if (!q) return;
    const sig = `${q}|${JSON.stringify(filters)}|${currentPage}`;
    if (lastSearchedRef.current === sig) return;
    lastSearchedRef.current = sig;
    performSearch(q, filters, currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, currentPage]);

  // 矩阵模式：首次进入时加载维度并自动选中前 N 个
  useEffect(() => {
    if (viewMode !== 'matrix') return;
    dimension.loadDimensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== 'matrix') return;
    if (dimension.selectedDimensions.length > 0) return;
    if (dimension.dimensions.length === 0) return;
    const initial = dimension.dimensions.slice(0, MATRIX_AUTO_DIMENSIONS);
    dimension.setSelectedDimensions(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, dimension.dimensions]);

  // 登录用户：每次列表刷新都批量查"哪些已在文献集里"
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!papers || papers.length === 0) return;
    const ids = papers.map((p) => p.paperId).filter(Boolean);
    if (ids.length === 0) return;
    library.checkBatch(searchSource, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, searchSource, isAuthenticated]);

  // 每次列表刷新：把这一页的 venue 去重后批量查期刊分区/IF，命中后回填到所有卡片
  useEffect(() => {
    if (!papers || papers.length === 0) return;
    const venues = Array.from(new Set(
      papers
        .map((p) => p.publicationVenue?.name || p.venue || p.journal?.name)
        .filter(Boolean)
    ));
    if (venues.length === 0) return;
    journals.fetchVenues(venues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers]);

  // 矩阵模式：为可见论文自动入队分析
  useEffect(() => {
    if (viewMode !== 'matrix') return;
    if (!isAuthenticated) return;
    if (dimension.selectedDimensions.length === 0) return;
    papers.forEach((p) => {
      if (!dimension.hasAnalysisResult(p.paperId) && !dimension.isAnalyzing(p.paperId)) {
        dimension.enqueuePaperAnalysis(p);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, papers, dimension.selectedDimensions, isAuthenticated]);

  // ============ URL slug ↔ searchQuery 双向同步 ============
  // 进入页面/点浏览器返回 → 把 slug 写到 state；提交搜索 → 把 query 写到 URL slug。
  useEffect(() => {
    const decoded = slug ? decodeURIComponent(slug) : '';
    if (decoded && decoded !== searchQuery) {
      setSearchQuery(decoded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // 强制走 STC：UI 上还没暴露源切换，避免历史 localStorage 残留 olx 导致结果差异
  useEffect(() => {
    if (searchState.searchSource !== FORCED_SOURCE) {
      searchState.setSearchSource(FORCED_SOURCE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 顶栏搜索按钮提交：navigate 到新 slug，slug 变化触发上面的 effect 写 state，
  // 再触发 useSearchState 里那个 [searchQuery] effect 执行实际搜索。
  const submitSearch = useCallback((q) => {
    const trimmed = (q ?? inputQuery).trim();
    if (!trimmed) return;
    const target = `/search-results/${encodeURIComponent(trimmed)}`;
    navigate(target);
  }, [inputQuery, navigate]);

  const onSearchSubmit = (e) => {
    e?.preventDefault();
    submitSearch();
  };

  const toggleMatrix = useCallback(() => {
    if (viewMode === 'matrix') {
      setViewMode('list');
      return;
    }
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setViewMode('matrix');
  }, [viewMode, isAuthenticated, setShowAuthModal, setViewMode]);

  // 关键词芯片（来自查询拆分）
  const keywordChips = useMemo(() => {
    const q = (searchQuery || '').trim();
    if (!q) return [];
    const tokens = q.split(/[\s,，、]+/).filter((t) => t.length >= 2);
    return [...new Set(tokens)].slice(0, 4);
  }, [searchQuery]);

  const totalText = useMemo(() => {
    if (loading && total === 0) return '搜索中…';
    if (!total) return '';
    return `找到 ${total.toLocaleString('en-US')} 篇相关文献`;
  }, [loading, total]);

  const pageSize = searchState.papersPerPage || 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="srv2">
      <SEO
        title={searchQuery ? `${searchQuery} - 搜索结果 | Scholay` : 'Scholay 学术搜索'}
        description={searchQuery
          ? `Scholay 学术搜索：${searchQuery}。${total > 0 ? `共找到 ${total} 篇相关文献` : ''}`
          : 'AI 驱动的学术搜索平台'}
        canonical={`/search-results${searchQuery ? `?query=${encodeURIComponent(searchQuery)}` : ''}`}
        structuredData={papers.length > 0
          ? generateSearchResultsSchema(searchQuery, papers.slice(0, 10).map((p) => ({
              paperId: p.paperId,
              title: p.title,
              authors: p.authors || [],
              year: p.year || (p.publicationDate ? new Date(p.publicationDate).getFullYear() : undefined),
              abstract: truncateText(p.abstract || p.tldr?.text || '', 200),
            })))
          : undefined}
      />

      <NavBarV2 onLoginClick={() => setShowAuthModal(true)} />

      {/* 顶部细进度条：搜索/筛选刷新时显示，替代旧的整页蒙层 */}
      <div className={`srv2-topbar ${loading ? 'is-on' : ''}`} aria-hidden="true">
        <div className="srv2-topbar-fill" />
      </div>

      {/* ============ 模块栏 ============ */}
      <div className="srv2-modulebar">
        <form className="srv2-modulebar-inner" onSubmit={onSearchSubmit} role="search">
          <div className="srv2-searchbar">
            <input
              className="srv2-searchbar-input"
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="搜索学术论文、期刊、作者…"
              aria-label="学术搜索"
            />
          </div>
          <button type="submit" className="srv2-search-btn" disabled={!inputQuery.trim()}>
            搜索
          </button>

          <div className="srv2-totaltext">{totalText}</div>

          <div className="srv2-chips">
            {keywordChips.map((tag) => (
              <button
                type="button"
                key={tag}
                className="srv2-chip"
                onClick={() => {
                  setInputQuery(tag);
                  submitSearch(tag);
                }}
                title={`筛选关键词：${tag}`}
              >
                <span className="srv2-chip-hash">#</span>
                <span className="srv2-chip-text">{tag}</span>
              </button>
            ))}
          </div>

          <div className="srv2-spacer" />

          <div className="srv2-toggles">
            <button
              type="button"
              className={`srv2-toggle ${viewMode === 'matrix' ? 'is-on' : ''}`}
              onClick={toggleMatrix}
              aria-pressed={viewMode === 'matrix'}
              title="矩阵分析：用 AI 维度逐篇拆解论文"
            >
              <span className="srv2-toggle-track">
                <span className="srv2-toggle-thumb" />
              </span>
              <span className="srv2-toggle-label">矩阵分析</span>
            </button>

            <button
              type="button"
              className="srv2-toggle is-disabled"
              disabled
              title="科研智能体功能开发中"
              aria-disabled="true"
            >
              <span className="srv2-toggle-track">
                <span className="srv2-toggle-thumb" />
              </span>
              <span className="srv2-toggle-label">科研智能体</span>
            </button>
          </div>
        </form>
      </div>

      {/* ============ 主区 ============ */}
      <main className="srv2-main">
        {!searchQuery ? (
          <div className="srv2-empty">输入关键词开始搜索学术文献</div>
        ) : loading && papers.length === 0 ? (
          <div className="srv2-skeleton-wrap"><PaperListSkeleton count={5} /></div>
        ) : papers.length === 0 ? (
          <div className="srv2-empty">没有找到与「{searchQuery}」相关的文献</div>
        ) : viewMode === 'matrix' ? (
          <MatrixView
            papers={papers}
            dimensions={dimension.dimensions}
            selectedDimensions={dimension.selectedDimensions}
            setSelectedDimensions={dimension.setSelectedDimensions}
            getDimensionKey={dimension.getDimensionKey}
            analysisResults={dimension.analysisResults}
            analyzingPapers={dimension.analyzingPapers}
            translation={translation}
            onCite={setCitePaper}
          />
        ) : (
          <div className={`srv2-list ${loading ? 'is-refetching' : ''}`}>
            {papers.map((paper) => (
              <PaperCardV2
                key={paper.paperId}
                paper={paper}
                source={searchSource}
                translation={translation}
                onCite={() => setCitePaper(paper)}
                onAuthRequired={() => setShowAuthModal(true)}
              />
            ))}
          </div>
        )}

        {searchQuery && papers.length > 0 && totalPages > 1 && (
          <div className="srv2-pagination">
            <button
              type="button"
              className="srv2-pager-btn"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              ‹ 上一页
            </button>
            <span className="srv2-pager-info">
              第 <strong>{currentPage}</strong> / {totalPages} 页
            </span>
            <button
              type="button"
              className="srv2-pager-btn"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              下一页 ›
            </button>
          </div>
        )}
      </main>

      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}

      {citePaper && (
        <Suspense fallback={null}>
          <CiteModal paper={citePaper} onClose={() => setCitePaper(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default SearchResultsPage;

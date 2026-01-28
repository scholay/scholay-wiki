/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, lazy, Suspense } from 'react';
import { useOutletContext } from 'react-router-dom';
import PaperPreview from '../../components/PaperPreview';
import PaperListSkeleton from '../../components/PaperListSkeleton';
import CiteModal from '../../components/CiteModal';
import SimilarPapersGuide from '../../components/SimilarPapersGuide';
import SearchSuggestions from '../../components/SearchSuggestions';
import FilterSidebar from '../../components/FilterSidebar';
import SEO from '../../components/SEO';
import SearchToAITransition from '../../components/SearchToAITransition';
import InsufficientBalanceModal from '../../components/InsufficientBalanceModal';
import { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from '../../utils/seoHelpers';
import { setSearchQuery as saveSearchQuery } from '../../utils/searchStorage';
import { trackDirectSearch, EntryPoint } from '../../utils/usageTracker';
import analysisQueue from '../../utils/analysisQueue';
import logger from '../../utils/logger';
import { AdvancedSearchIcon } from '../../components/SearchIcons';

// 子视图组件
import AuthorDetailView from './AuthorDetailView';
import PaperDetailView from './PaperDetailView';
import EmptyState from './EmptyState';
import SearchResultsListView from './SearchResultsListView';

// Hooks
import { useSearchState } from './hooks/useSearchState';
import { usePaperDetail } from './hooks/usePaperDetail';
import { useAuthorDetail } from './hooks/useAuthorDetail';
import { useDimensionAnalysis } from './hooks/useDimensionAnalysis';
import { usePreviewResize } from './hooks/usePreviewResize';
import { usePdfAvailability } from '../../hooks/usePdfAvailability';

// 样式
import '../styles/search-results/index.css';

// 懒加载组件
const AuthModal = lazy(() => import('../../components/AuthModal'));
const AISearchView = lazy(() => import('../../components/AISearchView'));

// 搜索示例数据
const searchExamples = [
  '搜索论文标题、作者、关键词...',
  '示例：深度学习在医学影像诊断中的应用',
  '示例：量子纠缠在量子通信中的研究',
  '示例：CRISPR基因编辑技术的伦理问题',
  '示例：碳纳米管在新能源电池中的应用',
  '示例：行为经济学对消费决策的影响',
  '示例：气候变化对海洋生态系统的影响',
  '示例：人工智能在药物研发中的应用',
  '示例：区块链技术在供应链管理中的创新',
  '示例：纳米机器人在精准医疗中的前景',
  '示例：社交媒体对青少年心理健康的影响'
];

const SearchResultsPage = () => {
  const outletContext = useOutletContext();
  void outletContext;

  // 核心搜索状态
  const searchState = useSearchState();

  // 论文详情
  const paperDetail = usePaperDetail();

  // 作者详情
  const authorDetail = useAuthorDetail();

  // 维度分析
  const dimensionAnalysis = useDimensionAnalysis({
    isAuthenticated: searchState.isAuthenticated,
    setShowAuthModal: searchState.setShowAuthModal,
  });

  // 预览面板调整
  const previewResize = usePreviewResize();

  // PDF 可用性检测
  const pdfAvailability = usePdfAvailability();

  // 搜索示例轮播效果
  useEffect(() => {
    const interval = setInterval(() => {
      searchState.setCurrentExampleIndex((prevIndex) => (prevIndex + 1) % searchExamples.length);
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.setCurrentExampleIndex]);

  // 加载分析维度
  useEffect(() => {
    dimensionAnalysis.loadDimensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.isAuthenticated, dimensionAnalysis.loadDimensions]);

  // 初始化时设置 refs
  useEffect(() => {
    if (searchState.initState.returnToTable) {
      searchState.returnedFromLogin.current = true;
    }
    if (searchState.initState.returnToSimilarTable) {
      searchState.returnedToSimilarTable.current = true;
    }
  }, [searchState.initState, searchState.returnedFromLogin, searchState.returnedToSimilarTable]);

  // 监听 URL 中的 paperId 或 authorId 参数变化
  useEffect(() => {
    const paperId = searchState.searchParams.get('paperId');
    const authorId = searchState.searchParams.get('authorId');
    const query = searchState.searchParams.get('query');

    logger.log('[SearchResultsPage] URL params changed - paperId:', paperId, 'authorId:', authorId, 'query:', query);

    if (authorId) {
      authorDetail.loadAuthorDetail(authorId, 1, searchState.setViewMode);
      if (query) {
        searchState.setSearchQuery(query);
      }
    } else if (paperId) {
      paperDetail.loadPaperDetail(paperId, searchState.setViewMode);
      if (query) {
        searchState.setSearchQuery(query);
      }
    }
  }, [searchState.searchParams, authorDetail.loadAuthorDetail, paperDetail.loadPaperDetail, searchState.setViewMode, searchState.setSearchQuery]);

  // 相似论文新手引导
  useEffect(() => {
    if (paperDetail.detailLoading || !searchState.selectedPaper) return;

    const hasSeenSimilarGuide = localStorage.getItem('similarPapersGuideShown');
    if (hasSeenSimilarGuide) return;

    if (searchState.hasClickedSimilarTabRef.current) return;

    const timer = setTimeout(() => {
      if (searchState.hasClickedSimilarTabRef.current) return;

      if (searchState.similarPapersTabRef.current) {
        const rect = searchState.similarPapersTabRef.current.getBoundingClientRect();
        const isVisible = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        if (!isVisible) {
          searchState.similarPapersTabRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
          setTimeout(() => {
            if (!searchState.hasClickedSimilarTabRef.current) {
              paperDetail.setShowSimilarPapersGuide(true);
            }
          }, 500);
        } else {
          paperDetail.setShowSimilarPapersGuide(true);
        }
      } else {
        paperDetail.setShowSimilarPapersGuide(true);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [paperDetail.detailLoading, searchState.selectedPaper, searchState.hasClickedSimilarTabRef, searchState.similarPapersTabRef, paperDetail]);

  // 初始化时从 sessionStorage 加载搜索结果（从首页跳转过来时触发）
  useEffect(() => {
    const paperId = searchState.searchParams.get('paperId');
    const authorId = searchState.searchParams.get('authorId');

    if (paperId || authorId) return;

    // AI 模式不在这里执行搜索（由 AISearchView 处理）
    if (searchState.isAIMode) return;

    if (searchState.searchQuery) {
      // 记录直接检索使用统计（仅普通搜索模式，从首页跳转）
      trackDirectSearch(searchState.searchQuery, EntryPoint.HOME_PAGE);
      searchState.performSearch(searchState.searchQuery, searchState.filters, searchState.currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 论文详情模式下：点击外部或滚动时收起搜索框
  useEffect(() => {
    if (searchState.viewMode !== 'paper') return;

    if (searchState.showDetailSearch) {
      setTimeout(() => {
        const textarea = document.querySelector('.results-chat-input');
        if (textarea) {
          textarea.focus();
        }
      }, 100);
    }

    const handleClickOutside = (e) => {
      if (!searchState.showDetailSearch) return;

      const searchArea = document.querySelector('.search-results-centered-area');
      const searchBtn = document.querySelector('.epd-navbar-search-btn');

      if (searchArea && !searchArea.contains(e.target) &&
          searchBtn && !searchBtn.contains(e.target)) {
        searchState.setShowDetailSearch(false);
      }
    };

    const handleScroll = () => {
      if (searchState.showDetailSearch) {
        searchState.setShowDetailSearch(false);
      }
    };

    const container = searchState.papersContainerRef.current;

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
  }, [searchState.viewMode, searchState.showDetailSearch, searchState.papersContainerRef, searchState]);

  // 论文详情加载后，自动加载引用文献
  useEffect(() => {
    if (paperDetail.detailPaper && searchState.viewMode === 'paper') {
      paperDetail.resetDetailData();
      if (paperDetail.detailActiveTab === 'citations') {
        paperDetail.loadCitations(1, searchState.setSelectedPaper);
      } else if (paperDetail.detailActiveTab === 'references') {
        paperDetail.loadReferences(1, searchState.setSelectedPaper);
      } else if (paperDetail.detailActiveTab === 'similar') {
        paperDetail.loadSimilarPapers(1, false, searchState.setSelectedPaper);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperDetail.detailPaper, searchState.viewMode]);

  // 切换 Tab 时加载对应数据
  useEffect(() => {
    if (!paperDetail.detailPaper || searchState.viewMode !== 'paper') return;

    if (paperDetail.detailActiveTab === 'citations' && paperDetail.citationsData.papers.length === 0 && paperDetail.citationsData.total === 0) {
      paperDetail.loadCitations(1, searchState.setSelectedPaper);
    } else if (paperDetail.detailActiveTab === 'references' && paperDetail.referencesData.papers.length === 0 && paperDetail.referencesData.total === 0) {
      paperDetail.loadReferences(1, searchState.setSelectedPaper);
    } else if (paperDetail.detailActiveTab === 'similar' && paperDetail.similarPapersData.papers.length === 0 && paperDetail.similarPapersData.total === 0) {
      paperDetail.loadSimilarPapers(1, false, searchState.setSelectedPaper);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperDetail.detailActiveTab]);

  // 监听相似论文列表滚动和点击
  useEffect(() => {
    if (paperDetail.detailActiveTab !== 'similar' || paperDetail.detailHeaderCollapsed) return;

    const handleScrollOrClick = () => {
      paperDetail.setDetailHeaderCollapsed(true);
    };

    const listEl = searchState.similarPapersListRef.current;
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
  }, [paperDetail.detailActiveTab, paperDetail.detailHeaderCollapsed, searchState.similarPapersListRef, paperDetail]);

  // 作者视图表格初始化
  useEffect(() => {
    if (searchState.viewMode === 'author' && authorDetail.authorPapersViewMode === 'table' && authorDetail.detailAuthorId && authorDetail.allAuthorPapers.length === 0 && !authorDetail.authorPapersLoading) {
      authorDetail.initAuthorTableFromFirstPage();
    }
  }, [searchState.viewMode, authorDetail.authorPapersViewMode, authorDetail.detailAuthorId, authorDetail.allAuthorPapers.length, authorDetail.authorPapersLoading, authorDetail]);

  // 当页面切换或取消选择维度时，清空分析队列
  useEffect(() => {
    // 页面切换时清空队列，让新页面的论文重新排队
    return () => {
      analysisQueue.clear();
    };
  }, [searchState.currentPage]);

  // 当取消选择所有维度时，清空队列
  useEffect(() => {
    if (dimensionAnalysis.selectedDimensions.length === 0) {
      analysisQueue.clear();
    }
  }, [dimensionAnalysis.selectedDimensions.length]);

  // 处理选择论文建议
  const handleSelectPaper = async (paper) => {
    searchState.setShowSuggestions(false);
    searchState.setSearchQuery(paper.title);
    paperDetail.setDetailActiveTab('citations');

    const params = new URLSearchParams(searchState.searchParams);
    params.set('paperId', paper.id);
    searchState.setSearchParams(params);

    paperDetail.loadPaperDetail(paper.id, searchState.setViewMode);
  };

  // 处理选择作者建议
  const handleSelectAuthor = (author) => {
    const name = author.name || '';
    const authorId = author.authorId || '';
    searchState.setSearchQuery(name);
    saveSearchQuery(name);
    searchState.setShowSuggestions(false);

    const params = new URLSearchParams();
    if (authorId) params.set('authorId', authorId);
    searchState.setSearchParams(params);
  };

  // 计算分页信息
  const totalPages = Math.ceil(searchState.total / searchState.papersPerPage);
  const startIndex = (searchState.currentPage - 1) * searchState.papersPerPage + 1;

  // 生成SEO数据
  const pageTitle = searchState.searchQuery
    ? `"${searchState.searchQuery}"的搜索结果 - Scholay学术搜索`
    : '搜索结果 - Scholay学术搜索';

  const pageDescription = searchState.searchQuery && searchState.papers.length > 0
    ? `为您找到${searchState.total}篇关于"${searchState.searchQuery}"的学术论文。${truncateText(searchState.papers[0]?.title || '', 100)}`
    : `使用Scholay智能搜索引擎查找学术论文、研究文献和科研资料。`;

  const breadcrumbData = [
    { name: '首页', url: '/' },
    { name: '搜索结果', url: `/search-results` }
  ];

  // 如果是 AI 模式，渲染 AISearchView
  if (searchState.isAIMode) {
    return (
      <div className={`search-results-page ai-mode ${searchState.justSwitchedToAI ? 'from-academic-search' : ''}`}>
        <Suspense fallback={<div className="loading-placeholder">加载中...</div>}>
          <AISearchView
            initialQuery={searchState.searchQuery}
            initialModelLevel={searchState.getAIModelLevel()}
            onSwitchToNormal={searchState.handleSwitchToNormal}
            fromAcademicSearch={searchState.justSwitchedToAI}
          />
        </Suspense>

        {searchState.showAuthModal && (
          <Suspense fallback={null}>
            <AuthModal
              isOpen={searchState.showAuthModal}
              onClose={() => searchState.setShowAuthModal(false)}
              onSuccess={() => searchState.setShowAuthModal(false)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`search-results-page ${searchState.isTransitioningToAI ? 'transitioning-to-ai' : ''}`}>
        <SEO
          title={pageTitle}
          description={pageDescription}
          keywords={`${searchState.searchQuery},学术搜索,论文检索,文献查找,${searchState.filters.fieldsOfStudy.join(',')}`}
          canonical={`/search-results`}
          structuredData={searchState.papers.length > 0 ? generateSearchResultsSchema(searchState.searchQuery, searchState.papers) : generateBreadcrumbSchema(breadcrumbData)}
        />

        {searchState.isTransitioningToAI && (
          <div className="search-transition-overlay" />
        )}

        <div className="search-results-content">
          <div className="results-layout">
            {/* 顶部搜索栏 */}
            {((searchState.viewMode !== 'paper' && searchState.viewMode !== 'author') || searchState.showDetailSearch) && (
              <>
                <div className="results-search-header">
                  <div className="results-logo" onClick={() => searchState.navigate('/')}>
                    <img src="/brand-text.svg" alt="Scholay" className="results-brand-text" />
                  </div>

                  <div
                    className={`search-results-centered-area ${searchState.viewMode === 'table' ? 'table-mode' : ''} ${(searchState.viewMode === 'paper' || searchState.viewMode === 'author') && searchState.showDetailSearch ? 'paper-mode-search' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {searchState.viewMode === 'table' ? (
                      <div
                        className="srp-table-search-display"
                        onClick={() => {
                          searchState.setViewMode('list');
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
                          <span className="srp-table-search-query">{searchState.searchQuery}</span>
                        </div>
                        <span className="srp-table-search-hint">点击修改搜索</span>
                      </div>
                    ) : (
                      <form ref={searchState.searchFormRef} onSubmit={searchState.handleSearch} className="results-composer-wrapper">
                        <div className="results-composer-input-area">
                          <textarea
                            ref={searchState.textareaRef}
                            className={`results-chat-input ${searchState.isInputSingleLine ? 'single-line' : ''}`}
                            placeholder={searchExamples[searchState.currentExampleIndex]}
                            value={searchState.searchQuery}
                            maxLength={1000}
                            onChange={(e) => {
                              searchState.setSearchQuery(e.target.value);
                              e.target.style.height = 'auto';
                              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                              if (e.target.value.trim().length >= 2) {
                                searchState.setShowSuggestions(true);
                              } else {
                                searchState.setShowSuggestions(false);
                              }
                            }}
                            onFocus={(e) => {
                              searchState.setIsInputSingleLine(false);
                              e.target.style.height = 'auto';
                              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                              if (searchState.searchQuery.trim().length >= 2) {
                                searchState.setShowSuggestions(true);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => searchState.setShowSuggestions(false), 200);
                            }}
                            onCompositionStart={() => searchState.setIsComposing(true)}
                            onCompositionEnd={() => searchState.setIsComposing(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && !searchState.isComposing) {
                                e.preventDefault();
                                searchState.setShowSuggestions(false);
                                if (searchState.searchQuery.trim()) {
                                  searchState.handleSearch(e);
                                }
                              }
                              if (e.key === 'Escape') {
                                searchState.setShowSuggestions(false);
                              }
                            }}
                            rows={1}
                            disabled={searchState.isTransitioningToAI}
                          />

                          <button type="submit" className="btn-send" disabled={!searchState.searchQuery.trim() || searchState.loading || searchState.isTransitioningToAI} title="直接检索">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                          </button>

                          {searchState.searchQuery.trim() && searchState.papers.length > 0 && !searchState.isTransitioningToAI && (
                            <div className="ai-switch-button-container">
                              <div className="search-box-divider"></div>
                              <button
                                type="button"
                                className="switch-to-ai-btn icon-only"
                                onClick={searchState.handleSwitchToAI}
                                disabled={searchState.isTransitioningToAI}
                                title="智能检索"
                              >
                                <AdvancedSearchIcon size={18} />
                              </button>
                            </div>
                          )}
                        </div>

                        {!searchState.isTransitioningToAI && (
                          <SearchSuggestions
                            query={searchState.searchQuery}
                            onSelectPaper={handleSelectPaper}
                            onSelectAuthor={handleSelectAuthor}
                            onClose={() => searchState.setShowSuggestions(false)}
                            visible={searchState.showSuggestions}
                            inputRef={searchState.textareaRef}
                          />
                        )}
                      </form>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 主内容区域 */}
            <div className={`results-main ${dimensionAnalysis.selectedDimensions.length > 0 ? 'has-analysis' : ''}`} ref={searchState.resultsMainRef}>
              {/* 左侧筛选侧边栏 */}
              {searchState.viewMode === 'list' && (
                <FilterSidebar filters={searchState.filters} onApplyFilters={searchState.applyFilters} />
              )}

              {/* 论文列表/详情区域 */}
              <div className={`papers-container ${dimensionAnalysis.selectedDimensions.length > 0 ? 'has-collapsed-panel' : ''}`} ref={searchState.papersContainerRef}>
                {searchState.viewMode === 'author' ? (
                  /* 作者详情视图 */
                  <AuthorDetailView
                    authorDetail={authorDetail}
                    searchState={searchState}
                    dimensionAnalysis={dimensionAnalysis}
                  />
                ) : searchState.viewMode === 'paper' ? (
                  /* 论文详情视图 */
                  <PaperDetailView
                    paperDetail={paperDetail}
                    searchState={searchState}
                    dimensionAnalysis={dimensionAnalysis}
                  />
                ) : searchState.loading ? (
                  <PaperListSkeleton />
                ) : searchState.papers.length === 0 ? (
                  <EmptyState searchState={searchState} />
                ) : (
                  /* 搜索结果列表视图 */
                  <SearchResultsListView
                    searchState={searchState}
                    dimensionAnalysis={dimensionAnalysis}
                    startIndex={startIndex}
                    totalPages={totalPages}
                    pdfAvailability={pdfAvailability}
                  />
                )}
              </div>

              {/* 右侧预览面板 */}
              {!previewResize.isCompactLayout && !searchState.isMobile && (searchState.viewMode === 'paper' || searchState.viewMode === 'author') && (
                <PaperPreview
                  paper={searchState.selectedPaper}
                  onClose={() => searchState.setSelectedPaper(null)}
                  width={previewResize.previewWidth}
                  onResizeMouseDown={previewResize.handlePreviewResizeMouseDown}
                  onResizeTouchStart={previewResize.handlePreviewResizeTouchStart}
                  isResizing={previewResize.isResizingPreview}
                  pdfAvailability={pdfAvailability}
                  entryPoint="search_results_page"
                />
              )}
            </div>
          </div>
        </div>

        {/* 论文预览抽屉 */}
        {searchState.showPaperDrawer && searchState.selectedPaper && searchState.viewMode === 'list' && (
          <div className="paper-drawer-overlay" onClick={searchState.handleClosePaperDrawer}>
            <PaperPreview
              paper={searchState.selectedPaper}
              onClose={searchState.handleClosePaperDrawer}
              isDrawerMode={true}
              onClick={(e) => e.stopPropagation()}
              pdfAvailability={pdfAvailability}
              entryPoint="search_results_page"
            />
          </div>
        )}

        {/* 移动端底部弹窗预览 */}
        {searchState.isMobile && searchState.selectedPaper && (
          <div className="mobile-preview-overlay" onClick={() => searchState.setSelectedPaper(null)}>
            <div className="mobile-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-preview-header">
                <span className="mobile-preview-title">论文详情</span>
                <button
                  className="mobile-preview-close"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    searchState.setSelectedPaper(null);
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
                  paper={searchState.selectedPaper}
                  onClose={() => searchState.setSelectedPaper(null)}
                  isMobileModal={true}
                  pdfAvailability={pdfAvailability}
                  entryPoint="search_results_page"
                />
              </div>
            </div>
          </div>
        )}

        {/* 引用弹窗 */}
        {searchState.citePaper && (
          <CiteModal
            paper={searchState.citePaper}
            onClose={() => searchState.setCitePaper(null)}
          />
        )}

        {/* 相似论文引导弹窗 */}
        {paperDetail.showSimilarPapersGuide && (
          <SimilarPapersGuide
            targetRef={searchState.similarPapersTabRef}
            onDismiss={() => paperDetail.setShowSimilarPapersGuide(false)}
            onClose={() => {
              paperDetail.setShowSimilarPapersGuide(false);
              localStorage.setItem('similarPapersGuideShown', 'true');
            }}
            onTryIt={() => {
              paperDetail.setShowSimilarPapersGuide(false);
              localStorage.setItem('similarPapersGuideShown', 'true');
              paperDetail.setDetailActiveTab('similar');
              paperDetail.setDetailHeaderCollapsed(true);
            }}
          />
        )}

        {/* 登录弹窗 */}
        {searchState.showAuthModal && (
          <Suspense fallback={<div>Loading...</div>}>
            <AuthModal
              isOpen={searchState.showAuthModal}
              onClose={() => searchState.setShowAuthModal(false)}
              onLoginSuccess={() => searchState.setShowAuthModal(false)}
            />
          </Suspense>
        )}

        {/* 经费不足弹窗 */}
        <InsufficientBalanceModal
          isOpen={dimensionAnalysis.showBalanceModal}
          onClose={dimensionAnalysis.handleCloseBalanceModal}
          featureName="智能矩阵分析"
          required={dimensionAnalysis.balanceError?.required || 0}
          shortage={dimensionAnalysis.balanceError?.shortage || 0}
        />

        {/* 学术检索到智能分析的过渡动画 */}
        <SearchToAITransition
          isActive={searchState.isTransitioningToAI}
          searchQuery={searchState.searchQuery}
          sourceRect={searchState.searchBoxRect}
          onComplete={searchState.handleTransitionComplete}
        />
      </div>
    </>
  );
};

export default SearchResultsPage;

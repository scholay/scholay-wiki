import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { publicScholarAPI, analysisDimensionAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import './PaperTableView.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

// 分析结果缓存
const analysisCache = new Map();

// 每次显示的论文数量
const PAPERS_PER_DISPLAY = 10;
// 每次从后端加载的论文数量（需要多加载一些，因为要过滤无摘要的）
const PAPERS_PER_FETCH = 50;
// 未登录用户最多显示的论文数量
const GUEST_MAX_PAPERS = 5;

// Loading期间的占位列（6个）
const LOADING_COLUMNS = [
  { key: 'paper', label: '论文', sticky: true },
  { key: 'loading1', label: '加载中...' },
  { key: 'loading2', label: '加载中...' },
  { key: 'loading3', label: '加载中...' },
  { key: 'loading4', label: '加载中...' },
  { key: 'loading5', label: '加载中...' },
  { key: 'loading6', label: '加载中...' },
];

const PaperTableView = ({ 
  searchQuery, 
  filters, 
  onPaperClick, 
  totalResults, 
  selectedDimensionKey, 
  onDimensionSelect, 
  reloadTrigger,
  // 新增：直接传入论文数据的模式
  papers: providedPapers,
  onLoadMore,
  hasMore: providedHasMore,
  loadingMore: providedLoadingMore,
  // 是否隐藏加载更多按钮（用于相似论文未登录状态）
  hideLoadMore = false,
  // 标识是否是相似论文表格视图（用于登录后恢复状态）
  isSimilarPapersTable = false,
}) => {
  // 判断是否使用传入的论文数据模式
  const useProvidedPapers = !!providedPapers;
  // 获取用户认证状态
  const { isAuthenticated } = useAuth();
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 已加载的有摘要论文列表
  const [papersWithAbstract, setPapersWithAbstract] = useState([]);
  // 当前显示的数量
  const [displayCount, setDisplayCount] = useState(PAPERS_PER_DISPLAY);
  // 后端数据的偏移量
  const [offset, setOffset] = useState(0);
  // 是否正在加载更多
  const [loadingMore, setLoadingMore] = useState(false);
  // 是否还有更多数据可以从后端加载
  const [hasMoreFromBackend, setHasMoreFromBackend] = useState(true);
  // 初始加载状态
  const [initialLoading, setInitialLoading] = useState(true);
  // 重新加载提示
  const [reloadNotice, setReloadNotice] = useState(null);
  // 重新加载计数器（用于触发数据重新加载）
  const [reloadCounter, setReloadCounter] = useState(0);
  
  const [analysisResults, setAnalysisResults] = useState({});
  const [loadingPapers, setLoadingPapers] = useState({});
  const [expandedCells, setExpandedCells] = useState({});
  // 动态列定义（从API获取）
  const [dynamicColumns, setDynamicColumns] = useState(null);
  // 列加载状态
  const [columnsLoading, setColumnsLoading] = useState(true);
  const tableRef = useRef(null);
  const tableWrapperRef = useRef(null);
  const columnRefs = useRef({}); // 列头引用，用于滚动定位
  const observerRef = useRef(null);
  const paperRefs = useRef({});

  // 重新加载数据（清除缓存并重新获取）
  const reloadData = useCallback(() => {
    // 清除分析缓存
    analysisCache.clear();
    // 重置状态
    setAnalysisResults({});
    setDynamicColumns(null);
    setColumnsLoading(true); // 重置列加载状态，触发重新加载维度
    setPapersWithAbstract([]);
    setDisplayCount(PAPERS_PER_DISPLAY);
    setOffset(0);
    setHasMoreFromBackend(true);
    setInitialLoading(true);
    setReloadNotice(null);
    // 增加计数器以触发数据重新加载
    setReloadCounter(prev => prev + 1);
  }, []);

  // 监听 reloadTrigger 变化，触发重新加载
  useEffect(() => {
    if (reloadTrigger && reloadTrigger.timestamp) {
      // 显示提示
      const actionText = reloadTrigger.action === 'add' ? '新增' : '修改';
      setReloadNotice({
        message: `维度"${reloadTrigger.dimensionName}"已${actionText}，正在重新加载数据...`,
        type: 'info'
      });
      
      // 延迟一下再重新加载，让用户看到提示
      setTimeout(() => {
        reloadData();
      }, 500);
    }
  }, [reloadTrigger, reloadData]);

  // 当用户登录状态变化时，清除缓存并重新加载
  // 因为登录/登出会影响使用的维度配置
  useEffect(() => {
    // 清除缓存
    analysisCache.clear();
    // 重置分析结果和动态列
    setAnalysisResults({});
    setDynamicColumns(null);
    setColumnsLoading(true);
  }, [isAuthenticated]);

  // 组件加载时从API获取分析维度列
  // 依赖 reloadCounter 以便在维度修改后重新加载
  useEffect(() => {
    const loadDimensions = async () => {
      setColumnsLoading(true);
      try {
        let response;
        if (isAuthenticated) {
          // 已登录用户：获取用户自定义维度或系统默认
          response = await analysisDimensionAPI.getDimensions();
        } else {
          // 未登录用户：获取系统默认维度
          response = await publicScholarAPI.getSystemDimensions();
        }

        if (response.data.code === 0 && response.data.data) {
          const dims = response.data.data.dimensions || [];
          if (dims.length > 0) {
            const cols = [
              { key: 'paper', label: '论文', sticky: true },
              ...dims.map(dim => ({
                key: dim.dimensionKey,
                label: dim.name
              }))
            ];
            setDynamicColumns(cols);
          }
        }
      } catch (err) {
        console.error('Failed to load dimensions:', err);
      } finally {
        setColumnsLoading(false);
      }
    };

    loadDimensions();
  }, [isAuthenticated, reloadCounter]);

  // 当选中维度变化时，自动滚动到对应列
  useEffect(() => {
    if (selectedDimensionKey && columnRefs.current[selectedDimensionKey] && tableWrapperRef.current) {
      const columnElement = columnRefs.current[selectedDimensionKey];
      const wrapperElement = tableWrapperRef.current;
      
      // 计算需要滚动的位置
      const columnRect = columnElement.getBoundingClientRect();
      const wrapperRect = wrapperElement.getBoundingClientRect();
      
      // 第一列是固定的，宽度约340px
      const stickyColumnWidth = 340;
      
      // 计算列相对于wrapper的位置
      const columnLeft = columnElement.offsetLeft;
      const scrollTarget = columnLeft - stickyColumnWidth - 20; // 留一点边距
      
      // 平滑滚动到目标位置
      wrapperElement.scrollTo({
        left: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [selectedDimensionKey]);

  // 点击列头处理
  const handleColumnHeaderClick = (key) => {
    if (key === 'paper') return; // 论文列不可选中
    if (onDimensionSelect) {
      // 如果已经选中，则取消选中；否则选中
      onDimensionSelect(selectedDimensionKey === key ? null : key);
    }
  };

  // 从后端加载论文数据
  const fetchPapers = useCallback(async (query, currentFilters, currentOffset, append = false) => {
    if (!query) {
      console.log('[PaperTableView] No query provided, skipping fetch');
      return 0;
    }
    
    console.log('[PaperTableView] Fetching papers:', { query, currentOffset, append });
    
    try {
      const params = {
        query: query,
        offset: currentOffset,
        limit: PAPERS_PER_FETCH,
        enableTranslation: false,
        fields: ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds']
      };

      // 添加筛选条件
      if (currentFilters) {
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
          params.venue = currentFilters.venue;
        }
        if (currentFilters.minCitationCount) {
          params.minCitationCount = currentFilters.minCitationCount;
        }
      }

      console.log('[PaperTableView] Request params:', params);
      const response = await publicScholarAPI.searchPapers(params);
      console.log('[PaperTableView] Response:', response.data);
      
      if (response.data.code === 0 && response.data.data) {
        // 数据结构: response.data.data.data.data (Semantic Scholar返回的嵌套结构)
        const searchData = response.data.data.data || response.data.data;
        const newPapers = searchData.data || searchData.papers || [];
        console.log('[PaperTableView] Got papers:', newPapers.length, 'from searchData:', searchData);
        
        // 过滤出有摘要的论文
        const newPapersWithAbstract = newPapers.filter(p => p.abstract && p.abstract.trim().length > 0);
        console.log('[PaperTableView] Papers with abstract:', newPapersWithAbstract.length);
        
        if (append) {
          setPapersWithAbstract(prev => {
            // 去重
            const existingIds = new Set(prev.map(p => p.paperId));
            const uniqueNew = newPapersWithAbstract.filter(p => !existingIds.has(p.paperId));
            return [...prev, ...uniqueNew];
          });
        } else {
          setPapersWithAbstract(newPapersWithAbstract);
        }
        
        // 判断是否还有更多数据
        const total = searchData.total || response.data.data.total || 0;
        console.log('[PaperTableView] Total papers:', total);
        setHasMoreFromBackend(currentOffset + PAPERS_PER_FETCH < total);
        
        return newPapers.length;
      }
      return 0;
    } catch (error) {
      console.error('[PaperTableView] Failed to fetch papers:', error);
      return 0;
    }
  }, []);

  // 初始加载 - 当searchQuery、filters或reloadCounter变化时重新加载
  useEffect(() => {
    // 如果使用传入的论文数据模式，不需要自己加载
    if (useProvidedPapers) {
      console.log('[PaperTableView] Using provided papers, count:', providedPapers?.length);
      // 过滤出有摘要的论文
      const papersWithAbs = (providedPapers || []).filter(p => p.abstract && p.abstract.trim().length > 0);
      setPapersWithAbstract(papersWithAbs);
      setInitialLoading(false);
      setHasMoreFromBackend(providedHasMore !== undefined ? providedHasMore : false);
      return;
    }
    
    console.log('[PaperTableView] useEffect triggered, searchQuery:', searchQuery, 'reloadCounter:', reloadCounter);
    
    if (!searchQuery) {
      console.log('[PaperTableView] No searchQuery, skipping');
      setInitialLoading(false);
      return;
    }
    
    const loadInitial = async () => {
      setInitialLoading(true);
      setPapersWithAbstract([]);
      setOffset(0);
      setDisplayCount(PAPERS_PER_DISPLAY);
      setHasMoreFromBackend(true);
      
      await fetchPapers(searchQuery, filters, 0, false);
      setInitialLoading(false);
    };
    
    loadInitial();
  }, [searchQuery, filters, fetchPapers, reloadCounter, useProvidedPapers, providedPapers, providedHasMore]);

  // 当前显示的论文
  const displayedPapers = useProvidedPapers 
    ? papersWithAbstract  // 传入数据模式：显示所有有摘要的论文
    : papersWithAbstract.slice(0, displayCount);

  // 是否可以显示更多（本地已有数据或后端还有数据）- 仅登录用户可用
  const canLoadMore = useProvidedPapers 
    ? (providedHasMore && onLoadMore)  // 传入数据模式：由外部控制
    : (isAuthenticated && (displayCount < papersWithAbstract.length || hasMoreFromBackend));

  // 当前是否正在加载
  const isLoadingMore = useProvidedPapers ? providedLoadingMore : loadingMore;

  // 剩余可加载数量提示
  const remainingHint = useProvidedPapers 
    ? (providedHasMore ? '加载更多...' : '')
    : (displayCount < papersWithAbstract.length 
        ? `还有 ${papersWithAbstract.length - displayCount} 篇已加载`
        : hasMoreFromBackend ? '加载更多...' : '');

  // 加载更多论文
  const handleLoadMore = useCallback(async () => {
    // 如果使用传入数据模式，调用外部的加载更多函数
    if (useProvidedPapers) {
      if (onLoadMore) {
        onLoadMore();
      }
      return;
    }
    
    if (loadingMore) return;
    
    // 如果本地已有足够数据，直接显示更多
    if (displayCount + PAPERS_PER_DISPLAY <= papersWithAbstract.length) {
      setDisplayCount(prev => prev + PAPERS_PER_DISPLAY);
      return;
    }
    
    // 需要从后端加载更多数据
    if (hasMoreFromBackend) {
      setLoadingMore(true);
      const newOffset = offset + PAPERS_PER_FETCH;
      const fetchedCount = await fetchPapers(searchQuery, filters, newOffset, true);
      setOffset(newOffset);
      
      // 增加显示数量
      if (fetchedCount > 0 || displayCount < papersWithAbstract.length) {
        setDisplayCount(prev => prev + PAPERS_PER_DISPLAY);
      }
      setLoadingMore(false);
    } else {
      // 没有更多后端数据，显示所有已加载的
      setDisplayCount(papersWithAbstract.length);
    }
  }, [loadingMore, displayCount, papersWithAbstract.length, hasMoreFromBackend, offset, fetchPapers, searchQuery, filters, useProvidedPapers, onLoadMore]);

  // 分析单篇论文
  const analyzePaper = useCallback(async (paper) => {
    if (!paper.abstract || loadingPapers[paper.paperId] || analysisResults[paper.paperId]) {
      return;
    }

    // 检查缓存（注意：如果用户登录状态变化，缓存可能不适用）
    if (analysisCache.has(paper.paperId)) {
      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: analysisCache.get(paper.paperId)
      }));
      return;
    }

    setLoadingPapers(prev => ({ ...prev, [paper.paperId]: true }));

    try {
      // 根据登录状态选择API：
      // - 已登录：使用带认证的API，获取用户自定义维度的分析结果
      // - 未登录：使用公共API，获取系统默认维度的分析结果
      const response = isAuthenticated
        ? await analysisDimensionAPI.analyzePaper(paper.paperId, paper.title, paper.abstract)
        : await publicScholarAPI.analyzePaper(paper.paperId, paper.title, paper.abstract);
      
      if (response.data.code === 0 && response.data.data) {
        const result = response.data.data;
        // 存入缓存
        analysisCache.set(paper.paperId, result);
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: result
        }));
      }
    } catch (error) {
      console.error('Failed to analyze paper:', paper.paperId, error);
      // 设置错误状态
      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { error: true }
      }));
    } finally {
      setLoadingPapers(prev => ({ ...prev, [paper.paperId]: false }));
    }
  }, [loadingPapers, analysisResults, isAuthenticated]);

  // 使用 Intersection Observer 实现懒加载
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const paperId = entry.target.dataset.paperId;
            const paper = displayedPapers.find(p => p.paperId === paperId);
            if (paper && paper.abstract && !analysisResults[paperId] && !loadingPapers[paperId]) {
              analyzePaper(paper);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    // 观察所有论文行
    Object.values(paperRefs.current).forEach(ref => {
      if (ref) {
        observerRef.current.observe(ref);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [displayedPapers, analyzePaper, analysisResults, loadingPapers]);

  // 切换单元格展开状态
  const toggleCellExpand = (paperId, column) => {
    const key = `${paperId}-${column}`;
    setExpandedCells(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 渲染单元格内容
  const renderCell = (paperId, column, content, isLoading) => {
    const key = `${paperId}-${column}`;
    const isExpanded = expandedCells[key];
    
    if (isLoading) {
      return (
        <div className="ptv-cell-loading">
          <div className="ptv-loading-spinner"></div>
        </div>
      );
    }

    if (!content || content === '未提及' || content === '解析失败') {
      return <span className="ptv-cell-empty">{content || '未提及'}</span>;
    }

    const shouldTruncate = content.length > 100;
    const displayContent = shouldTruncate && !isExpanded 
      ? content.substring(0, 100) + '...' 
      : content;

    return (
      <div className="ptv-cell-content">
        <span>{displayContent}</span>
        {shouldTruncate && (
          <button 
            className="ptv-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleCellExpand(paperId, column);
            }}
          >
            {isExpanded ? '收起' : '展开'}
          </button>
        )}
      </div>
    );
  };

  // 表格列定义 - 优先使用动态列，加载中时使用占位列
  const columns = dynamicColumns || (columnsLoading ? LOADING_COLUMNS : LOADING_COLUMNS);

  // 打开登录弹窗
  const handleOpenAuthModal = () => {
    setShowAuthModal(true);
  };

  // 登录成功回调
  const handleLoginSuccess = () => {
    setShowAuthModal(false);
    // 设置标记，让页面刷新后自动切换到表格视图
    localStorage.setItem('returnToTableView', 'true');
    // 如果是相似论文表格视图，额外保存标记
    if (isSimilarPapersTable) {
      localStorage.setItem('returnToSimilarPapersTable', 'true');
    }
    // 刷新页面以重新加载数据
    window.location.reload();
  };
  
  // 获取分析数据中的某个维度值
  const getAnalysisValue = (analysis, key) => {
    if (!analysis) return null;
    // 新的动态格式：从 data 字段获取
    if (analysis.data && analysis.data[key] !== undefined) {
      return analysis.data[key];
    }
    // 兼容旧的固定字段格式
    if (analysis[key] !== undefined) {
      return analysis[key];
    }
    return null;
  };

  // 初始加载中
  if (initialLoading) {
    return (
      <div className="ptv-container">
        <div className="ptv-loading-state">
          <div className="ptv-loading-spinner-large"></div>
          <p>正在加载论文数据...</p>
        </div>
      </div>
    );
  }

  // 如果没有有摘要的论文
  if (papersWithAbstract.length === 0) {
    return (
      <div className="ptv-container">
        <div className="ptv-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6M12 9v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>当前搜索结果中没有包含摘要的论文</p>
          <span>表格视图需要论文摘要进行AI分析</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ptv-container">

      {/* 重新加载提示 */}
      {reloadNotice && (
        <div className={`ptv-reload-notice ptv-reload-notice-${reloadNotice.type}`}>
          <div className="ptv-reload-notice-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </div>
          <span className="ptv-reload-notice-text">{reloadNotice.message}</span>
        </div>
      )}

      <div className="ptv-table-wrapper" ref={tableWrapperRef}>
        <table className="ptv-table" ref={tableRef}>
          <thead>
            <tr>
              {columns.map(col => (
                <th 
                  key={col.key} 
                  ref={el => { if (!col.sticky) columnRefs.current[col.key] = el; }}
                  className={`${col.sticky ? 'ptv-sticky-col' : ''} ${!col.sticky ? 'ptv-clickable-header' : ''} ${selectedDimensionKey === col.key ? 'ptv-selected-header' : ''}`}
                  onClick={() => handleColumnHeaderClick(col.key)}
                >
                  {col.label}
                  {selectedDimensionKey === col.key && (
                    <span className="ptv-selected-indicator"></span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedPapers.map((paper, index) => {
              const analysis = analysisResults[paper.paperId];
              const isLoading = loadingPapers[paper.paperId];
              // 未登录用户第5行之后需要限制
              const isRestricted = !isAuthenticated && index >= GUEST_MAX_PAPERS;

              return (
                <tr 
                  key={paper.paperId || index}
                  ref={el => paperRefs.current[paper.paperId] = el}
                  data-paper-id={paper.paperId}
                  className={isRestricted ? 'ptv-restricted-row' : ''}
                >
                  {/* 论文列 - 固定，使用类似列表的布局 */}
                  <td className="ptv-sticky-col ptv-paper-cell">
                    <div className="ptv-paper-info">
                      {/* 标题 */}
                      <h4 
                        className="ptv-paper-title"
                        onClick={() => onPaperClick && onPaperClick(paper)}
                      >
                        {paper.title || 'Untitled'}
                      </h4>
                      
                      {/* 作者标签 */}
                      {paper.authors && paper.authors.length > 0 && (
                        <div className="ptv-authors-row">
                          {paper.authors.slice(0, 3).map((author, idx) => (
                            <span key={idx} className="ptv-author-tag">{author.name}</span>
                          ))}
                          {paper.authors.length > 3 && (
                            <span className="ptv-author-tag ptv-author-more">+{paper.authors.length - 3}</span>
                          )}
                        </div>
                      )}
                      
                      {/* 期刊/年份/引用 */}
                      <div className="ptv-paper-meta">
                        {paper.venue && (
                          <span className="ptv-venue">{paper.venue}</span>
                        )}
                        {paper.year && (
                          <span className="ptv-year">{paper.year}年</span>
                        )}
                        {paper.citationCount > 0 && (
                          <span className="ptv-citations">{paper.citationCount} 被引</span>
                        )}
                      </div>
                      
                      {/* 摘要缩略 */}
                      {paper.abstract && (
                        <p className="ptv-abstract">
                          {paper.abstract.length > 150 
                            ? paper.abstract.substring(0, 150) + '...' 
                            : paper.abstract}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* 动态渲染分析维度列 */}
                  {isRestricted ? (
                    // 未登录受限行：合并所有分析列，只显示一个登录提示
                    <td 
                      colSpan={columns.filter(col => !col.sticky).length} 
                      className="ptv-restricted-cell ptv-restricted-merged"
                      onClick={handleOpenAuthModal}
                    >
                      <div className="ptv-restricted-overlay">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span>登录查看分析结果</span>
                      </div>
                    </td>
                  ) : (
                    // 正常渲染每个分析列
                    columns.filter(col => !col.sticky).map(col => (
                      <td key={col.key}>
                        {renderCell(paper.paperId, col.key, getAnalysisValue(analysis, col.key), isLoading)}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 未登录用户的登录引导 */}
      {!isAuthenticated && displayedPapers.length > GUEST_MAX_PAPERS && (
        <div className="ptv-guest-prompt">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>登录后查看全部分析结果</span>
          <button className="ptv-guest-login-btn" onClick={handleOpenAuthModal}>
            登录 / 注册
          </button>
        </div>
      )}

      {/* 登录弹窗 - 使用 Portal 渲染到 body，确保相对于整个浏览器窗口定位 */}
      {showAuthModal && createPortal(
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>,
        document.body
      )}

      {/* 加载更多按钮 - 仅登录用户可见（或传入数据模式下由外部控制），可通过 hideLoadMore 隐藏 */}
      {canLoadMore && !hideLoadMore && (
        <div className="ptv-load-more">
          <button 
            className="ptv-load-more-btn"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <div className="ptv-loading-spinner"></div>
                <span>加载中...</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>加载更多论文</span>
              </>
            )}
          </button>
          {remainingHint && (
            <span className="ptv-load-more-hint">{remainingHint}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default PaperTableView;

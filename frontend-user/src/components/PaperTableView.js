import React, { useState, useEffect, useRef, useCallback } from 'react';
import { publicScholarAPI } from '../services/api';
import './PaperTableView.css';

// 分析结果缓存
const analysisCache = new Map();

// 每次显示的论文数量
const PAPERS_PER_DISPLAY = 10;
// 每次从后端加载的论文数量（需要多加载一些，因为要过滤无摘要的）
const PAPERS_PER_FETCH = 50;

// 默认列定义（当无法从API获取维度时使用）
const DEFAULT_COLUMNS = [
  { key: 'paper', label: '论文', sticky: true },
  { key: 'studyType', label: '研究类型' },
  { key: 'bigDataFocus', label: '大数据关注点' },
  { key: 'dataCharacteristics', label: '数据特征' },
  { key: 'technologies', label: '技术/平台' },
  { key: 'useCases', label: '使用场景' },
  { key: 'implementationContext', label: '实施背景' },
  { key: 'keyFindings', label: '关键发现' },
  { key: 'challengesLimitations', label: '挑战与局限' },
];

const PaperTableView = ({ searchQuery, filters, onPaperClick, totalResults }) => {
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
  
  const [analysisResults, setAnalysisResults] = useState({});
  const [loadingPapers, setLoadingPapers] = useState({});
  const [expandedCells, setExpandedCells] = useState({});
  // 动态列定义（从第一个分析结果中获取）
  const [dynamicColumns, setDynamicColumns] = useState(null);
  const tableRef = useRef(null);
  const observerRef = useRef(null);
  const paperRefs = useRef({});

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

  // 初始加载 - 当searchQuery或filters变化时重新加载
  useEffect(() => {
    console.log('[PaperTableView] useEffect triggered, searchQuery:', searchQuery);
    
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
  }, [searchQuery, filters, fetchPapers]);

  // 当前显示的论文
  const displayedPapers = papersWithAbstract.slice(0, displayCount);

  // 是否可以显示更多（本地已有数据或后端还有数据）
  const canLoadMore = displayCount < papersWithAbstract.length || hasMoreFromBackend;

  // 剩余可加载数量提示
  const remainingHint = displayCount < papersWithAbstract.length 
    ? `还有 ${papersWithAbstract.length - displayCount} 篇已加载`
    : hasMoreFromBackend ? '加载更多...' : '';

  // 加载更多论文
  const handleLoadMore = useCallback(async () => {
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
  }, [loadingMore, displayCount, papersWithAbstract.length, hasMoreFromBackend, offset, fetchPapers, searchQuery, filters]);

  // 分析单篇论文
  const analyzePaper = useCallback(async (paper) => {
    if (!paper.abstract || loadingPapers[paper.paperId] || analysisResults[paper.paperId]) {
      return;
    }

    // 检查缓存
    if (analysisCache.has(paper.paperId)) {
      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: analysisCache.get(paper.paperId)
      }));
      return;
    }

    setLoadingPapers(prev => ({ ...prev, [paper.paperId]: true }));

    try {
      const response = await publicScholarAPI.analyzePaper(paper.paperId, paper.title, paper.abstract);
      if (response.data.code === 0 && response.data.data) {
        const result = response.data.data;
        // 存入缓存
        analysisCache.set(paper.paperId, result);
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: result
        }));
        
        // 如果还没有动态列定义，从第一个分析结果中获取
        if (!dynamicColumns && result.dimensions && result.dimensions.length > 0) {
          const cols = [
            { key: 'paper', label: '论文', sticky: true },
            ...result.dimensions.map(dim => ({
              key: dim.key,
              label: dim.name
            }))
          ];
          setDynamicColumns(cols);
        }
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
  }, [loadingPapers, analysisResults, dynamicColumns]);

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

  // 表格列定义 - 优先使用动态列，否则使用默认列
  const columns = dynamicColumns || DEFAULT_COLUMNS;
  
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

      <div className="ptv-table-wrapper" ref={tableRef}>
        <table className="ptv-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th 
                  key={col.key} 
                  className={col.sticky ? 'ptv-sticky-col' : ''}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedPapers.map((paper, index) => {
              const analysis = analysisResults[paper.paperId];
              const isLoading = loadingPapers[paper.paperId];

              return (
                <tr 
                  key={paper.paperId || index}
                  ref={el => paperRefs.current[paper.paperId] = el}
                  data-paper-id={paper.paperId}
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
                  {columns.filter(col => !col.sticky).map(col => (
                    <td key={col.key}>
                      {renderCell(paper.paperId, col.key, getAnalysisValue(analysis, col.key), isLoading)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 加载更多按钮 */}
      {canLoadMore && (
        <div className="ptv-load-more">
          <button 
            className="ptv-load-more-btn"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
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

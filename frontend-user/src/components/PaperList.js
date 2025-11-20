import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './PaperList.css';

const PaperList = ({ papers, loading, total, paperSets, activeTab = 0, setActiveTab, highlightedPaperIndex = null, scrollToPaperIndex, onScrollComplete, onPaperClick }) => {
  // 使用内部状态作为备选（如果父组件没有传递）
  const [internalActiveTab, setInternalActiveTab] = useState(0);
  const [hoveredPaper, setHoveredPaper] = useState(null); // 鼠标悬停的论文
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 }); // 弹窗位置
  const paperRefs = useRef({});
  const paperListContentRef = useRef(null);
  const paperListRef = useRef(null); // 论文列表容器的引用
  const hideTimeoutRef = useRef(null); // 用于延迟隐藏弹窗的定时器
  const showTimeoutRef = useRef(null); // 用于延迟显示弹窗的定时器

  // 决定使用哪个状态
  const currentActiveTab = setActiveTab ? activeTab : internalActiveTab;
  const handleSetActiveTab = setActiveTab || setInternalActiveTab;

  // 当 paperSets 更新时，自动切换到最新的 tab（第一个）
  useEffect(() => {
    if (paperSets && paperSets.length > 0) {
      handleSetActiveTab(0);
    }
  }, [paperSets]);

  // 当需要滚动到某个论文时执行滚动
  useEffect(() => {
    if (scrollToPaperIndex !== null && paperRefs.current[scrollToPaperIndex]) {
      paperRefs.current[scrollToPaperIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      // 通知父组件滚动完成
      if (onScrollComplete) {
        onScrollComplete();
      }
    }
  }, [scrollToPaperIndex, onScrollComplete]);

  // 计算弹窗位置 - 显示在当前 hover 的论文左侧，垂直居中，紧贴无间隙
  useEffect(() => {
    if (hoveredPaper && paperListRef.current) {
      // 找到当前 hover 的论文在列表中的索引
      const currentPapers = usePaperSets ? (paperSets[currentActiveTab]?.papers || []) : papers;
      const paperIndex = currentPapers.findIndex(p => p.paperId === hoveredPaper.paperId);
      
      if (paperIndex !== -1 && paperRefs.current[paperIndex]) {
        const paperRect = paperRefs.current[paperIndex].getBoundingClientRect();
        const popupContentWidth = 360; // 弹窗内容宽度
        const visualGap = 10; // 弹窗内容与论文的视觉间距
        const popupWrapperWidth = popupContentWidth + visualGap; // wrapper总宽度
        
        // 根据是否有摘要确定弹窗高度
        const hasAbstract = hoveredPaper?.abstract ? true : false;
        const popupHeight = hasAbstract ? 380 : 200; // 有摘要380px，无摘要200px
        
        const viewportHeight = window.innerHeight;
        const minMargin = 20; // 距离视窗边缘的最小边距
        
        // 计算理想的垂直位置（与论文居中）
        let idealTop = paperRect.top + paperRect.height / 2 - popupHeight / 2;
        
        // 确保弹窗在视窗内可见
        let finalTop = idealTop;
        if (idealTop < minMargin) {
          // 如果超出顶部，调整到顶部边缘
          finalTop = minMargin;
        } else if (idealTop + popupHeight > viewportHeight - minMargin) {
          // 如果超出底部，调整到底部边缘
          finalTop = viewportHeight - popupHeight - minMargin;
        }
        
        setPopupPosition({
          top: finalTop,
          left: paperRect.left - popupWrapperWidth, // wrapper紧贴论文左边缘
        });
      }
    }
  }, [hoveredPaper, papers, paperSets, currentActiveTab]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  // 处理论文卡片点击
  const handlePaperCardClick = (index) => {
    if (onPaperClick) {
      onPaperClick(index);
    }
  };

  // 计算箭头方向 - 检查目标论文是在可视区域的上方还是下方
  const getArrowDirection = () => {
    if (highlightedPaperIndex === null || !paperListContentRef.current || !paperRefs.current[highlightedPaperIndex]) {
      return null;
    }

    const container = paperListContentRef.current;
    const targetElement = paperRefs.current[highlightedPaperIndex];

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();

    // 检查目标是否在可视区域内 - 允许部分可见也算在视图内
    const isFullyVisible = (
      targetRect.top >= containerRect.top &&
      targetRect.bottom <= containerRect.bottom
    );

    // 检查是否部分可见
    const isPartiallyVisible = (
      targetRect.bottom > containerRect.top &&
      targetRect.top < containerRect.bottom
    );

    // 如果目标完全可见或大部分可见,不显示箭头
    if (isFullyVisible || isPartiallyVisible) {
      return null;
    }

    // 如果目标在容器上方，显示向上箭头；如果在下方，显示向下箭头
    if (targetRect.bottom <= containerRect.top) {
      return 'up';
    } else if (targetRect.top >= containerRect.bottom) {
      return 'down';
    }
    return null;
  };

  // 如果有 paperSets，使用它；否则使用传统的 papers/total 模式
  const usePaperSets = paperSets && paperSets.length > 0;
  const currentPapers = usePaperSets ? (paperSets[currentActiveTab]?.papers || []) : papers;
  const currentTotal = usePaperSets ? (paperSets[currentActiveTab]?.total || 0) : total;

  // 检查当前tab是否正在加载或有数据
  const currentTab = usePaperSets ? paperSets[currentActiveTab] : null;
  const isTabLoading = currentTab?.isLoading || false;
  const hasData = currentPapers && currentPapers.length > 0;

  // 判断是否显示skeleton: 全局loading状态或当前tab正在加载，且没有数据
  const shouldShowSkeleton = (loading && !hasData) || (isTabLoading && !hasData);

  if (shouldShowSkeleton) {
    return (
      <div className="paper-list">
        <div className="paper-list-header">
          <div className="header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <h3>参考资料</h3>
          </div>
          <div className="paper-count-badge skeleton"></div>
        </div>
        <div className="paper-list-content">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="paper-card skeleton-card">
              <div className="paper-index skeleton-text" style={{width: '20px'}}></div>
              <div className="paper-main">
                <div className="skeleton-title skeleton-text"></div>
                <div className="skeleton-authors skeleton-text" style={{width: '60%'}}></div>
                <div className="skeleton-abstract">
                  <div className="skeleton-text" style={{width: '100%'}}></div>
                  <div className="skeleton-text" style={{width: '90%'}}></div>
                  <div className="skeleton-text" style={{width: '70%'}}></div>
                </div>
                <div className="skeleton-meta">
                  <div className="skeleton-text" style={{width: '120px'}}></div>
                  <div className="skeleton-text" style={{width: '80px'}}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 如果没有数据但已经加载完成(不是loading状态),显示"未找到结果"的提示
  if (!currentPapers || currentPapers.length === 0) {
    // 如果还在加载中,已经由上面的skeleton处理了,这里不需要再return
    // 如果加载完成但没有数据,显示空状态提示
    if (!shouldShowSkeleton) {
      return (
        <div className="paper-list">
          <div className="paper-list-header">
            <div className="header-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <h3>参考资料</h3>
            </div>
          </div>
          <div className="paper-list-content">
            <div className="empty-papers-message">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
                <path d="M11 8v6"/>
                <path d="M8 11h6"/>
              </svg>
              <p>未找到相关论文</p>
              <span>请尝试使用不同的关键词或更具体的描述</span>
            </div>
          </div>
        </div>
      );
    }
    return null; // 还在loading,不显示
  }

  const arrowDirection = getArrowDirection();

  return (
    <div className="paper-list" ref={paperListRef} style={{ position: 'relative' }}>
        <div className="paper-list-header">
          <div className="header-info">
            <div className="header-title-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <h3>参考资料</h3>
            </div>
          <div className="header-stats">
            <span className="total-count">共找到 <strong>{currentTotal || currentPapers.length}</strong> 篇论文</span>
          </div>
        </div>
      </div>

      {/* Tab 切换器已禁用 - 现在根据消息滚动自动切换 */}
      {/* {usePaperSets && paperSets.length > 1 && (
        <div className="paper-tabs">
          {paperSets.map((set, index) => (
            <button
              key={index}
              className={`paper-tab ${currentActiveTab === index ? 'active' : ''}`}
              onClick={() => handleSetActiveTab(index)}
            >
              {set.title || `搜索 ${index + 1}`}
              <span className="tab-count">({set.total || set.papers.length})</span>
            </button>
          ))}
        </div>
      )} */}

      <div className="paper-list-content" ref={paperListContentRef}>
        {currentPapers.map((paper, index) => (
          <PaperCard
            key={paper.paperId || index}
            paper={paper}
            index={index}
            isHighlighted={highlightedPaperIndex === index}
            onCardClick={() => handlePaperCardClick(index)}
            onCardHover={(paper) => {
              // 清除任何待执行的隐藏定时器
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
              }
              
              // 清除显示定时器
              if (showTimeoutRef.current) {
                clearTimeout(showTimeoutRef.current);
                showTimeoutRef.current = null;
              }
              
              // 如果是同一篇论文的弹窗已经显示，保持显示
              if (hoveredPaper && hoveredPaper.paperId === paper.paperId) {
                return;
              }
              
              // 延迟显示新弹窗
              showTimeoutRef.current = setTimeout(() => {
                setHoveredPaper(paper);
              }, 500);
            }}
            onCardLeave={() => {
              // 清除显示定时器
              if (showTimeoutRef.current) {
                clearTimeout(showTimeoutRef.current);
                showTimeoutRef.current = null;
              }
              
              // 延迟隐藏弹窗
              hideTimeoutRef.current = setTimeout(() => {
                setHoveredPaper(null);
              }, 200);
            }}
            ref={(el) => paperRefs.current[index] = el}
          />
        ))}
      </div>

      {/* 固定在容器中间的箭头指示器 */}
      {arrowDirection && (
        <div className={`paper-list-indicator ${arrowDirection}`}>
          {arrowDirection === 'up' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M12 5L5 12M12 5L19 12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5V19M12 19L5 12M12 19L19 12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      {/* 论文详情弹窗 - 使用 Portal 渲染到 body */}
      {hoveredPaper && ReactDOM.createPortal(
        <PaperDetailPopup
          paper={hoveredPaper}
          position={popupPosition}
          onMouseEnter={() => {
            // 清除任何待执行的隐藏定时器
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            // 延迟关闭
            hideTimeoutRef.current = setTimeout(() => {
              setHoveredPaper(null);
            }, 200);
          }}
        />,
        document.body
      )}
    </div>
  );
};

const PaperCard = React.forwardRef(({ paper, index, isHighlighted = false, onCardClick, onCardHover, onCardLeave }, ref) => {
  const {
    title,
    authors,
    year,
    abstract,
    citationCount,
    venue,
    url,
    publicationDate,
    paperId,
    externalIds,
  } = paper;

  // 确保 authors 始终是数组
  const authorList = authors || [];

  // 获取 DOI 链接
  const getDOIUrl = () => {
    if (externalIds && externalIds.DOI) {
      return `https://doi.org/${externalIds.DOI}`;
    }
    return null;
  };

  const handleOpenPaper = (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    // 优先使用 DOI 跳转到出版商页面
    const doiUrl = getDOIUrl();
    if (doiUrl) {
      window.open(doiUrl, '_blank');
    } else if (paperId) {
      // 如果没有 DOI，跳转到论文详情页面
      window.open(`/paper/${paperId}`, '_blank');
    } else if (url) {
      // 如果没有 paperId，fallback 到外部链接
      window.open(url, '_blank');
    }
  };

  // 处理特定区域的 hover
  const handleHoverableAreaEnter = () => {
    if (onCardHover) {
      onCardHover(paper);
    }
  };

  const handleHoverableAreaLeave = () => {
    if (onCardLeave) {
      onCardLeave();
    }
  };

  // 期刊 Logo 处理
  const [logoError, setLogoError] = React.useState(false);
  
  // 获取期刊 Logo URL
  const getJournalLogoUrl = () => {
    if (!venue) return null;
    // 使用 Google 的 favicon 服务或其他服务来获取期刊网站的 logo
    // 这里可以根据期刊名称尝试获取其官方网站的 favicon
    // 对于一些知名期刊，可以使用特定的映射
    const venueMap = {
      'Nature': 'https://www.nature.com/static/images/favicons/nature/apple-touch-icon.png',
      'Science': 'https://www.science.org/pb-assets/images/favicons/science/apple-touch-icon-1645011967513.png',
      'Cell': 'https://www.cell.com/favicon.ico',
      'PNAS': 'https://www.pnas.org/favicon.ico',
      'arXiv': 'https://arxiv.org/static/browse/0.3.4/images/icons/favicon.ico',
    };
    
    // 检查是否有预定义的映射
    for (const [key, url] of Object.entries(venueMap)) {
      if (venue.toLowerCase().includes(key.toLowerCase())) {
        return url;
      }
    }
    
    return null;
  };

  const logoUrl = getJournalLogoUrl();

  return (
    <div
      ref={ref}
      className={`paper-card ${isHighlighted ? 'highlighted' : ''}`}
      onClick={onCardClick}
    >
      <div className="paper-content">
        {/* 第一行：序号 + 期刊信息 */}
        <div className="paper-first-row">
          <div className="paper-rank-inline">
            <span className="rank-number">{index + 1}</span>
          </div>
          
          {venue && (
            <div className="paper-venue-info" onClick={handleOpenPaper}>
              <div className="venue-logo">
                {logoUrl && !logoError ? (
                  <img 
                    src={logoUrl} 
                    alt={venue}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  // 默认学术图标
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
                  </svg>
                )}
              </div>
              <span className="venue-name">{venue}</span>
            </div>
          )}
        </div>
        
        {/* 可 hover 区域：标题 + 作者 + 摘要作为一个整体 */}
        <div 
          className="paper-hoverable-area"
          onMouseEnter={handleHoverableAreaEnter}
          onMouseLeave={handleHoverableAreaLeave}
        >
          {/* 标题 */}
          <div className="paper-header">
            <h4 className="paper-title" onClick={handleOpenPaper} title={title}>
              {title || '无标题'}
            </h4>
          </div>

          {/* 作者 */}
          {authorList.length > 0 && (
            <div className="paper-authors">
              {authorList.slice(0, 3).map((author, idx) => (
                <span key={author.authorId || idx} className="author-name">
                  {author.name}
                  {idx < Math.min(authorList.length - 1, 2) && ', '}
                </span>
              ))}
              {authorList.length > 3 && <span className="author-more"> 等 {authorList.length} 位作者</span>}
            </div>
          )}

          {/* 摘要 */}
          {abstract && (
            <p className="paper-abstract">
              {abstract}
            </p>
          )}
        </div>

        {/* Meta 信息 - 左对齐到序号位置 */}
        <div className="paper-meta">
          {citationCount !== undefined && (
            <span className="meta-item citations">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
              </svg>
              {citationCount} 被引
            </span>
          )}
          {publicationDate && (
            <span className="meta-item date">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
              </svg>
              {new Date(publicationDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// 论文详情弹窗组件
const PaperDetailPopup = ({ paper, position, onMouseEnter, onMouseLeave }) => {
  const {
    title,
    authors,
    year,
    abstract,
    citationCount,
    venue,
    url,
    publicationDate,
    paperId,
  } = paper;

  const authorList = authors || [];

  const handleOpenPaper = () => {
    // 在新标签页中打开我们自己的论文详情页面
    if (paperId) {
      window.open(`/paper/${paperId}`, '_blank');
    } else if (url) {
      // 如果没有 paperId，fallback 到外部链接
      window.open(url, '_blank');
    }
  };

  // 格式化日期
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // 格式化作者列表
  const formatAuthors = () => {
    if (authorList.length === 0) return '';
    if (authorList.length <= 3) {
      return authorList.map(a => a.name).join(', ');
    }
    return `${authorList[0].name} 等${authorList.length}人`;
  };

  return (
    <div
      className="paper-detail-popup-wrapper"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={`paper-detail-popup ${abstract ? 'with-abstract' : 'no-abstract'}`}>
        {/* 顶部期刊信息 */}
        {venue && (
          <div className="popup-venue-header">
            <svg className="venue-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
            </svg>
            <span className="venue-text">{venue}</span>
          </div>
        )}

        {/* 标题部分 */}
        <div className="popup-title-section">
          <h3 className="popup-main-title">{title || '无标题'}</h3>
        </div>

        {/* 日期和引用次数 */}
        <div className="popup-meta-line">
          {publicationDate && (
            <span className="meta-date">{formatDate(publicationDate)}</span>
          )}
          {publicationDate && citationCount !== undefined && (
            <span className="meta-divider">•</span>
          )}
          {citationCount !== undefined && (
            <span className="meta-citations">被引 {citationCount} 次</span>
          )}
        </div>

        {/* 作者 */}
        {authorList.length > 0 && (
          <div className="popup-authors-line">
            <span className="authors-text">{formatAuthors()}</span>
          </div>
        )}

        {/* 摘要区域 - 只在有摘要时显示 */}
        {abstract && (
          <>
            <div className="popup-abstract-header">
              <span className="abstract-label">Abstract</span>
            </div>
            <div className="popup-abstract-content">
              <p className="abstract-text">{abstract}</p>
            </div>
          </>
        )}

        {/* 底部按钮 */}
        <div className="popup-footer">
          <button className="popup-abstract-btn" onClick={handleOpenPaper}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span>查看全文</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaperList;

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './PaperList.css';

const PaperList = ({ papers, loading, total, paperSets, activeTab = 0, setActiveTab, highlightedPaperIndex = null, scrollToPaperIndex, onScrollComplete, onPaperClick }) => {
  // 使用内部状态作为备选（如果父组件没有传递）
  const [internalActiveTab, setInternalActiveTab] = useState(0);
  const [hoveredPaper, setHoveredPaper] = useState(null); // 鼠标悬停的论文
  const [isPopupHovered, setIsPopupHovered] = useState(false); // 弹窗是否被悬停
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 }); // 弹窗位置
  const paperRefs = useRef({});
  const paperListContentRef = useRef(null);
  const paperListRef = useRef(null); // 论文列表容器的引用
  const hideTimeoutRef = useRef(null); // 用于延迟隐藏弹窗的定时器

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

  // 计算弹窗位置
  useEffect(() => {
    if (hoveredPaper && paperListRef.current) {
      const rect = paperListRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.top,
        left: rect.left - 520 - 20 // 弹窗宽度 + 间距
      });
    }
  }, [hoveredPaper]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
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
            <h3>论文搜索结果</h3>
          </div>
          <div className="paper-count-badge skeleton"></div>
        </div>
        <div className="paper-list-content">
          {[1, 2, 3].map((i) => (
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

  if (!currentPapers || currentPapers.length === 0) {
    return null; // 不显示空状态
  }

  const arrowDirection = getArrowDirection();

  return (
    <div className="paper-list" ref={paperListRef} style={{ position: 'relative' }}>
      <div className="paper-list-header">
        <div className="header-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <h3>论文搜索结果</h3>
          {/* 轻量的tab指示器 - 仅在有多个论文集时显示 */}
          {usePaperSets && paperSets.length > 1 && (
            <div className="paper-tab-indicator">
              {paperSets.map((set, index) => (
                <div
                  key={index}
                  className={`tab-dot ${currentActiveTab === index ? 'active' : ''}`}
                  title={set.title || `搜索 ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="paper-count-badge">
          <span className="count-number">{currentTotal || currentPapers.length}</span>
          <span className="count-label">篇论文</span>
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
              setHoveredPaper(paper);
            }}
            onCardLeave={() => {
              // 延迟隐藏弹窗，给用户时间移动鼠标到弹窗上
              hideTimeoutRef.current = setTimeout(() => {
                if (!isPopupHovered) {
                  setHoveredPaper(null);
                }
              }, 100); // 100ms 延迟
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
            setIsPopupHovered(true);
          }}
          onMouseLeave={() => {
            setIsPopupHovered(false);
            setHoveredPaper(null);
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
  } = paper;

  // 确保 authors 始终是数组
  const authorList = authors || [];

  const handleOpenPaper = (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    // 在新标签页中打开我们自己的论文详情页面
    if (paperId) {
      window.open(`/paper/${paperId}`, '_blank');
    } else if (url) {
      // 如果没有 paperId，fallback 到外部链接
      window.open(url, '_blank');
    }
  };

  return (
    <div
      ref={ref}
      className={`paper-card ${isHighlighted ? 'highlighted' : ''}`}
      onClick={onCardClick}
      onMouseEnter={() => onCardHover && onCardHover(paper)}
      onMouseLeave={() => onCardLeave && onCardLeave()}
    >
      <div className="paper-index">{index + 1}</div>
      <div className="paper-main">
        <div className="paper-header">
          <h4 className="paper-title" onClick={handleOpenPaper} title={title}>
            {title || '无标题'}
          </h4>
          {year && <span className="paper-year">{year}</span>}
        </div>

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

        {abstract && (
          <p className="paper-abstract">
            {abstract.length > 180 ? `${abstract.substring(0, 180)}...` : abstract}
          </p>
        )}

        <div className="paper-meta">
          {venue && (
            <span className="meta-item venue">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
              </svg>
              {venue}
            </span>
          )}
          {citationCount !== undefined && (
            <span className="meta-item citations">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
              </svg>
              {citationCount} 引用
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

  return (
    <div
      className="paper-detail-popup"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="popup-header">
        <h3 className="popup-title">{title || '无标题'}</h3>
        {year && <span className="popup-year">{year}</span>}
      </div>

      {authorList.length > 0 && (
        <div className="popup-section">
          <div className="popup-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
            作者
          </div>
          <div className="popup-authors">
            {authorList.map((author, idx) => (
              <span key={author.authorId || idx} className="popup-author">
                {author.name}
                {idx < authorList.length - 1 && ', '}
              </span>
            ))}
          </div>
        </div>
      )}

      {abstract && (
        <div className="popup-section">
          <div className="popup-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
            </svg>
            摘要
          </div>
          <p className="popup-abstract">{abstract}</p>
        </div>
      )}

      <div className="popup-section">
        <div className="popup-section-title">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
          </svg>
          详细信息
        </div>
        <div className="popup-meta-grid">
          {venue && (
            <div className="popup-meta-item">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
              </svg>
              <span>{venue}</span>
            </div>
          )}
          {citationCount !== undefined && (
            <div className="popup-meta-item">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
              </svg>
              <span>{citationCount} 引用</span>
            </div>
          )}
          {publicationDate && (
            <div className="popup-meta-item">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
              </svg>
              <span>{new Date(publicationDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>

      {url && (
        <div className="popup-actions">
          <button className="popup-btn" onClick={handleOpenPaper}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
            </svg>
            <span>查看全文</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default PaperList;

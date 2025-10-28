import React, { useState, useEffect, useRef } from 'react';
import './PaperList.css';

const PaperList = ({ papers, loading, total, paperSets, activeTab = 0, setActiveTab, highlightedPaperIndex = null }) => {
  // 使用内部状态作为备选（如果父组件没有传递）
  const [internalActiveTab, setInternalActiveTab] = useState(0);
  const paperRefs = useRef({});

  // 决定使用哪个状态
  const currentActiveTab = setActiveTab ? activeTab : internalActiveTab;
  const handleSetActiveTab = setActiveTab || setInternalActiveTab;

  // 当 paperSets 更新时，自动切换到最新的 tab（第一个）
  useEffect(() => {
    if (paperSets && paperSets.length > 0) {
      handleSetActiveTab(0);
    }
  }, [paperSets]);

  // 当高亮的论文索引变化时，自动滚动到该论文
  useEffect(() => {
    if (highlightedPaperIndex !== null && paperRefs.current[highlightedPaperIndex]) {
      paperRefs.current[highlightedPaperIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [highlightedPaperIndex]);

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
  return (
    <div className="paper-list">
      <div className="paper-list-header">
        <div className="header-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <h3>论文搜索结果</h3>
        </div>
        <div className="paper-count-badge">
          <span className="count-number">{currentTotal || currentPapers.length}</span>
          <span className="count-label">篇论文</span>
        </div>
      </div>

      {/* Tab 切换器 - 只在有多个论文集合时显示 */}
      {usePaperSets && paperSets.length > 1 && (
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
      )}

      <div className="paper-list-content">
        {currentPapers.map((paper, index) => (
          <PaperCard
            key={paper.paperId || index}
            paper={paper}
            index={index}
            isHighlighted={highlightedPaperIndex === index}
            ref={(el) => paperRefs.current[index] = el}
          />
        ))}
      </div>
    </div>
  );
};

const PaperCard = React.forwardRef(({ paper, index, isHighlighted = false }, ref) => {
  const {
    title,
    authors,
    year,
    abstract,
    citationCount,
    venue,
    url,
    publicationDate,
  } = paper;

  // 确保 authors 始终是数组
  const authorList = authors || [];

  const handleOpenPaper = () => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <div ref={ref} className={`paper-card ${isHighlighted ? 'highlighted' : ''}`}>
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

        {url && (
          <button className="btn-view-paper" onClick={handleOpenPaper}>
            <span>查看全文</span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default PaperList;

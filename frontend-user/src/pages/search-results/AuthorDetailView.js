/**
 * 作者详情视图组件
 */
import React from 'react';
import PaperDetailSkeleton from '../../components/search/PaperDetailSkeleton';
import Pagination from '../../components/common/Pagination';

const AuthorDetailView = ({ authorDetail, searchState, dimensionAnalysis }) => {
  const {
    detailAuthor,
    detailAuthorId,
    authorLoading,
    authorError,
    authorPapers,
    authorPapersPage,
    authorPapersTotalPages,
    authorPapersTotal,
    loadAuthorDetail,
    handleAuthorPapersPageChange,
  } = authorDetail;

  const {
    selectedPaper,
    setSelectedPaper,
    setCitePaper,
    expandedTldr,
    expandedAbstract,
    showAbstractMode,
    setShowAbstractMode,
    toggleTldrExpand,
    toggleAbstractExpand,
    setViewMode,
  } = searchState;

  if (authorLoading) {
    return <PaperDetailSkeleton />;
  }

  if (authorError) {
    return (
      <div className="author-detail-page">
        <div className="epd-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>加载失败</h3>
          <p>{authorError}</p>
          <button className="epd-retry-btn" onClick={() => loadAuthorDetail(detailAuthorId, 1, setViewMode)}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!detailAuthor) {
    return null;
  }

  return (
    <div className="author-detail-page">
      {/* 顶部作者信息卡片 */}
      <div className="author-profile-card">
        <div className="author-profile-main">
          <div className="author-profile-avatar">
            <span className="author-avatar-letter">{detailAuthor.name ? detailAuthor.name.charAt(0).toUpperCase() : 'A'}</span>
          </div>
          <div className="author-profile-info">
            <h1 className="author-profile-name">{detailAuthor.name}</h1>
            {detailAuthor.affiliations && detailAuthor.affiliations.length > 0 && (
              <p className="author-profile-affiliation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {detailAuthor.affiliations[0]}
              </p>
            )}
            {detailAuthor.homepage && (
              <a href={detailAuthor.homepage} target="_blank" rel="noopener" className="author-profile-homepage">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                个人主页
              </a>
            )}
          </div>
        </div>
        <div className="author-profile-metrics">
          <div className="author-metric-item">
            <span className="author-metric-value">{detailAuthor.paperCount || 0}</span>
            <span className="author-metric-label">发表论文</span>
          </div>
          <div className="author-metric-divider"></div>
          <div className="author-metric-item">
            <span className="author-metric-value">{detailAuthor.hIndex || 0}</span>
            <span className="author-metric-label">H 指数</span>
          </div>
          <div className="author-metric-divider"></div>
          <div className="author-metric-item">
            <span className="author-metric-value">{(detailAuthor.citationCount || 0).toLocaleString()}</span>
            <span className="author-metric-label">总被引</span>
          </div>
        </div>
      </div>

      {/* 论文列表工具栏 */}
      <div className="results-header">
        <p className="results-info">
          显示 <strong>{(authorPapersPage - 1) * 20 + 1}-{Math.min(authorPapersPage * 20, authorPapersTotal || detailAuthor.paperCount || authorPapers.length)}</strong> / 共 <strong>{authorPapersTotal || detailAuthor.paperCount || authorPapers.length}</strong> 篇论文
        </p>
      </div>

      {/* 论文列表 */}
      <div className="papers-list">
        {authorPapers.map((paper, index) => (
          <PaperItem
            key={paper.paperId || index}
            paper={paper}
            index={index}
            selectedPaper={selectedPaper}
            setSelectedPaper={setSelectedPaper}
            setCitePaper={setCitePaper}
            expandedTldr={expandedTldr}
            expandedAbstract={expandedAbstract}
            showAbstractMode={showAbstractMode}
            setShowAbstractMode={setShowAbstractMode}
            toggleTldrExpand={toggleTldrExpand}
            toggleAbstractExpand={toggleAbstractExpand}
            highlightAuthorId={detailAuthorId}
          />
        ))}

        {/* 分页器 */}
        <Pagination
          currentPage={authorPapersPage}
          totalPages={authorPapersTotalPages}
          onPageChange={(newPage) => handleAuthorPapersPageChange(newPage, setViewMode)}
          showPageSize={false}
        />
      </div>
    </div>
  );
};

// 论文项组件
const PaperItem = ({
  paper,
  index,
  selectedPaper,
  setSelectedPaper,
  setCitePaper,
  expandedTldr,
  expandedAbstract,
  showAbstractMode,
  setShowAbstractMode,
  toggleTldrExpand,
  toggleAbstractExpand,
  highlightAuthorId,
}) => {
  const hasTldr = paper.tldr?.text;
  const hasAbstract = paper.abstract;
  const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
  const showTldr = currentMode === 'tldr' && hasTldr;
  const showAbstract = currentMode === 'abstract' && hasAbstract;
  const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
  const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];

  return (
    <div
      className={`search-result-paper-item ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
      onClick={() => setSelectedPaper(paper)}
    >
      <div className="search-result-paper-number">{index + 1}</div>
      <div className="search-result-paper-content">
        <h3
          className="search-result-paper-title"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPaper(paper);
          }}
        >
          {paper.title}
        </h3>

        {/* 作者列表 */}
        {paper.authors && paper.authors.length > 0 && (
          <div className="search-result-paper-authors-row">
            <div className="search-result-paper-author-tags">
              {paper.authors.slice(0, 4).map((author, idx) => (
                <span
                  key={idx}
                  className={`author-tag ${author.authorId === highlightAuthorId ? 'current-author' : ''}`}
                >
                  {author.name}
                </span>
              ))}
              {paper.authors.length > 4 && (
                <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
              )}
            </div>
            {/* 研究领域 */}
            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <span className="search-result-paper-fields">
                {paper.fieldsOfStudy.slice(0, 2).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* 期刊/会议 + 日期 */}
        {(paper.venue || paper.publicationDate || paper.year) && (
          <p className="search-result-paper-venue-date">
            {paper.venue && (
              <span className="search-result-venue-name">{paper.venue}</span>
            )}
            {paper.venue && (paper.publicationDate || paper.year) && ' · '}
            {(paper.publicationDate || paper.year) && (
              <span className="pub-date pub-year">
                {paper.publicationDate
                  ? new Date(paper.publicationDate).getFullYear()
                  : paper.year}
              </span>
            )}
          </p>
        )}

        {/* TLDR / 摘要 */}
        {(hasTldr || hasAbstract) && (
          <div className="paper-summary-section">
            <div className="paper-summary-header">
              <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
                {showTldr ? 'TLDR' : 'Abstract'}
              </span>
              {hasTldr && hasAbstract && (
                <button
                  className="summary-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAbstractMode(prev => ({
                      ...prev,
                      [paper.paperId]: currentMode === 'tldr' ? 'abstract' : 'tldr'
                    }));
                  }}
                >
                  {showTldr ? '显示摘要' : '显示TLDR'}
                </button>
              )}
            </div>
            <span className="summary-text">
              {isExpanded || content.length <= 120
                ? content
                : content.substring(0, 100) + '...'}
            </span>
            {content.length > 120 && (
              <button
                className="expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (showTldr) {
                    toggleTldrExpand(paper.paperId);
                  } else {
                    toggleAbstractExpand(paper.paperId);
                  }
                }}
              >
                {isExpanded ? '收起' : '展开'}
              </button>
            )}
          </div>
        )}

        {/* 底部元信息和操作 */}
        <div className="search-result-paper-meta">
          {paper.citationCount !== undefined && (
            <>
              <span className="citation-count">
                <span className="citation-number">{paper.citationCount}</span>
                <span className="citation-label">被引</span>
              </span>
              <span className="meta-divider"></span>
            </>
          )}

          {paper.externalIds?.DOI && (
            <a
              href={`https://doi.org/${paper.externalIds.DOI}`}
              target="_blank"
              rel="noopener"
              className="search-result-paper-doi-link"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
              DOI
            </a>
          )}

          {paper.openAccessPdf && paper.openAccessPdf.url && (
            <a
              href={paper.openAccessPdf.url}
              target="_blank"
              rel="noopener"
              className="meta-item pdf-link"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              PDF
            </a>
          )}

          <button
            className="search-result-paper-cite-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCitePaper(paper);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
            </svg>
            Cite
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthorDetailView;

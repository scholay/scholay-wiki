/**
 * 论文详情视图组件
 */
import React from 'react';
import PaperDetailSkeleton from '../../components/PaperDetailSkeleton';
import SimplePaperItem from '../../components/SimplePaperItem';
import { useTranslation } from '../../hooks';

const PaperDetailView = ({ paperDetail, searchState }) => {
  // 翻译功能
  const translation = useTranslation();
  const {
    detailPaper,
    detailPaperId,
    detailLoading,
    detailError,
    detailActiveTab,
    setDetailActiveTab,
    detailHeaderCollapsed,
    setDetailHeaderCollapsed,
    detailCopyState,
    detailAbstractExpanded,
    setDetailAbstractExpanded,
    loadPaperDetail,
    copyDetailDoi,
    copyDetailCorpusId,
    citationsData,
    citationsLoading,
    loadCitations,
    referencesData,
    referencesLoading,
    loadReferences,
    similarPapersData,
    similarPapersLoading,
    loadSimilarPapers,
    REFS_PER_PAGE,
  } = paperDetail;

  const {
    selectedPaper,
    setSelectedPaper,
    setCitePaper,
    setViewMode,
    similarPapersTabRef,
    similarPapersListRef,
    handleSimilarTabClick,
    // 鉴权相关
    isAuthenticated,
    setShowAuthModal,
  } = searchState;

  if (detailLoading) {
    return <PaperDetailSkeleton />;
  }

  if (detailError) {
    return (
      <div className="epd-container">
        <div className="epd-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>加载失败</h3>
          <p>{detailError}</p>
          <button className="epd-retry-btn" onClick={() => loadPaperDetail(detailPaperId, setViewMode)}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!detailPaper) {
    return null;
  }

  return (
    <div className="epd-container">
      <div className={`epd-content ${detailHeaderCollapsed ? 'epd-header-collapsed' : ''}`}>
        {/* 论文头部信息 */}
        <div className={`epd-header ${detailHeaderCollapsed ? 'collapsed' : ''}`}>
          {/* DOI 和 Corpus ID */}
          <div className="epd-meta-ids">
            {detailPaper.externalIds?.DOI && (
              <span className="epd-meta-id epd-copyable" onClick={(e) => copyDetailDoi(e, detailPaper)}>
                <span className="epd-meta-text">DOI: {detailPaper.externalIds.DOI}</span>
                <button className={`epd-copy-btn ${detailCopyState.doi ? 'copied' : ''}`} title={detailCopyState.doi ? '已复制' : '复制'}>
                  {detailCopyState.doi ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                </button>
              </span>
            )}
            {detailPaper.externalIds?.CorpusId && (
              <>
                {detailPaper.externalIds?.DOI && <span className="epd-meta-dot">•</span>}
                <span className="epd-meta-id epd-copyable" onClick={(e) => copyDetailCorpusId(e, detailPaper)}>
                  <span className="epd-meta-text">Corpus ID: {detailPaper.externalIds.CorpusId}</span>
                  <button className={`epd-copy-btn ${detailCopyState.corpusId ? 'copied' : ''}`} title={detailCopyState.corpusId ? '已复制' : '复制'}>
                    {detailCopyState.corpusId ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    )}
                  </button>
                </span>
              </>
            )}
          </div>

          {/* 标题 */}
          <h1 className="epd-title">{detailPaper.title}</h1>

          {/* 作者和出版信息 */}
          <div className="epd-pub-meta">
            {detailPaper.authors?.length > 0 && (
              <>
                {detailPaper.authors.map((author, idx) => (
                  <React.Fragment key={idx}>
                    <span className="epd-author">{author.name}</span>
                    {idx < detailPaper.authors.length - 1 && <span className="epd-author-sep">, </span>}
                  </React.Fragment>
                ))}
                {(detailPaper.venue || detailPaper.year || detailPaper.fieldsOfStudy?.length > 0) && <span className="epd-meta-dot"> · </span>}
              </>
            )}
            {(detailPaper.venue || detailPaper.year) && (
              <>
                <span className="epd-meta-text">Published in </span>
                {detailPaper.venue && <span className="epd-venue">{detailPaper.venue}</span>}
                {detailPaper.venue && detailPaper.year && <span> </span>}
                {detailPaper.year && <span className="epd-year">{detailPaper.year}</span>}
                {detailPaper.fieldsOfStudy?.length > 0 && <span className="epd-meta-dot"> · </span>}
              </>
            )}
            {detailPaper.fieldsOfStudy?.length > 0 && (
              <span className="epd-fields">{detailPaper.fieldsOfStudy.join(', ')}</span>
            )}
          </div>

          {/* 折叠状态下显示展开按钮 */}
          {detailHeaderCollapsed && (
            <button
              className="epd-header-toggle"
              onClick={() => setDetailHeaderCollapsed(false)}
              title="展开详情"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              展开详情
            </button>
          )}
        </div>

        {/* TLDR */}
        {!detailHeaderCollapsed && detailPaper.tldr && (() => {
          const tldrKey = `${detailPaper.paperId}_detail_tldr`;
          const tldrState = translation.getTranslationState(tldrKey);
          const tldrDisplayMode = translation.getDisplayMode(tldrKey);
          const shouldShowTldrTranslate = translation.shouldShowTranslateButton(detailPaper.tldr.text);
          const isTldrTranslating = tldrState.status === 'translating';
          const hasTldrTranslation = tldrState.status === 'completed' && tldrState.text;
          const translatedTldr = tldrState.text || '';
          
          return (
            <div className="epd-tldr">
              <div className="epd-tldr-header">
                <span className="epd-tldr-badge">TLDR</span>
              </div>
              <p className="epd-tldr-text">
                {detailPaper.tldr.text}
              </p>
              {/* 翻译按钮放在内容后面 */}
              {shouldShowTldrTranslate && (
                <div className="epd-translate-actions">
                  <button
                    className={`epd-translate-btn ${isTldrTranslating ? 'translating' : ''} ${hasTldrTranslation ? 'has-translation' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 鉴权检查：未登录时弹出登录框
                      if (!isAuthenticated) {
                        setShowAuthModal && setShowAuthModal(true);
                        return;
                      }
                      if (hasTldrTranslation) {
                        translation.toggleDisplayMode(tldrKey);
                      } else if (!isTldrTranslating) {
                        translation.translate(tldrKey, detailPaper.tldr.text);
                      }
                    }}
                    disabled={isTldrTranslating}
                    title={isTldrTranslating ? '翻译中...' : (hasTldrTranslation ? (tldrDisplayMode === 'translated' ? '显示原文' : '显示译文') : '翻译为中文')}
                  >
                    {isTldrTranslating ? (
                      <>
                        <span className="translate-spinner"></span>
                        翻译中
                      </>
                    ) : hasTldrTranslation ? (
                      tldrDisplayMode === 'translated' ? '原文' : '译文'
                    ) : (
                      '翻译'
                    )}
                  </button>
                </div>
              )}
              {/* 翻译结果 - 与原文样式一致 */}
              {hasTldrTranslation && tldrDisplayMode === 'translated' && (
                <div className="epd-translation-result">
                  <span className="epd-translation-label">译文</span>
                  <p className="epd-tldr-text">{translatedTldr}</p>
                </div>
              )}
              {/* 翻译中的流式显示 */}
              {isTldrTranslating && (
                <div className="epd-translation-result translating">
                  <span className="epd-translation-label">译文</span>
                  <p className="epd-tldr-text">
                    {translatedTldr}
                    <span className="translate-cursor">|</span>
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* 摘要 */}
        {!detailHeaderCollapsed && detailPaper.abstract && (() => {
          const abstractKey = `${detailPaper.paperId}_detail_abstract`;
          const abstractState = translation.getTranslationState(abstractKey);
          const abstractDisplayMode = translation.getDisplayMode(abstractKey);
          const shouldShowAbstractTranslate = translation.shouldShowTranslateButton(detailPaper.abstract);
          const isAbstractTranslating = abstractState.status === 'translating';
          const hasAbstractTranslation = abstractState.status === 'completed' && abstractState.text;
          const translatedAbstract = abstractState.text || '';
          
          return (
            <div className="epd-section">
              <div className="epd-section-header">
                <h2 className="epd-section-title">摘要</h2>
              </div>
              <p className={`epd-abstract ${detailAbstractExpanded ? 'epd-abstract-expanded' : ''}`}>
                {detailPaper.abstract}
              </p>
              {/* 展开按钮和翻译按钮放在一起 */}
              <div className="epd-abstract-actions">
                {detailPaper.abstract.length > 200 && (
                  <button
                    className="epd-abstract-toggle"
                    onClick={() => setDetailAbstractExpanded(!detailAbstractExpanded)}
                  >
                    {detailAbstractExpanded ? (
                      <>
                        收起
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18 15 12 9 6 15"/>
                        </svg>
                      </>
                    ) : (
                      <>
                        展开全文
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </>
                    )}
                  </button>
                )}
                {shouldShowAbstractTranslate && (
                  <button
                    className={`epd-translate-btn ${isAbstractTranslating ? 'translating' : ''} ${hasAbstractTranslation ? 'has-translation' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 鉴权检查：未登录时弹出登录框
                      if (!isAuthenticated) {
                        setShowAuthModal && setShowAuthModal(true);
                        return;
                      }
                      if (hasAbstractTranslation) {
                        translation.toggleDisplayMode(abstractKey);
                      } else if (!isAbstractTranslating) {
                        translation.translate(abstractKey, detailPaper.abstract);
                      }
                    }}
                    disabled={isAbstractTranslating}
                    title={isAbstractTranslating ? '翻译中...' : (hasAbstractTranslation ? (abstractDisplayMode === 'translated' ? '显示原文' : '显示译文') : '翻译为中文')}
                  >
                    {isAbstractTranslating ? (
                      <>
                        <span className="translate-spinner"></span>
                        翻译中
                      </>
                    ) : hasAbstractTranslation ? (
                      abstractDisplayMode === 'translated' ? '原文' : '译文'
                    ) : (
                      '翻译'
                    )}
                  </button>
                )}
              </div>
              {/* 翻译结果 - 与原文样式一致 */}
              {hasAbstractTranslation && abstractDisplayMode === 'translated' && (
                <div className="epd-translation-result">
                  <span className="epd-translation-label">译文</span>
                  <p className={`epd-abstract ${detailAbstractExpanded ? 'epd-abstract-expanded' : ''}`}>{translatedAbstract}</p>
                </div>
              )}
              {/* 翻译中的流式显示 */}
              {isAbstractTranslating && (
                <div className="epd-translation-result translating">
                  <span className="epd-translation-label">译文</span>
                  <p className={`epd-abstract ${detailAbstractExpanded ? 'epd-abstract-expanded' : ''}`}>
                    {translatedAbstract}
                    <span className="translate-cursor">|</span>
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* 操作按钮 */}
        {!detailHeaderCollapsed && (
          <div className="search-result-paper-meta epd-paper-meta">
            {detailPaper.citationCount !== undefined && (
              <>
                <span className="citation-count">
                  <span className="citation-number">{detailPaper.citationCount}</span>
                  <span className="citation-label">被引</span>
                </span>
                <span className="meta-divider"></span>
              </>
            )}

            {detailPaper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${detailPaper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="search-result-paper-doi-link"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                DOI
              </a>
            )}

            {detailPaper.openAccessPdf?.url && (
              <a
                href={detailPaper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
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
                setCitePaper(detailPaper);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
              </svg>
              Cite
            </button>
          </div>
        )}

        {/* 引用文献 & 参考文献 & 相似论文 Tabs */}
        <div className="epd-section epd-citations-refs">
          <div className="epd-tabs">
            <button className={`epd-tab ${detailActiveTab === 'citations' ? 'active' : ''}`} onClick={() => { setDetailActiveTab('citations'); setDetailHeaderCollapsed(false); setSelectedPaper(null); }}>
              引用文献 <span className="epd-tab-count">{detailPaper.citationCount || 0}</span>
            </button>
            <button className={`epd-tab ${detailActiveTab === 'references' ? 'active' : ''}`} onClick={() => { setDetailActiveTab('references'); setDetailHeaderCollapsed(false); setSelectedPaper(null); }}>
              参考文献 <span className="epd-tab-count">{detailPaper.referenceCount || 0}</span>
            </button>
            <button
              ref={similarPapersTabRef}
              className={`epd-tab epd-tab-similar ${detailActiveTab === 'similar' ? 'active' : ''}`}
              onClick={() => { setDetailActiveTab('similar'); setDetailHeaderCollapsed(true); handleSimilarTabClick(); setSelectedPaper(null); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
              相似论文 {similarPapersData.total > 0 && <span className="epd-tab-count epd-tab-count-similar">{similarPapersData.total}</span>}
            </button>
          </div>

          <div className="epd-tab-content">
            {/* 引用文献 Tab */}
            {detailActiveTab === 'citations' && (
              <CitationsTab
                citationsData={citationsData}
                citationsLoading={citationsLoading}
                loadCitations={loadCitations}
                selectedPaper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setCitePaper={setCitePaper}
              />
            )}

            {/* 参考文献 Tab */}
            {detailActiveTab === 'references' && (
              <ReferencesTab
                referencesData={referencesData}
                referencesLoading={referencesLoading}
                loadReferences={loadReferences}
                selectedPaper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setCitePaper={setCitePaper}
              />
            )}

            {/* 相似论文 Tab */}
            {detailActiveTab === 'similar' && (
              <SimilarPapersTab
                similarPapersData={similarPapersData}
                similarPapersLoading={similarPapersLoading}
                loadSimilarPapers={loadSimilarPapers}
                selectedPaper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setCitePaper={setCitePaper}
                similarPapersListRef={similarPapersListRef}
                REFS_PER_PAGE={REFS_PER_PAGE}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 引用文献 Tab 组件
const CitationsTab = ({ citationsData, citationsLoading, loadCitations, selectedPaper, setSelectedPaper, setCitePaper }) => {
  if (citationsData.papers.length > 0) {
    return (
      <div className="epd-papers-list">
        {citationsData.papers.map((paper, idx) => (
          <SimplePaperItem
            key={paper?.paperId || idx}
            paper={paper}
            index={idx}
            isSelected={selectedPaper?.paperId === paper?.paperId}
            onSelect={(p) => p?.paperId && setSelectedPaper(p)}
            onCite={(p) => setCitePaper(p)}
          />
        ))}
        {/* 分页组件 */}
        {citationsData.totalPages > 1 && (
          <PaginationControls
            data={citationsData}
            loading={citationsLoading}
            onPageChange={(page) => loadCitations(page, setSelectedPaper)}
          />
        )}
      </div>
    );
  }

  if (citationsLoading) {
    return (
      <div className="epd-loading-inline">
        <div className="epd-loading-spinner"></div>
        <span>加载引用文献中...</span>
      </div>
    );
  }

  return <p className="epd-empty-text">暂无引用信息</p>;
};

// 参考文献 Tab 组件
const ReferencesTab = ({ referencesData, referencesLoading, loadReferences, selectedPaper, setSelectedPaper, setCitePaper }) => {
  if (referencesData.papers.length > 0) {
    return (
      <div className="epd-papers-list">
        {referencesData.papers.map((paper, idx) => (
          <SimplePaperItem
            key={paper?.paperId || idx}
            paper={paper}
            index={idx}
            isSelected={selectedPaper?.paperId === paper?.paperId}
            onSelect={(p) => p?.paperId && setSelectedPaper(p)}
            onCite={(p) => setCitePaper(p)}
          />
        ))}
        {referencesData.totalPages > 1 && (
          <PaginationControls
            data={referencesData}
            loading={referencesLoading}
            onPageChange={(page) => loadReferences(page, setSelectedPaper)}
          />
        )}
      </div>
    );
  }

  if (referencesLoading) {
    return (
      <div className="epd-loading-inline">
        <div className="epd-loading-spinner"></div>
        <span>加载参考文献中...</span>
      </div>
    );
  }

  return <p className="epd-empty-text">暂无参考文献信息</p>;
};

// 相似论文 Tab 组件
const SimilarPapersTab = ({ similarPapersData, similarPapersLoading, loadSimilarPapers, selectedPaper, setSelectedPaper, setCitePaper, similarPapersListRef, REFS_PER_PAGE }) => {
  if (similarPapersLoading) {
    return (
      <div className="epd-loading">
        <div className="epd-loading-spinner"></div>
        <p>加载相似论文中...</p>
      </div>
    );
  }

  if (similarPapersData.papers.length === 0) {
    return <p className="epd-empty-text">暂无相似论文推荐</p>;
  }

  return (
    <div className="epd-similar-papers" ref={similarPapersListRef}>
      <div className="results-header">
        <p className="results-info">
          显示 <strong>{(similarPapersData.currentPage - 1) * REFS_PER_PAGE + 1}-{Math.min(similarPapersData.currentPage * REFS_PER_PAGE, similarPapersData.total)}</strong> / 共 <strong>{similarPapersData.total}</strong> 篇相似论文
        </p>
      </div>

      <div className="papers-list">
        {similarPapersData.papers.map((paper, idx) => {
          const itemIndex = (similarPapersData.currentPage - 1) * REFS_PER_PAGE + idx + 1;
          return (
            <SimilarPaperItem
              key={paper?.paperId || idx}
              paper={paper}
              itemIndex={itemIndex}
              selectedPaper={selectedPaper}
              setSelectedPaper={setSelectedPaper}
              setCitePaper={setCitePaper}
            />
          );
        })}

        {similarPapersData.totalPages > 1 && (
          <PaginationControls
            data={similarPapersData}
            loading={similarPapersLoading}
            onPageChange={(page) => loadSimilarPapers(page, false, setSelectedPaper)}
          />
        )}
      </div>
    </div>
  );
};

// 相似论文项组件
const SimilarPaperItem = ({ paper, itemIndex, selectedPaper, setSelectedPaper, setCitePaper }) => {
  return (
    <div
      className={`search-result-paper-item ${selectedPaper?.paperId === paper?.paperId ? 'selected' : ''}`}
      onClick={() => paper?.paperId && setSelectedPaper(paper)}
    >
      <div className="search-result-paper-number">{itemIndex}</div>
      <div className="search-result-paper-content">
        <h3 className="search-result-paper-title">
          {paper?.title || 'Untitled'}
        </h3>

        {paper?.authors && paper.authors.length > 0 && (
          <div className="search-result-paper-authors-row">
            <div className="search-result-paper-author-tags">
              {paper.authors.slice(0, 4).map((author, i) => (
                <span key={i} className="author-tag">{author.name}</span>
              ))}
              {paper.authors.length > 4 && (
                <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
              )}
            </div>
            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <span className="search-result-paper-fields">
                {paper.fieldsOfStudy.slice(0, 2).join(', ')}
              </span>
            )}
          </div>
        )}

        {(paper?.venue || paper?.publicationDate || paper?.year) && (
          <p className="search-result-paper-venue-date">
            {paper.venue && <span className="search-result-venue-name">{paper.venue}</span>}
            {paper.venue && (paper.publicationDate || paper.year) && ' · '}
            {(paper.publicationDate || paper.year) && (
              <span className="pub-date pub-year">
                {paper.publicationDate ? new Date(paper.publicationDate).getFullYear() : paper.year}
              </span>
            )}
          </p>
        )}

        {paper?.tldr?.text && (
          <div className="paper-tldr">
            <span className="tldr-label">TLDR</span>
            <span className="tldr-text">
              {paper.tldr.text.length > 120 ? paper.tldr.text.substring(0, 100) + '...' : paper.tldr.text}
            </span>
          </div>
        )}

        <div className="search-result-paper-meta">
          {paper?.citationCount !== undefined && (
            <>
              <span className="citation-count">
                <span className="citation-number">{paper.citationCount}</span>
                <span className="citation-label">被引</span>
              </span>
              <span className="meta-divider"></span>
            </>
          )}
          {paper?.externalIds?.DOI && (
            <a href={`https://doi.org/${paper.externalIds.DOI}`} target="_blank" rel="noopener noreferrer" className="search-result-paper-doi-link" onClick={(e) => e.stopPropagation()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              DOI
            </a>
          )}
          {paper?.openAccessPdf?.url && (
            <a href={paper.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="meta-item pdf-link" onClick={(e) => e.stopPropagation()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              PDF
            </a>
          )}
          <button className="search-result-paper-cite-btn" onClick={(e) => { e.stopPropagation(); setCitePaper(paper); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/></svg>
            Cite
          </button>
        </div>
      </div>
    </div>
  );
};

// 分页控制组件
const PaginationControls = ({ data, loading, onPageChange }) => {
  return (
    <div className="epd-pagination">
      <button
        className="epd-pagination-btn"
        onClick={() => onPageChange(data.currentPage - 1)}
        disabled={data.currentPage === 1 || loading}
      >
        上一页
      </button>
      <div className="epd-pagination-pages">
        {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
          let pageNum;
          if (data.totalPages <= 5) {
            pageNum = i + 1;
          } else if (data.currentPage <= 3) {
            pageNum = i + 1;
          } else if (data.currentPage >= data.totalPages - 2) {
            pageNum = data.totalPages - 4 + i;
          } else {
            pageNum = data.currentPage - 2 + i;
          }
          return (
            <button
              key={pageNum}
              className={`epd-pagination-page ${data.currentPage === pageNum ? 'active' : ''}`}
              onClick={() => onPageChange(pageNum)}
              disabled={loading}
            >
              {pageNum}
            </button>
          );
        })}
      </div>
      <button
        className="epd-pagination-btn"
        onClick={() => onPageChange(data.currentPage + 1)}
        disabled={data.currentPage === data.totalPages || loading}
      >
        下一页
      </button>
    </div>
  );
};

export default PaperDetailView;

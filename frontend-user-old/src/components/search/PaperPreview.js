/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PDFViewer from '../pdf/PDFViewer';
import { publicScholarAPI } from '../../services/scholar.api';
import { trackPDFPreview, EntryPoint } from '../../utils/usageTracker';
import logger from '../../utils/logger';
import './PaperPreview.css';

const ABSTRACT_COLLAPSE_LIMIT = 320;

// 判断论文数据是否完整（搜索结果可能只包含部分字段）
const isPaperDetailComplete = (paper) => {
  if (!paper) return false;
  // 只要命中下列任一字段，就认为至少做过一次详情加载
  return (
    paper.abstract !== undefined ||
    paper.tldr !== undefined ||
    paper.externalIds !== undefined ||
    paper.openAccessPdf !== undefined ||
    paper.isOpenAccess !== undefined
  );
};

const PaperPreview = memo(({
  paper,
  onClose,
  width,
  onResizeMouseDown,
  onResizeTouchStart,
  isResizing,
  isMobileModal = false,
  isDrawerMode = false,
  onClick,
  pdfAvailability,
  entryPoint = '',
  onCite,
}) => {
  const [activeTab, setActiveTab] = useState('details');
  const [fetchedDetail, setFetchedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [copyState, setCopyState] = useState({ doi: false, corpusId: false });

  const [searchParams] = useSearchParams();

  const containerStyle = width && !isMobileModal && !isDrawerMode
    ? { width: typeof width === 'number' ? `${width}px` : width }
    : undefined;

  // 合并「列表数据」+「懒加载详情」，详情优先
  const displayPaper = useMemo(() => {
    if (!paper) return null;
    if (fetchedDetail && fetchedDetail.paperId === paper.paperId) {
      return { ...paper, ...fetchedDetail };
    }
    return paper;
  }, [paper, fetchedDetail]);

  const shouldOpenPdf = pdfAvailability?.shouldOpenPdfTab?.(displayPaper?.paperId);
  const clearPdfRequest = pdfAvailability?.clearPdfRequest;

  const hasOpenAccessPdf = !!displayPaper?.openAccessPdf?.url;
  const doi = displayPaper?.externalIds?.DOI;
  const corpusId = displayPaper?.externalIds?.CorpusId;
  const hasPDF = hasOpenAccessPdf || !!doi;

  // ====================== 懒加载完整详情 ======================
  useEffect(() => {
    if (!paper?.paperId) return;
    // 已有完整详情或正在加载则跳过
    if (isPaperDetailComplete(paper)) {
      setFetchedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    publicScholarAPI.getPaper(paper.paperId)
      .then((res) => {
        if (cancelled) return;
        // 后端响应格式: { data: { ...paper } }，axios 再包一层 -> res.data.data
        const data = res?.data?.data || res?.data || res;
        if (data && data.paperId) {
          setFetchedDetail(data);
        }
      })
      .catch((err) => {
        logger.warn('[PaperPreview] getPaper failed:', err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [paper?.paperId, paper]);

  // ====================== Tab 切换逻辑 ======================
  const handlePdfTabClick = useCallback(() => {
    if (activeTab !== 'pdf') {
      setActiveTab('pdf');
      const pdfUrl = displayPaper?.openAccessPdf?.url || doi || '';
      trackPDFPreview(pdfUrl, entryPoint || EntryPoint.SEARCH_RESULTS_PAGE);
    }
  }, [activeTab, displayPaper, doi, entryPoint]);

  useEffect(() => {
    if (!paper) return;
    if (shouldOpenPdf) {
      setActiveTab('pdf');
      const pdfUrl = paper?.openAccessPdf?.url || paper?.externalIds?.DOI || '';
      trackPDFPreview(pdfUrl, entryPoint || EntryPoint.SEARCH_RESULTS_PAGE);
      setTimeout(() => {
        if (clearPdfRequest) clearPdfRequest(paper.paperId);
      }, 100);
    } else {
      setActiveTab('details');
      setAbstractExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.paperId]);

  useEffect(() => {
    if (paper && shouldOpenPdf && activeTab !== 'pdf') {
      setActiveTab('pdf');
      const pdfUrl = paper?.openAccessPdf?.url || paper?.externalIds?.DOI || '';
      trackPDFPreview(pdfUrl, entryPoint || EntryPoint.SEARCH_RESULTS_PAGE);
      setTimeout(() => {
        if (clearPdfRequest) clearPdfRequest(paper.paperId);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenPdf]);

  // ====================== 复制功能 ======================
  const handleCopyDoi = useCallback((e) => {
    e.stopPropagation();
    if (!doi) return;
    navigator.clipboard.writeText(doi);
    setCopyState(prev => ({ ...prev, doi: true }));
    setTimeout(() => setCopyState(prev => ({ ...prev, doi: false })), 2000);
  }, [doi]);

  const handleCopyCorpusId = useCallback((e) => {
    e.stopPropagation();
    if (!corpusId) return;
    navigator.clipboard.writeText(String(corpusId));
    setCopyState(prev => ({ ...prev, corpusId: true }));
    setTimeout(() => setCopyState(prev => ({ ...prev, corpusId: false })), 2000);
  }, [corpusId]);

  // ====================== 作者点击 - 新标签页打开 ======================
  const handleAuthorClick = useCallback((e, author) => {
    e.stopPropagation();
    const authorId = author?.authorId;
    if (!authorId) return;
    const params = new URLSearchParams();
    const query = searchParams.get('query');
    if (query) params.set('query', query);
    params.set('authorId', String(authorId));
    window.open(`/search-results?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }, [searchParams]);

  // ====================== Cite ======================
  const handleCite = useCallback((e) => {
    e.stopPropagation();
    if (onCite && displayPaper) onCite(displayPaper);
  }, [onCite, displayPaper]);

  // ====================== 查看完整详情 - 新标签页打开 ======================
  const fullDetailUrl = useMemo(() => {
    if (!displayPaper?.paperId) return '';
    const params = new URLSearchParams();
    const query = searchParams.get('query');
    if (query) params.set('query', query);
    params.set('paperId', displayPaper.paperId);
    return `/search-results?${params.toString()}`;
  }, [displayPaper?.paperId, searchParams]);

  const handleOpenFullDetail = useCallback((e) => {
    e.stopPropagation();
    if (!fullDetailUrl) return;
    window.open(fullDetailUrl, '_blank', 'noopener,noreferrer');
  }, [fullDetailUrl]);

  // ====================== 摘要展开/收起 ======================
  const abstract = displayPaper?.abstract || '';
  const abstractNeedsTruncate = abstract.length > ABSTRACT_COLLAPSE_LIMIT;
  const displayedAbstract = abstractExpanded || !abstractNeedsTruncate
    ? abstract
    : abstract.slice(0, ABSTRACT_COLLAPSE_LIMIT) + '…';

  if (!displayPaper) {
    return (
      <div className="paper-preview empty" style={containerStyle}>
      </div>
    );
  }

  const venue = displayPaper.venue || displayPaper.journal?.name;
  const year = displayPaper.year;
  const fields = displayPaper.fieldsOfStudy || [];
  const authors = displayPaper.authors || [];
  const tldr = displayPaper.tldr?.text;

  return (
    <div
      className={`paper-preview ${isMobileModal ? 'mobile-modal' : ''} ${isDrawerMode ? 'drawer-mode' : ''}`}
      style={containerStyle}
      onClick={onClick}
    >
      {/* 拖拽分隔条 */}
      {!isMobileModal && !isDrawerMode && (
        <div
          className={`resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={onResizeMouseDown}
          onTouchStart={onResizeTouchStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整预览区域宽度"
        >
          <div className="resize-handle-line" />
        </div>
      )}

      {/* 顶部标签栏 */}
      <div className="preview-tabs">
        <div className="tabs-left">
          {hasPDF ? (
            <>
              <button
                className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                详情
              </button>
              <button
                className={`tab-btn ${activeTab === 'pdf' ? 'active' : ''}`}
                onClick={handlePdfTabClick}
              >
                PDF预览
              </button>
            </>
          ) : (
            <span className="tab-title">论文详情</span>
          )}
        </div>
        <button className="close-btn" onClick={onClose} title="关闭">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="preview-content">
        {hasPDF && activeTab === 'pdf' ? (
          <PDFViewer
            pdfUrl={hasOpenAccessPdf ? displayPaper.openAccessPdf.url : null}
            paperTitle={displayPaper.title}
            doi={doi}
            isCheckedPdf={!hasOpenAccessPdf && !!doi}
          />
        ) : (
          <div className="preview-body">
            {/* DOI + Corpus ID */}
            <div className="preview-meta-bar">
              {displayPaper.isOpenAccess && (
                <span className="open-access-badge">开放获取</span>
              )}
              {doi && (
                <span className="meta-id copyable" onClick={handleCopyDoi} title="复制 DOI">
                  <span className="meta-text">DOI: {doi}</span>
                  <button className={`copy-btn ${copyState.doi ? 'copied' : ''}`} type="button">
                    {copyState.doi ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    )}
                  </button>
                </span>
              )}
              {corpusId && (
                <span className="meta-id copyable" onClick={handleCopyCorpusId} title="复制 Corpus ID">
                  <span className="meta-text">Corpus ID: {corpusId}</span>
                  <button className={`copy-btn ${copyState.corpusId ? 'copied' : ''}`} type="button">
                    {copyState.corpusId ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    )}
                  </button>
                </span>
              )}
            </div>

            {/* 标题 */}
            <h2 className="preview-title">{displayPaper.title}</h2>

            {/* 作者 */}
            {authors.length > 0 && (
              <div className="preview-authors">
                {authors.map((author, idx) => {
                  const clickable = !!author?.authorId;
                  return (
                    <React.Fragment key={author?.authorId || idx}>
                      {clickable ? (
                        <button
                          type="button"
                          className="author-chip"
                          onClick={(e) => handleAuthorClick(e, author)}
                          title={`查看作者: ${author.name}`}
                        >
                          {author.name}
                        </button>
                      ) : (
                        <span className="author-chip author-chip-static">{author.name}</span>
                      )}
                      {idx < authors.length - 1 && <span className="author-sep">,</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* 出版信息：期刊/会议 · 年份 · 领域 */}
            {(venue || year || displayPaper.publicationDate || fields.length > 0) && (
              <div className="preview-pub-meta">
                {venue && <span className="pub-venue">{venue}</span>}
                {venue && (year || displayPaper.publicationDate) && <span className="pub-dot">·</span>}
                {(displayPaper.publicationDate || year) && (
                  <span className="pub-year">
                    {displayPaper.publicationDate
                      ? new Date(displayPaper.publicationDate).toLocaleDateString('zh-CN')
                      : year}
                  </span>
                )}
                {fields.length > 0 && (venue || year) && <span className="pub-dot">·</span>}
                {fields.length > 0 && (
                  <div className="field-chips">
                    {fields.map((field, idx) => (
                      <span key={idx} className="field-chip">{field}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 操作行：引用数 / DOI / PDF / Cite */}
            <div className="preview-action-bar">
              {displayPaper.citationCount !== undefined && (
                <span className="action-metric">
                  <span className="action-metric-num">{displayPaper.citationCount}</span>
                  <span className="action-metric-label">被引</span>
                </span>
              )}
              {displayPaper.referenceCount !== undefined && (
                <span className="action-metric">
                  <span className="action-metric-num">{displayPaper.referenceCount}</span>
                  <span className="action-metric-label">参考文献</span>
                </span>
              )}
              {displayPaper.influentialCitationCount !== undefined && (
                <span className="action-metric">
                  <span className="action-metric-num">{displayPaper.influentialCitationCount}</span>
                  <span className="action-metric-label">有影响力引用</span>
                </span>
              )}

              <div className="action-spacer" />

              {doi && (
                <a
                  href={`https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn action-btn-outline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                  </svg>
                  DOI
                </a>
              )}

              {hasOpenAccessPdf && (
                <a
                  href={displayPaper.openAccessPdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn action-btn-outline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  PDF
                </a>
              )}

              {onCite && (
                <button
                  type="button"
                  className="action-btn action-btn-outline"
                  onClick={handleCite}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
                  </svg>
                  引用
                </button>
              )}

              <button
                type="button"
                className="action-btn action-btn-primary"
                onClick={handleOpenFullDetail}
              >
                查看完整详情
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>

            {/* TLDR */}
            {tldr && (
              <section className="preview-section tldr-section">
                <div className="section-header">
                  <span className="section-badge tldr-badge">TLDR</span>
                </div>
                <p className="section-text tldr-text">{tldr}</p>
              </section>
            )}

            {/* 摘要 */}
            {abstract && (
              <section className="preview-section">
                <div className="section-header">
                  <h3 className="section-title">摘要</h3>
                </div>
                <p className="section-text abstract-text">{displayedAbstract}</p>
                {abstractNeedsTruncate && (
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => setAbstractExpanded(!abstractExpanded)}
                  >
                    {abstractExpanded ? (
                      <>
                        收起
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                      </>
                    ) : (
                      <>
                        展开全文
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </>
                    )}
                  </button>
                )}
              </section>
            )}

            {/* 期刊详情（STC） */}
            {displayPaper.journal && (displayPaper.journal.volume || displayPaper.journal.pages) && (
              <section className="preview-section">
                <div className="section-header">
                  <h3 className="section-title">期刊信息</h3>
                </div>
                <div className="journal-info">
                  {displayPaper.journal.name && <div><span className="journal-label">期刊</span>{displayPaper.journal.name}</div>}
                  {displayPaper.journal.volume && <div><span className="journal-label">卷期</span>{displayPaper.journal.volume}</div>}
                  {displayPaper.journal.pages && <div><span className="journal-label">页码</span>{displayPaper.journal.pages}</div>}
                </div>
              </section>
            )}

            {/* 发表类型（STC） */}
            {Array.isArray(displayPaper.publicationTypes) && displayPaper.publicationTypes.length > 0 && (
              <section className="preview-section">
                <div className="section-header">
                  <h3 className="section-title">发表类型</h3>
                </div>
                <div className="field-chips">
                  {displayPaper.publicationTypes.map((t, idx) => (
                    <span key={idx} className="field-chip field-chip-neutral">{t}</span>
                  ))}
                </div>
              </section>
            )}

            {/* 原文链接 */}
            {displayPaper.url && (
              <section className="preview-section">
                <div className="section-header">
                  <h3 className="section-title">原文链接</h3>
                </div>
                <a
                  href={displayPaper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="paper-url"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayPaper.url}
                </a>
              </section>
            )}

            {/* 详情加载中提示 */}
            {detailLoading && !isPaperDetailComplete(displayPaper) && (
              <div className="preview-loading-hint">
                <span className="preview-loading-spinner" />
                正在加载完整详情…
              </div>
            )}

            {/* 无 PDF 提示 */}
            {!hasPDF && displayPaper.isOpenAccess === false && (
              <div className="no-pdf-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                此论文没有开放获取的 PDF
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default PaperPreview;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AIPaperList - 智能分析论文列表组件
 * 完全复用学术检索结果页面的论文展示样式
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import AnalysisCellText from '../AnalysisCellText';
import { useTranslation } from '../../hooks/useTranslation';
import { Languages } from 'lucide-react';
import logger from '../../utils/logger';

const AIPaperRow = memo(function AIPaperRow({
  paper,
  index,
  rowRef,
  isHighlighted,
  expandedAbstract,
  expandedTldr,
  showAbstractMode,
  onToggleAbstract,
  onToggleTldr,
  onSwitchSummaryMode,
  onPaperClick,
  onCite,
  onGetPdf,
  isAuthenticated,
  onRequireAuth,
  selectedDimensions,
  getDimensionKey,
  paperResults,
  isAnalyzing,
  hasError,
  translation,
}) {
  const paperTransState = translation.getPaperTranslationState(paper.paperId);
  const paperDisplayMode = translation.getPaperDisplayMode(paper.paperId);
  const isPaperTranslating = paperTransState.status === 'translating';
  const hasPaperTranslation = paperTransState.status === 'completed';
  const isTranslateDisabled = translation.shouldDisablePaperTranslate(
    paper.title,
    paper.abstract,
    paper.tldr?.text
  );
  const displayTitle = (paperDisplayMode === 'translated' && paperTransState.title_zh)
    ? paperTransState.title_zh
    : paper.title;

  const hasTldr = !!paper.tldr?.text;
  const hasAbstract = !!paper.abstract;
  const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
  const showTldr = currentMode === 'tldr' && hasTldr;
  const showAbstract = currentMode === 'abstract' && hasAbstract;
  const originalContent = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
  const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];
  const displayContent = paperDisplayMode === 'translated'
    ? (showTldr ? (paperTransState.tldr_zh || originalContent) : (paperTransState.abstract_zh || originalContent))
    : originalContent;

  return (
    <div
      ref={rowRef}
      className={`unified-table-row ${isHighlighted ? 'highlighted' : ''}`}
      data-paper-index={index}
    >
      <div className="unified-cell-paper">
        <div className="search-result-paper-number">{index + 1}</div>
        <div className="search-result-paper-content">
          <h3 className="search-result-paper-title">
            <button
              className={`paper-translate-btn ${isPaperTranslating ? 'translating' : ''} ${hasPaperTranslation ? 'has-translation' : ''} ${isTranslateDisabled ? 'disabled' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isTranslateDisabled || isPaperTranslating) return;
                if (!isAuthenticated) {
                  onRequireAuth && onRequireAuth();
                  return;
                }
                if (hasPaperTranslation) {
                  translation.togglePaperDisplayMode(paper.paperId);
                } else {
                  translation.translatePaper(paper.paperId, paper.title, paper.abstract, paper.tldr?.text);
                }
              }}
              disabled={isTranslateDisabled || isPaperTranslating}
              title={
                isTranslateDisabled ? '内容已是中文' :
                isPaperTranslating ? '翻译中...' :
                hasPaperTranslation ? (paperDisplayMode === 'translated' ? '显示原文' : '显示译文') :
                '翻译为中文'
              }
            >
              {isPaperTranslating ? (
                <span className="translate-spinner"></span>
              ) : (
                <Languages className="translate-icon" size={16} />
              )}
            </button>
            <span
              className="paper-title-text"
              onClick={() => onPaperClick && onPaperClick(paper, index)}
            >
              {displayTitle}
            </span>
          </h3>

          {paper.authors && paper.authors.length > 0 && (
            <div className="search-result-paper-authors-row">
              <div className="search-result-paper-author-tags">
                {paper.authors.slice(0, 4).map((author, idx) => (
                  <span key={idx} className="author-tag">{author.name}</span>
                ))}
                {paper.authors.length > 4 && (
                  <span className="author-tag author-more">+{paper.authors.length - 4}</span>
                )}
              </div>
            </div>
          )}

          {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
            <div className="search-result-paper-fields-row">
              {paper.fieldsOfStudy.slice(0, 3).map((field, idx) => (
                <span key={idx} className="field-tag">{field}</span>
              ))}
            </div>
          )}

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

          {(hasTldr || hasAbstract) ? (
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
                      onSwitchSummaryMode(paper.paperId, currentMode === 'tldr' ? 'abstract' : 'tldr');
                    }}
                  >
                    {showTldr ? '显示摘要' : '显示TLDR'}
                  </button>
                )}
              </div>
              <span className="summary-text">
                {isExpanded || displayContent.length <= 120
                  ? displayContent
                  : displayContent.substring(0, 100) + '...'}
              </span>
              <div className="summary-actions">
                {displayContent.length > 120 && (
                  <button
                    className="expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (showTldr) {
                        onToggleTldr(paper.paperId);
                      } else {
                        onToggleAbstract(paper.paperId);
                      }
                    }}
                  >
                    {isExpanded ? '收起' : '展开'}
                  </button>
                )}
              </div>
              {isPaperTranslating && (
                <div className="paper-translating-hint">
                  <span className="translate-cursor">|</span>
                  <span>正在翻译...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="paper-summary-section">
              <span className="summary-label abstract">Abstract</span>
              <span className="summary-text no-abstract">无摘要</span>
            </div>
          )}

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

            {paper.openAccessPdf && paper.openAccessPdf.url ? (
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
                </svg>
                PDF
              </a>
            ) : paper.externalIds?.DOI && onGetPdf && (
              <button
                className="meta-item pdf-check-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onGetPdf(paper);
                }}
                title="获取PDF并预览"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M12 18v-6"/>
                  <path d="M9 15l3 3 3-3"/>
                </svg>
                获取PDF
              </button>
            )}

            {onCite && (
              <button
                className="search-result-paper-cite-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCite(paper);
                }}
                title="引用"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
                </svg>
                Cite
              </button>
            )}
          </div>
        </div>
      </div>

      {selectedDimensions.length > 0 && (
        <div className="unified-cell-analysis">
          {selectedDimensions.map((dim) => {
            const dimKey = getDimensionKey(dim);
            const result = paperResults?.[dimKey];
            const resultText = typeof result === 'string' ? result : (result ? JSON.stringify(result) : '');

            if (index === 0) {
              logger.log('[AIPaperList] Rendering analysis cell:', {
                paperId: paper.paperId,
                dimKey,
                dim,
                paperResults,
                result,
                resultText,
                allKeys: paperResults ? Object.keys(paperResults) : [],
              });
            }

            return (
              <div key={dimKey} className="unified-analysis-cell">
                {isAnalyzing ? (
                  <div className="analysis-cell-loading">
                    <div className="analysis-cell-spinner"></div>
                  </div>
                ) : (!paper.abstract && !paper.tldr?.text) ? (
                  <span className="analysis-cell-na">无摘要</span>
                ) : hasError ? (
                  <span className="analysis-cell-error" title={paperResults._message}>分析失败</span>
                ) : result ? (
                  <AnalysisCellText text={resultText} />
                ) : paperResults ? (
                  <span className="analysis-cell-na">-</span>
                ) : (
                  <span className="analysis-cell-pending">等待分析...</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

const AIPaperList = ({
  papers,
  loading,
  paperSwitchingLoading = false,
  total,
  highlightedPaperIndex,
  scrollToPaperIndex,
  onScrollComplete,
  onPaperClick,
  onCite,
  selectedDimensions = [],
  analysisResults = {},
  analyzingPapers = {},
  getDimensionKey = (dim) => dim.key || dim.name,
  onDimensionRemove,
  isAuthenticated = false,
  onRequireAuth,
  pdfAvailability,
  onGetPdf,
  hasMorePapers = false,
  loadingMorePapers = false,
  onLoadMore,
  loadedPaperCount = 0,
}) => {
  const [expandedAbstract, setExpandedAbstract] = useState({});
  const [expandedTldr, setExpandedTldr] = useState({});
  const [showAbstractMode, setShowAbstractMode] = useState({});

  const paperRefs = useRef({});
  const translation = useTranslation();

  const toggleAbstractExpand = useCallback((paperId) => {
    setExpandedAbstract((prev) => ({ ...prev, [paperId]: !prev[paperId] }));
  }, []);

  const toggleTldrExpand = useCallback((paperId) => {
    setExpandedTldr((prev) => ({ ...prev, [paperId]: !prev[paperId] }));
  }, []);

  const switchSummaryMode = useCallback((paperId, mode) => {
    setShowAbstractMode((prev) => ({ ...prev, [paperId]: mode }));
  }, []);

  const setRowRef = useCallback((index, el) => {
    paperRefs.current[index] = el;
  }, []);

  useEffect(() => {
    if (scrollToPaperIndex !== null && paperRefs.current[scrollToPaperIndex]) {
      paperRefs.current[scrollToPaperIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      if (onScrollComplete) {
        onScrollComplete();
      }
    }
  }, [scrollToPaperIndex, onScrollComplete]);

  if (loading && (!papers || papers.length === 0)) {
    return (
      <div className="unified-results-table">
        <div className="unified-table-header">
          <div className="unified-header-info">
            <span className="hint-text">搜索中...</span>
          </div>
        </div>
        <div className="unified-table-body">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="unified-table-row">
              <div className="unified-cell-paper">
                <div className="search-result-paper-number skeleton-text" style={{width: '20px', height: '20px'}}></div>
                <div className="search-result-paper-content">
                  {/* eslint-disable-next-line jsx-a11y/heading-has-content */}
                  <h3 className="search-result-paper-title skeleton-text" style={{width: '80%', height: '22px'}} aria-label="加载中"></h3>
                  <div className="search-result-paper-authors-row" style={{marginTop: '8px'}}>
                    <div className="skeleton-text" style={{width: '200px', height: '24px'}}></div>
                  </div>
                  <p className="search-result-paper-venue-date" style={{marginTop: '8px'}}>
                    <span className="skeleton-text" style={{width: '150px', height: '16px', display: 'inline-block'}}></span>
                  </p>
                  <div className="paper-summary-section" style={{marginTop: '12px'}}>
                    <span className="skeleton-text" style={{width: '100%', height: '14px', display: 'block'}}></span>
                    <span className="skeleton-text" style={{width: '90%', height: '14px', display: 'block', marginTop: '4px'}}></span>
                    <span className="skeleton-text" style={{width: '70%', height: '14px', display: 'block', marginTop: '4px'}}></span>
                  </div>
                  <div className="search-result-paper-meta" style={{marginTop: '12px'}}>
                    <span className="skeleton-text" style={{width: '60px', height: '16px', display: 'inline-block'}}></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="unified-results-table">
        <div className="unified-table-header">
          <div className="unified-header-info">
            <span className="hint-text">输入问题开始智能分析</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`unified-results-table ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`}
      style={{ position: 'relative' }}
    >
      {((loading && papers && papers.length > 0) || paperSwitchingLoading) && (
        <div className="ai-papers-loading-overlay">
          <div className="ai-papers-loading-spinner"></div>
          <span className="ai-papers-loading-text">{paperSwitchingLoading ? '加载中...' : '搜索中...'}</span>
        </div>
      )}

      <div className="unified-table-header">
        <div className="unified-header-info">
          <span className="hint-text">
            共找到 <strong>{(total || papers.length).toLocaleString()}</strong> 个结果
          </span>
        </div>
        {selectedDimensions.length > 0 && (
          <div className="unified-header-dims">
            {selectedDimensions.map((dim) => (
              <div key={getDimensionKey(dim)} className="unified-header-dim">
                <span className="dim-header-name">{dim.name}</span>
                {onDimensionRemove && (
                  <button
                    className="dim-header-remove-btn"
                    onClick={() => onDimensionRemove(dim)}
                    title={`移除 ${dim.name} 维度`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="unified-table-body">
        {papers.map((paper, index) => {
          const paperResults = analysisResults[paper.paperId];
          const isAnalyzing = !!analyzingPapers[paper.paperId];
          const hasError = !!paperResults?._error;

          return (
            <AIPaperRow
              key={paper.paperId || index}
              paper={paper}
              index={index}
              rowRef={(el) => setRowRef(index, el)}
              isHighlighted={highlightedPaperIndex === index}
              expandedAbstract={expandedAbstract}
              expandedTldr={expandedTldr}
              showAbstractMode={showAbstractMode}
              onToggleAbstract={toggleAbstractExpand}
              onToggleTldr={toggleTldrExpand}
              onSwitchSummaryMode={switchSummaryMode}
              onPaperClick={onPaperClick}
              onCite={onCite}
              onGetPdf={onGetPdf}
              isAuthenticated={isAuthenticated}
              onRequireAuth={onRequireAuth}
              selectedDimensions={selectedDimensions}
              getDimensionKey={getDimensionKey}
              paperResults={paperResults}
              isAnalyzing={isAnalyzing}
              hasError={hasError}
              translation={translation}
            />
          );
        })}
      </div>

      {hasMorePapers && onLoadMore && (
        <div className="load-more-papers-container">
          <button
            className="load-more-papers-btn"
            onClick={onLoadMore}
            disabled={loadingMorePapers}
          >
            {loadingMorePapers ? (
              <>
                <span className="load-more-spinner"></span>
                加载中...
              </>
            ) : (
              <>
                加载更多 ({loadedPaperCount}/{total})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(AIPaperList);

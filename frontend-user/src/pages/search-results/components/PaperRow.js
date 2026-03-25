import React, { memo, useEffect, useRef } from 'react';
import AnalysisCellText from '../../../components/AnalysisCellText';
import { Languages } from 'lucide-react';

// 论文行组件 - 使用 memo 优化，避免不必要的重渲染
const PaperRow = memo(({
  paper,
  index,
  startIndex,
  selectedPaper,
  setSelectedPaper,
  setCitePaper,
  expandedTldr,
  expandedAbstract,
  showAbstractMode,
  setShowAbstractMode,
  toggleTldrExpand,
  toggleAbstractExpand,
  handlePaperClick,
  selectedDimensions,
  getDimensionKey,
  paperResults,
  isAnalyzing,
  hasError,
  translation,
  isAuthenticated,
  setShowAuthModal,
  enqueuePaperAnalysis,
  shouldAnalyze,
  pdfAvailability,
}) => {
  const rowRef = useRef(null);
  const hasQueuedRef = useRef(false);

  const hasTldr = paper.tldr?.text;
  const hasAbstract = paper.abstract;
  const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
  const showTldr = currentMode === 'tldr' && hasTldr;
  const showAbstract = currentMode === 'abstract' && hasAbstract;
  const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
  const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];

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
  const displayContent = paperDisplayMode === 'translated' 
    ? (showTldr ? (paperTransState.tldr_zh || content) : (paperTransState.abstract_zh || content))
    : content;

  // 可视区域检测 + 批量分析队列
  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const needsAnalysis = shouldAnalyze && 
      (paper.abstract || paper.tldr?.text) && 
      !paperResults && 
      !isAnalyzing;

    if (!needsAnalysis) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasQueuedRef.current) {
          hasQueuedRef.current = true;
          enqueuePaperAnalysis(paper);
        }
      },
      {
        rootMargin: '100px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [paper, paperResults, isAnalyzing, shouldAnalyze, enqueuePaperAnalysis]);

  useEffect(() => {
    if (!shouldAnalyze) hasQueuedRef.current = false;
  }, [shouldAnalyze]);

  return (
    <div
      ref={rowRef}
      className={`unified-table-row ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
      data-paper-index={index}
    >
      {/* 论文信息列 */}
      <div className="unified-cell-paper">
        <div className="search-result-paper-number">{startIndex + index}</div>
        <div className="search-result-paper-content">
          <h3 className="search-result-paper-title">
            <button
              className={`paper-translate-btn ${isPaperTranslating ? 'translating' : ''} ${hasPaperTranslation ? 'has-translation' : ''} ${isTranslateDisabled ? 'disabled' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isTranslateDisabled || isPaperTranslating) return;
                if (!isAuthenticated) {
                  setShowAuthModal && setShowAuthModal(true);
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
            <span className="paper-title-text" onClick={() => handlePaperClick(paper)}>
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
                      if (showTldr) toggleTldrExpand(paper.paperId);
                      else toggleAbstractExpand(paper.paperId);
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
                rel="noreferrer"
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
                rel="noreferrer"
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
            ) : paper.externalIds?.DOI && (
              <PdfCheckButton
                paper={paper}
                pdfAvailability={pdfAvailability}
                handlePaperClick={handlePaperClick}
              />
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

      {/* 分析结果列 */}
      {selectedDimensions.length > 0 && (
        <div className="unified-cell-analysis">
          {selectedDimensions.map(dim => {
            const dimKey = getDimensionKey(dim);
            const result = paperResults?.[dimKey];
            const resultText = typeof result === 'string' ? result : (result ? JSON.stringify(result) : '');

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

// 获取 PDF 按钮组件
const PdfCheckButton = memo(({ paper, pdfAvailability, handlePaperClick }) => {
  const { markPdfRequest } = pdfAvailability;
  const doi = paper.externalIds?.DOI;

  const handleGetPdf = (e) => {
    e.stopPropagation();
    if (!doi) return;
    markPdfRequest(paper.paperId, doi);
    handlePaperClick(paper);
  };

  return (
    <button
      className="meta-item pdf-check-btn"
      onClick={handleGetPdf}
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
  );
});

export { PaperRow, PdfCheckButton };
export default PaperRow;

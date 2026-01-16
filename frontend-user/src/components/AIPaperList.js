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

import React, { useState, useRef, useEffect } from 'react';
import AnalysisCellText from './AnalysisCellText';
import { useTranslation } from '../hooks/useTranslation';

const AIPaperList = ({ 
  papers, 
  loading, 
  total,
  highlightedPaperIndex,
  scrollToPaperIndex,
  onScrollComplete,
  onPaperClick,
  onCite, // 引用按钮回调
  // 维度分析相关 props
  selectedDimensions = [],
  analysisResults = {},
  analyzingPapers = {},
  getDimensionKey = (dim) => dim.key || dim.name,
  onDimensionRemove
}) => {
  // 展开/收起状态
  const [expandedAbstract, setExpandedAbstract] = useState({});
  const [expandedTldr, setExpandedTldr] = useState({});
  const [showAbstractMode, setShowAbstractMode] = useState({});
  
  const paperRefs = useRef({});

  // 翻译功能
  const translation = useTranslation();

  // 展开/收起摘要
  const toggleAbstractExpand = (paperId) => {
    setExpandedAbstract(prev => ({ ...prev, [paperId]: !prev[paperId] }));
  };

  // 展开/收起TLDR
  const toggleTldrExpand = (paperId) => {
    setExpandedTldr(prev => ({ ...prev, [paperId]: !prev[paperId] }));
  };

  // 滚动到指定论文
  useEffect(() => {
    if (scrollToPaperIndex !== null && paperRefs.current[scrollToPaperIndex]) {
      paperRefs.current[scrollToPaperIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      if (onScrollComplete) {
        onScrollComplete();
      }
    }
  }, [scrollToPaperIndex, onScrollComplete]);

  // Loading skeleton - 使用学术检索一样的结构
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

  // 空状态
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
    <div className={`unified-results-table ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`} style={{ position: 'relative' }}>
      {/* 蒙层 Loading - 当正在加载且已有论文时显示 */}
      {loading && papers && papers.length > 0 && (
        <div className="ai-papers-loading-overlay">
          <div className="ai-papers-loading-spinner"></div>
          <span className="ai-papers-loading-text">搜索中...</span>
        </div>
      )}

      {/* 表格表头 */}
      <div className="unified-table-header">
        <div className="unified-header-info">
          <span className="hint-text">
            共找到 <strong>{(total || papers.length).toLocaleString()}</strong> 个结果
          </span>
        </div>
        {/* 分析维度列头 - 只在有选中维度时显示 */}
        {selectedDimensions.length > 0 && (
          <div className="unified-header-dims">
            {selectedDimensions.map(dim => (
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

      {/* 表格内容 */}
      <div className="unified-table-body">
        {papers.map((paper, index) => {
          const paperResults = analysisResults[paper.paperId];
          const isAnalyzing = analyzingPapers[paper.paperId];
          const hasError = paperResults?._error;
          
          return (
          <div
            key={paper.paperId || index}
            ref={(el) => paperRefs.current[index] = el}
            className={`unified-table-row ${highlightedPaperIndex === index ? 'highlighted' : ''}`}
            data-paper-index={index}
          >
            {/* 论文信息列 */}
            <div className="unified-cell-paper">
              <div className="search-result-paper-number">{index + 1}</div>
              <div className="search-result-paper-content">
                {/* 标题 */}
                <h3 
                  className="search-result-paper-title"
                  onClick={() => onPaperClick && onPaperClick(paper, index)}
                >
                  {paper.title}
                </h3>

                {/* 作者列表 */}
                {paper.authors && paper.authors.length > 0 && (
                  <div className="search-result-paper-authors-row">
                    <div className="search-result-paper-author-tags">
                      {paper.authors.slice(0, 4).map((author, idx) => (
                        <span key={idx} className="author-tag">{author.name}</span>
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
                {(paper.tldr?.text || paper.abstract) ? (() => {
                  const hasTldr = paper.tldr?.text;
                  const hasAbstract = paper.abstract;
                  const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
                  const showTldr = currentMode === 'tldr' && hasTldr;
                  const showAbstract = currentMode === 'abstract' && hasAbstract;
                  const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
                  const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];
                  
                  // 翻译相关
                  const translationKey = `ai_${paper.paperId}_${showTldr ? 'tldr' : 'abstract'}`;
                  const translationState = translation.getTranslationState(translationKey);
                  const displayMode = translation.getDisplayMode(translationKey);
                  const shouldShowTranslate = translation.shouldShowTranslateButton(content);
                  const isTranslating = translationState.status === 'translating';
                  const hasTranslation = translationState.status === 'completed' && translationState.text;
                  const translatedText = translationState.text || '';
                  
                  return (
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
                          : content.substring(0, 100) + '...'
                        }
                      </span>
                      {/* 展开按钮和翻译按钮 */}
                      <div className="summary-actions">
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
                        {/* 翻译按钮 */}
                        {shouldShowTranslate && (
                          <button
                            className={`summary-translate-btn ${isTranslating ? 'translating' : ''} ${hasTranslation ? 'has-translation' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasTranslation) {
                                translation.toggleDisplayMode(translationKey);
                              } else if (!isTranslating) {
                                translation.translate(translationKey, content);
                              }
                            }}
                            disabled={isTranslating}
                            title={isTranslating ? '翻译中...' : (hasTranslation ? (displayMode === 'translated' ? '显示原文' : '显示译文') : '翻译为中文')}
                          >
                            {isTranslating ? (
                              <>
                                <span className="translate-spinner"></span>
                                翻译中
                              </>
                            ) : hasTranslation ? (
                              displayMode === 'translated' ? '原文' : '译文'
                            ) : (
                              '翻译'
                            )}
                          </button>
                        )}
                      </div>
                      {/* 翻译结果 - 样式与原文一致 */}
                      {hasTranslation && displayMode === 'translated' && (
                        <div className="summary-translation">
                          <span className="summary-label translation-label">译文</span>
                          <span className="summary-text">{translatedText}</span>
                        </div>
                      )}
                      {/* 翻译中的流式显示 */}
                      {isTranslating && (
                        <div className="summary-translation translating">
                          <span className="summary-label translation-label">译文</span>
                          <span className="summary-text">
                            {translatedText}
                            <span className="translate-cursor">|</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="paper-summary-section">
                    <span className="summary-label abstract">Abstract</span>
                    <span className="summary-text no-abstract">无摘要</span>
                  </div>
                )}

                {/* 底部元信息 */}
                <div className="search-result-paper-meta">
                  {/* 被引用数 */}
                  {paper.citationCount !== undefined && (
                    <>
                      <span className="citation-count">
                        <span className="citation-number">{paper.citationCount}</span>
                        <span className="citation-label">被引</span>
                      </span>
                      <span className="meta-divider"></span>
                    </>
                  )}
                  
                  {/* DOI 链接 */}
                  {paper.externalIds?.DOI && (
                    <a
                      href={`https://doi.org/${paper.externalIds.DOI}`}
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
                  
                  {/* PDF 链接 */}
                  {paper.openAccessPdf && paper.openAccessPdf.url && (
                    <a 
                      href={paper.openAccessPdf.url}
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
                      </svg>
                      PDF
                    </a>
                  )}
                  
                  {/* 引用按钮 */}
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
            
            {/* 分析结果列 - 只在有选中维度时显示 */}
            {selectedDimensions.length > 0 && (
              <div className="unified-cell-analysis">
                {selectedDimensions.map(dim => {
                  const dimKey = getDimensionKey(dim);
                  const result = paperResults?.[dimKey];
                  const resultText = typeof result === 'string' ? result : (result ? JSON.stringify(result) : '');
                  
                  // 调试日志
                  if (index === 0) {
                    console.log('[AIPaperList] Rendering analysis cell:', {
                      paperId: paper.paperId,
                      dimKey,
                      dim,
                      paperResults,
                      result,
                      resultText,
                      allKeys: paperResults ? Object.keys(paperResults) : []
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
        })}
      </div>
    </div>
  );
};

export default AIPaperList;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import ReviewRadarChart from '../../../components/peer-review/ReviewRadarChart';
import MarkdownRenderer from '../../../components/common/MarkdownRenderer';

/**
 * 结构化审稿报告内容
 * 可复用于主报告和单个审稿人报告
 *
 * @param {object} parsedReport - 解析后的报告对象
 * @param {string} [rawContent] - 原始内容（降级显示用）
 */
const ReportSections = React.memo(function ReportSections({ parsedReport, rawContent }) {
  if (parsedReport) {
    return (
      <div className="prvr-structured-report">
        {/* 1. 评分维度 - 顶部展示 */}
        {parsedReport.extended_review_items && (
          <section className="prvr-report-section prvr-section-scores-top">
            <div className="prvr-scores-header">
              <h3 className="prvr-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                评分维度
              </h3>
            </div>
            <div className="prvr-scores-content">
              <ReviewRadarChart extendedItems={parsedReport.extended_review_items} />
            </div>
          </section>
        )}

        {/* 2. 总体评估 */}
        {parsedReport.overall_assessment?.summary && (
          <section className="prvr-report-section prvr-section-summary">
            <h3 className="prvr-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              总体评估
            </h3>
            <div className="prvr-section-content">
              <p className="prvr-summary-text">{parsedReport.overall_assessment.summary}</p>
            </div>
          </section>
        )}

        {/* 3. 关键问题 */}
        {parsedReport.critical_issues?.length > 0 && (
          <section className="prvr-report-section prvr-section-critical">
            <h3 className="prvr-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              关键问题 ({parsedReport.critical_issues.length})
            </h3>
            <div className="prvr-section-content">
              <div className="prvr-issues-list">
                {parsedReport.critical_issues.map((issue, idx) => (
                  <div key={idx} className="prvr-issue-card prvr-issue-critical">
                    <div className="prvr-issue-header">
                      <span className="prvr-issue-number">{idx + 1}</span>
                      <span className="prvr-issue-title">
                        {issue.issue_title || issue.issue || issue.title || (typeof issue === 'string' ? issue : '问题 ' + (idx + 1))}
                      </span>
                    </div>
                    {(issue.issue_description || issue.description || issue.detail) && (
                      <p className="prvr-issue-description">{issue.issue_description || issue.description || issue.detail}</p>
                    )}
                    {(issue.affected_sections || issue.location) && (
                      <div className="prvr-issue-meta">
                        <span className="prvr-issue-location">
                          位置: {Array.isArray(issue.affected_sections) ? issue.affected_sections.join(', ') : (issue.affected_sections || issue.location)}
                        </span>
                      </div>
                    )}
                    {(issue.required_actions || issue.suggestion) && (
                      <div className="prvr-issue-suggestion">
                        <strong>建议：</strong>{issue.required_actions || issue.suggestion}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 3.5 改进建议 */}
        {parsedReport.other_suggestions?.length > 0 && (
          <section className="prvr-report-section prvr-section-suggestions">
            <h3 className="prvr-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              改进建议 ({parsedReport.other_suggestions.length})
            </h3>
            <div className="prvr-section-content">
              <div className="prvr-suggestions-list">
                {parsedReport.other_suggestions.map((suggestion, idx) => (
                  <div key={idx} className="prvr-suggestion-card">
                    <span className="prvr-suggestion-number">{idx + 1}</span>
                    <div className="prvr-suggestion-content">
                      <span className="prvr-suggestion-title">
                        {suggestion.suggestion_title || suggestion.suggestion || suggestion.title || (typeof suggestion === 'string' ? suggestion : '建议 ' + (idx + 1))}
                      </span>
                      {(suggestion.suggestion_description || suggestion.description) && (
                        <p className="prvr-suggestion-description">{suggestion.suggestion_description || suggestion.description}</p>
                      )}
                      {(suggestion.suggestion_location) && (
                        <p className="prvr-suggestion-location">位置: {suggestion.suggestion_location}</p>
                      )}
                      {(suggestion.suggestion_rationale) && (
                        <p className="prvr-suggestion-rationale">理由: {suggestion.suggestion_rationale}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4. 详细评审 - 最后展示 */}
        {parsedReport.extended_review_items && (
          <section className="prvr-report-section prvr-section-extended">
            <h3 className="prvr-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              详细评审
            </h3>
            <div className="prvr-section-content">
              <div className="prvr-extended-items">
                {parsedReport.extended_review_items.novelty_evaluation && (
                  <div className="prvr-extended-item">
                    <h4>新颖性评价</h4>
                    <p>{parsedReport.extended_review_items.novelty_evaluation}</p>
                  </div>
                )}
                {parsedReport.extended_review_items.technical_soundness && (
                  <div className="prvr-extended-item">
                    <h4>技术严谨性</h4>
                    <p>{parsedReport.extended_review_items.technical_soundness}</p>
                  </div>
                )}
                {parsedReport.extended_review_items.clarity_and_presentation && (
                  <div className="prvr-extended-item">
                    <h4>清晰度与呈现</h4>
                    <p>{parsedReport.extended_review_items.clarity_and_presentation}</p>
                  </div>
                )}
                {parsedReport.extended_review_items.reproducibility && (
                  <div className="prvr-extended-item">
                    <h4>可复现性</h4>
                    {typeof parsedReport.extended_review_items.reproducibility === 'object' ? (
                      <div className="prvr-reproducibility-detail">
                        {parsedReport.extended_review_items.reproducibility.data_availability && (
                          <p><strong>数据可用性：</strong>{parsedReport.extended_review_items.reproducibility.data_availability}</p>
                        )}
                        {parsedReport.extended_review_items.reproducibility.code_availability && (
                          <p><strong>代码可用性：</strong>{parsedReport.extended_review_items.reproducibility.code_availability}</p>
                        )}
                      </div>
                    ) : (
                      <p>{parsedReport.extended_review_items.reproducibility}</p>
                    )}
                  </div>
                )}
                {parsedReport.extended_review_items.ethical_considerations && (
                  <div className="prvr-extended-item">
                    <h4>伦理考量</h4>
                    <p>{parsedReport.extended_review_items.ethical_considerations}</p>
                  </div>
                )}
                {parsedReport.extended_review_items.impact_and_significance && (
                  <div className="prvr-extended-item">
                    <h4>影响力与重要性</h4>
                    <p>{parsedReport.extended_review_items.impact_and_significance}</p>
                  </div>
                )}
                {parsedReport.extended_review_items.recommend_for_improvement && (
                  <div className="prvr-extended-item">
                    <h4>改进建议</h4>
                    <p>{parsedReport.extended_review_items.recommend_for_improvement}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  /* 降级：无法解析 JSON 时显示原始 Markdown */
  return (
    <div className="prvr-review-report prvr-fallback-report">
      <MarkdownRenderer content={rawContent} />
    </div>
  );
});

export default ReportSections;

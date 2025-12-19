/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * QASection - 单个问答卡片组件
 * 从 AISearchView 中提取，用于渲染单个问答对
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import PaperCitationMarkdown from './PaperCitationMarkdown';

/**
 * QASection 组件 - 渲染单个问答卡片
 */
const QASection = memo(({
  qa,
  index,
  isActive,
  isLatest,
  isStreaming,
  showAIThinking,
  streamingContent,
  paperCount,
  isLoadingSuggestedQuestions,
  loading,
  paperSetsLength,
  onCitationHover,
  onCitationLeave,
  onCitationClick,
  onFollowUpQuestionClick,
}) => {
  return (
    <div 
      className={`qa-section ${isActive ? 'active' : ''}`}
    >
      {/* 问题卡片 - 悬浮效果 */}
      <div className="qa-question-wrapper">
        <div className={`qa-current-question ${index > 0 ? 'has-prev' : ''}`}>
          <div className="qa-question-text">{qa.question}</div>
          {paperCount > 0 && (
            <div className="qa-question-meta">
              <span className="qa-paper-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                {paperCount} 篇相关论文
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* 回答内容区域 */}
      <div className="qa-answer-area">
        {isLatest && showAIThinking ? (
          <div className="qa-thinking-skeleton">
            <div className="skeleton-line" style={{width: '90%'}}></div>
            <div className="skeleton-line" style={{width: '95%'}}></div>
            <div className="skeleton-line" style={{width: '80%'}}></div>
            <div className="skeleton-line" style={{width: '85%'}}></div>
          </div>
        ) : (
          <div className="qa-answer-content">
            <PaperCitationMarkdown
              content={
                isLatest && isStreaming
                  ? streamingContent
                  : qa.answer || ''
              }
              onCitationHover={(paperIndex) => onCitationHover(paperIndex, qa.assistantMsgId)}
              onCitationLeave={onCitationLeave}
              onCitationClick={(paperIndex) => {
                const tabIndex = paperSetsLength - 1 - index;
                onCitationClick(paperIndex, tabIndex);
              }}
            />
          </div>
        )}
        
        {/* 延伸问题 - 只在最新问答时显示 */}
        {isLatest && 
         !isStreaming && 
         !showAIThinking && 
         qa.suggestedQuestions !== undefined && (
          <div className="qa-suggested">
            <div className="qa-suggested-header">
              <span className="qa-suggested-title">你可以继续提问</span>
            </div>
            <div className="qa-suggested-list">
              {(isLoadingSuggestedQuestions || 
                !qa.suggestedQuestions || 
                qa.suggestedQuestions.length === 0) ? (
                <>
                  <div className="qa-suggested-btn skeleton-loading">
                    <span className="question-text"></span>
                  </div>
                  <div className="qa-suggested-btn skeleton-loading">
                    <span className="question-text"></span>
                  </div>
                  <div className="qa-suggested-btn skeleton-loading">
                    <span className="question-text"></span>
                  </div>
                </>
              ) : (
                qa.suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    className="qa-suggested-btn"
                    onClick={() => onFollowUpQuestionClick(q)}
                    disabled={loading}
                  >
                    <span className="question-text">{q}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

QASection.displayName = 'QASection';

QASection.propTypes = {
  qa: PropTypes.shape({
    question: PropTypes.string.isRequired,
    answer: PropTypes.string,
    assistantMsgId: PropTypes.number,
    suggestedQuestions: PropTypes.arrayOf(PropTypes.string),
    messageId: PropTypes.number,
  }).isRequired,
  index: PropTypes.number.isRequired,
  isActive: PropTypes.bool,
  isLatest: PropTypes.bool,
  isStreaming: PropTypes.bool,
  showAIThinking: PropTypes.bool,
  streamingContent: PropTypes.string,
  paperCount: PropTypes.number,
  isLoadingSuggestedQuestions: PropTypes.bool,
  loading: PropTypes.bool,
  paperSetsLength: PropTypes.number,
  onCitationHover: PropTypes.func.isRequired,
  onCitationLeave: PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
  onFollowUpQuestionClick: PropTypes.func.isRequired,
};

QASection.defaultProps = {
  isActive: false,
  isLatest: false,
  isStreaming: false,
  showAIThinking: false,
  streamingContent: '',
  paperCount: 0,
  isLoadingSuggestedQuestions: false,
  loading: false,
  paperSetsLength: 0,
};

export default QASection;


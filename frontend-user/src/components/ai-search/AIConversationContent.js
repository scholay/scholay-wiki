/**
 * AI对话内容区域组件
 * 显示问答列表、流式内容、推荐问题等
 */
import React, { memo, forwardRef } from 'react';
import PaperCitationMarkdown from '../PaperCitationMarkdown';

/**
 * 单个问答卡片组件
 */
const QACard = memo(({
  qa,
  index,
  isLatest,
  isActive,
  isStreaming,
  streamingContent,
  showAIThinking,
  thinkingSteps = [],
  isLoadingSuggestedQuestions,
  fromAcademicSearch,
  loading,
  onCitationHover,
  onCitationLeave,
  onCitationClick,
  onFollowUpClick,
}) => {
  return (
    <div
      className={`qa-section ${isActive ? 'active' : ''}`}
    >
      {/* 问题卡片 */}
      <div className="qa-question-wrapper">
        <div className={`qa-current-question ${index > 0 ? 'has-prev' : ''}`}>
          <div className="qa-question-text">
            {qa.question}
            {index === 0 && fromAcademicSearch && (
              <span className="from-search-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                来自学术检索
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 回答内容区域 */}
      <div className="qa-answer-area">
        {isLatest && showAIThinking ? (
          <div className="qa-thinking-process">
            {/* 思考步骤展示 */}
            {thinkingSteps.length > 0 ? (
              <div className="thinking-steps-container">
                {thinkingSteps.map((step, idx) => {
                  // 判断步骤状态：已完成、进行中、等待中
                  const isLastStep = idx === thinkingSteps.length - 1;
                  const isCompleted = step.completed || !isLastStep;
                  const isActive = isLastStep && !step.completed;
                  
                  return (
                    <div 
                      key={step.step} 
                      className={`thinking-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    >
                      <div className="step-header">
                        <span className="step-icon">
                          {isActive ? (
                            <svg className="step-spinner" viewBox="0 0 24 24" width="14" height="14">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span className="step-message">{step.message}</span>
                      </div>
                      {step.detail && (
                        <div className="step-detail">{step.detail}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="thinking-steps-container">
                <div className="thinking-step active">
                  <div className="step-header">
                    <span className="step-icon">
                      <svg className="step-spinner" viewBox="0 0 24 24" width="14" height="14">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                    </span>
                    <span className="step-message">正在准备</span>
                  </div>
                  <div className="step-detail">初始化智能分析引擎...</div>
                </div>
              </div>
            )}
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
              onCitationClick={(paperIndex) => onCitationClick(paperIndex, index)}
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
                    onClick={() => onFollowUpClick(q)}
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

QACard.displayName = 'QACard';

/**
 * AI对话内容组件
 */
const AIConversationContent = forwardRef(({
  qaList,
  loading,
  isStreaming,
  streamingContent,
  showAIThinking,
  thinkingSteps = [],
  currentConversationId,
  expandedQAIndex,
  messagePagination,
  isLoadingSuggestedQuestions,
  fromAcademicSearch,
  disableSnapTemporarily,
  onScroll,
  onLoadMore,
  onCitationHover,
  onCitationLeave,
  onCitationClick,
  onFollowUpClick,
}, ref) => {
  return (
    <div
      className={`qa-snap-container ${isStreaming || disableSnapTemporarily ? 'streaming' : ''}`}
      ref={ref}
      onScroll={onScroll}
    >
      {/* 加载历史对话时显示 loading */}
      {loading && qaList.length === 0 && currentConversationId ? (
        <div className="qa-section">
          <div className="qa-loading-state">
            <div className="qa-loading-spinner"></div>
            <p>加载对话中...</p>
          </div>
        </div>
      ) : qaList.length === 0 ? (
        <div className="qa-section">
          <div className="qa-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>输入问题开始智能分析</p>
          </div>
        </div>
      ) : (
        <>
          {/* 加载更多历史消息指示器 */}
          {messagePagination.hasMore && (
            <div className="qa-load-more-indicator">
              {messagePagination.isLoadingMore ? (
                <div className="qa-loading-more">
                  <div className="loading-spinner-small"></div>
                  <span>加载历史消息...</span>
                </div>
              ) : (
                <button
                  className="qa-load-more-btn"
                  onClick={onLoadMore}
                >
                  ↑ 加载更早的消息
                </button>
              )}
            </div>
          )}
          {qaList.map((qa, index) => (
            <QACard
              key={qa.messageId || index}
              qa={qa}
              index={index}
              isLatest={index === qaList.length - 1}
              isActive={index === expandedQAIndex}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              showAIThinking={showAIThinking}
              thinkingSteps={thinkingSteps}
              isLoadingSuggestedQuestions={isLoadingSuggestedQuestions}
              fromAcademicSearch={fromAcademicSearch}
              loading={loading}
              onCitationHover={onCitationHover}
              onCitationLeave={onCitationLeave}
              onCitationClick={onCitationClick}
              onFollowUpClick={onFollowUpClick}
            />
          ))}
        </>
      )}
      {/* 底部占位元素 */}
      <div className="qa-bottom-spacer"></div>
    </div>
  );
});

AIConversationContent.displayName = 'AIConversationContent';

export default AIConversationContent;

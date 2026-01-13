/**
 * 审稿步骤进度展示组件
 * 统一展示预处理步骤和三审步骤的完整流程
 */

import React from 'react';
import './ReviewStepsProgress.css';

// 审稿人名称映射
const REVIEWER_NAMES = {
  1: { name: '审稿人 Alpha', short: 'α', color: '#6366f1' },
  2: { name: '审稿人 Beta', short: 'β', color: '#8b5cf6' },
  3: { name: '审稿人 Gamma', short: 'γ', color: '#a855f7' },
};

// 格式化持续时间（毫秒转为可读格式）
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}分钟`;
  return `${minutes}分${remainingSeconds}秒`;
};

// 步骤状态图标
const StepStatusIcon = ({ status }) => {
  switch (status) {
    case 'completed':
      return (
        <svg className="step-icon completed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      );
    case 'processing':
      return (
        <svg className="step-icon processing spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      );
    case 'failed':
      return (
        <svg className="step-icon failed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      );
    default:
      return (
        <svg className="step-icon pending" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      );
  }
};

// 单个审稿人的内嵌展示
function ReviewerInlineCard({ reviewer }) {
  const reviewerInfo = REVIEWER_NAMES[reviewer.reviewer_index] || { 
    name: `审稿人 ${reviewer.reviewer_index}`, 
    short: reviewer.reviewer_index,
    color: '#6366f1'
  };
  
  const isCompleted = reviewer.status === 'completed';
  const isFailed = reviewer.status === 'failed';
  const isProcessing = reviewer.status === 'processing';
  
  return (
    <div className={`reviewer-inline-card ${reviewer.status}`}>
      <div className="reviewer-inline-header">
        <div className="reviewer-inline-avatar" style={{ background: reviewerInfo.color }}>
          <span>{reviewerInfo.short}</span>
        </div>
        <div className="reviewer-inline-info">
          <span className="reviewer-inline-name">{reviewerInfo.name}</span>
          {reviewer.model_name && (
            <span className="reviewer-inline-model">{reviewer.model_name}</span>
          )}
        </div>
        <div className={`reviewer-inline-status ${reviewer.status}`}>
          {isCompleted && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              已完成
            </>
          )}
          {isFailed && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              失败
            </>
          )}
          {isProcessing && (
            <>
              <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
              {reviewer.progress}%
            </>
          )}
          {!isCompleted && !isFailed && !isProcessing && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              等待中
            </>
          )}
        </div>
      </div>
      
      {/* 步骤详情 */}
      {reviewer.steps && reviewer.steps.length > 0 && (
        <div className="reviewer-inline-steps">
          {reviewer.steps.map((step, idx) => (
            <div key={idx} className={`reviewer-step-item ${step.status}`}>
              <StepStatusIcon status={step.status} />
              <span className="step-name">{step.step_name}</span>
              {step.duration_ms > 0 && (
                <span className="step-duration">{formatDuration(step.duration_ms)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* 错误信息 */}
      {isFailed && reviewer.error_message && (
        <div className="reviewer-inline-error">
          {reviewer.error_message}
        </div>
      )}
    </div>
  );
}

// 主组件
export default function ReviewStepsProgress({ stepsData, loading }) {
  if (loading) {
    return (
      <div className="review-steps-loading">
        <div className="loading-spinner"></div>
        <span>加载步骤详情...</span>
      </div>
    );
  }
  
  if (!stepsData || Object.keys(stepsData).length === 0) {
    return null;
  }
  
  const { preprocess_steps, reviewer_steps, summarize_step } = stepsData;
  const reviewerStepsArray = reviewer_steps || [];
  
  // 计算预处理阶段完成状态
  const preprocessCompleted = preprocess_steps?.filter(s => s.status === 'completed').length || 0;
  const preprocessTotal = preprocess_steps?.length || 0;
  const isPreprocessDone = preprocessCompleted === preprocessTotal && preprocessTotal > 0;
  const processingPreprocessStep = preprocess_steps?.find(s => s.status === 'processing');
  
  // 计算三审阶段完成状态
  const reviewersCompleted = reviewerStepsArray.filter(r => r.status === 'completed').length;
  const reviewersTotal = reviewerStepsArray.length;
  const isReviewDone = reviewersCompleted === reviewersTotal && reviewersTotal > 0;
  const processingReviewer = reviewerStepsArray.find(r => r.status === 'processing');
  
  // 汇总阶段状态
  const isSummarizeDone = summarize_step?.status === 'completed';
  const isSummarizeProcessing = summarize_step?.status === 'processing';
  
  return (
    <div className="review-steps-progress-container">
    <div className="review-steps-progress">
      {/* 预处理阶段卡片 */}
      {preprocess_steps && preprocess_steps.length > 0 && (
        <div className="process-card">
          <div className="process-card-header">
            <div className={`process-card-icon ${isPreprocessDone ? 'completed' : 'processing'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="process-card-title">
              <h4>预处理阶段</h4>
              <span className={`process-card-status ${isPreprocessDone ? 'completed' : 'processing'}`}>
                {isPreprocessDone ? '已完成' : processingPreprocessStep ? processingPreprocessStep.step_name + '...' : '处理中'}
              </span>
            </div>
            <div className="process-card-progress">
              <span>{preprocessCompleted}/{preprocessTotal}</span>
            </div>
          </div>
          
          <div className="process-steps-list">
            {preprocess_steps.map((step, idx) => (
              <div key={idx} className={`process-step-item ${step.status}`}>
                <div className="step-indicator">
                  <StepStatusIcon status={step.status} />
                  {idx < preprocess_steps.length - 1 && <div className="step-line" />}
                </div>
                <div className="step-content">
                  <div className="step-header">
                    <span className="step-name">{step.step_name}</span>
                    {step.duration_ms > 0 && (
                      <span className="step-duration">{formatDuration(step.duration_ms)}</span>
                    )}
                  </div>
                  {/* 显示步骤结果 */}
                  {step.status === 'completed' && step.result && (
                    <div className="step-result">
                      {step.step_name === '稿件分析' && step.result.title && (
                        <div className="result-item">
                          <span className="result-label">标题:</span>
                          <span className="result-value title">{step.result.title}</span>
                        </div>
                      )}
                      {step.step_name === '稿件分析' && step.result.field && (
                        <div className="result-item">
                          <span className="result-label">领域:</span>
                          <span className="result-value">{step.result.field}</span>
                        </div>
                      )}
                      {step.step_name === '稿件分析' && step.result.keywords?.length > 0 && (
                        <div className="result-item keywords">
                          <span className="result-label">关键词:</span>
                          <div className="keywords-list">
                            {step.result.keywords.slice(0, 5).map((kw, i) => (
                              <span key={i} className="keyword-tag">{kw}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.step_name === '文献检索' && step.result.total_papers > 0 && (
                        <div className="result-item">
                          <span className="result-label">筛选后:</span>
                          <span className="result-value highlight">{step.result.total_papers} 篇候选文献</span>
                        </div>
                      )}
                      {step.step_name === '文献总结' && step.result.closest_papers !== undefined && (
                        <div className="result-item">
                          <span className="result-label">最相关:</span>
                          <span className="result-value highlight">{step.result.closest_papers} 篇核心参考文献</span>
                        </div>
                      )}
                    </div>
                  )}
                  {step.error_msg && (
                    <div className="step-error">{step.error_msg}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 三审阶段卡片 */}
      {reviewerStepsArray.length > 0 && (
        <div className="process-card">
          <div className="process-card-header">
            <div className={`process-card-icon reviewers ${isReviewDone ? 'completed' : 'processing'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="process-card-title">
              <h4>三审并行阶段</h4>
              <span className={`process-card-status ${isReviewDone ? 'completed' : 'processing'}`}>
                {isReviewDone ? '已完成' : processingReviewer ? processingReviewer.reviewer_name || '审稿中...' : '等待中'}
              </span>
            </div>
            <div className="process-card-progress">
              <span>{reviewersCompleted}/{reviewersTotal}</span>
            </div>
          </div>
          
          <div className="reviewers-list">
            {reviewerStepsArray.map((reviewer, idx) => (
              <ReviewerInlineCard key={idx} reviewer={reviewer} />
            ))}
          </div>
        </div>
      )}
      
      {/* 汇总阶段卡片 */}
      {summarize_step && (
        <div className="process-card">
          <div className="process-card-header">
            <div className={`process-card-icon summarize ${isSummarizeDone ? 'completed' : isSummarizeProcessing ? 'processing' : 'pending'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </div>
            <div className="process-card-title">
              <h4>汇总阶段</h4>
              <span className={`process-card-status ${isSummarizeDone ? 'completed' : isSummarizeProcessing ? 'processing' : 'pending'}`}>
                {isSummarizeDone ? '已完成' : isSummarizeProcessing ? '正在汇总审稿意见...' : '等待三审完成'}
              </span>
            </div>
            {isSummarizeDone && (
              <div className="process-card-progress done">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            )}
          </div>
          
          {/* 汇总结果 */}
          {isSummarizeDone && summarize_step.result?.recommendation && (
            <div className="summarize-result">
              <div className="result-item">
                <span className="result-label">最终建议:</span>
                <span className={`result-value recommendation ${summarize_step.result.recommendation.toLowerCase().replace(/\s+/g, '-')}`}>
                  {summarize_step.result.recommendation}
                </span>
              </div>
            </div>
          )}
          
          {/* 处理中动画 */}
          {isSummarizeProcessing && (
            <div className="summarize-processing">
              <div className="processing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>正在综合三位审稿人的意见，生成最终审稿报告...</span>
            </div>
          )}
          
          {/* 错误信息 */}
          {summarize_step.status === 'failed' && summarize_step.error_msg && (
            <div className="summarize-error">
              {summarize_step.error_msg}
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { parseReviewJSON, getRecommendationClass } from '../../../utils/peer-review/parseUtils';
import { exportToWord, exportToPDF, exportToPPT } from '../../../utils/peer-review/exportUtils';
import ReviewStepsProgress from '../../../components/peer-review/ReviewStepsProgress';
import TaskDetailSidebar from './TaskDetailSidebar';
import ReportSections from './ReportSections';

// 审稿人名称映射
const REVIEWER_NAMES = {
  1: { name: '审稿人 Alpha', short: 'α', label: 'Alpha' },
  2: { name: '审稿人 Beta', short: 'β', label: 'Beta' },
  3: { name: '审稿人 Gamma', short: 'γ', label: 'Gamma' },
};

// 获取审稿人信息的辅助函数
const getReviewerInfo = (reviewerIndex) => {
  return REVIEWER_NAMES[reviewerIndex] || {
    name: `审稿人 ${reviewerIndex}`,
    short: String(reviewerIndex),
    label: String(reviewerIndex)
  };
};

// 任务详情视图 - 左右分栏布局
const TaskDetailView = React.memo(function TaskDetailView({ task, loading, onBack, onDelete, onStartTask, taskSteps, stepsLoading, getDownloadUrl }) {
  const [displayProgress, setDisplayProgress] = useState(0); // 显示的进度值（用于平滑动画）
  const [showReport, setShowReport] = useState(false); // 控制是否显示报告（等待进度条完成）
  const [activeReviewTab, setActiveReviewTab] = useState('main'); // 当前选中的审稿Tab: 'main' | 'Alpha' | 'Beta' | 'Gamma'
  const progressIntervalRef = useRef(null);

  // 解析最终审稿报告 JSON
  const parsedReport = useMemo(() => {
    const content = task?.final_review_content || task?.review_content;
    return parseReviewJSON(content);
  }, [task?.final_review_content, task?.review_content]);

  // 平滑进度条动画
  useEffect(() => {
    const targetProgress = task?.progress || 0;
    const isCompleted = task?.status === 'completed';
    const isFailed = task?.status === 'failed';

    // 清除之前的定时器
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // 如果任务失败，停止动画
    if (isFailed) {
      return;
    }

    // 如果任务完成，先平滑到100%，然后再显示报告
    if (isCompleted) {
      // 如果当前进度已经是100%，直接显示报告
      if (displayProgress >= 99.5) {
        setDisplayProgress(100);
        setTimeout(() => setShowReport(true), 300);
        return;
      }

      // 平滑过渡到100%
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = 100 - prev;
          if (diff <= 0.5) {
            clearInterval(progressIntervalRef.current);
            // 到达100%后延迟显示报告
            setTimeout(() => setShowReport(true), 500);
            return 100;
          }
          // 快速但平滑地到达100%
          const increment = Math.max(1, diff * 0.15);
          return Math.min(prev + increment, 100);
        });
      }, 50);
      return;
    }

    // 处理中：计算实际目标值，最后阶段卡在99%
    const actualTarget = targetProgress >= 90 ? Math.min(targetProgress, 99) : targetProgress;

    // 如果目标进度大于当前显示进度，启动平滑动画
    if (actualTarget > displayProgress) {
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = actualTarget - prev;
          if (diff <= 0) {
            clearInterval(progressIntervalRef.current);
            return actualTarget;
          }

          // 根据不同阶段使用不同的增速
          let increment;
          if (prev < 25) {
            // 第一阶段：较慢
            increment = Math.max(0.3, diff * 0.08);
          } else if (prev < 55) {
            // 第二阶段：中等
            increment = Math.max(0.25, diff * 0.06);
          } else if (prev < 90) {
            // 第三阶段：较慢
            increment = Math.max(0.2, diff * 0.05);
          } else {
            // 最后阶段：非常慢，逐渐接近99%
            increment = Math.max(0.1, diff * 0.03);
          }

          const next = prev + increment;

          // 如果接近目标，直接到达
          if (diff < 0.5) {
            clearInterval(progressIntervalRef.current);
            return actualTarget;
          }

          return Math.min(next, actualTarget);
        });
      }, 150);
    } else if (targetProgress < displayProgress && targetProgress < 10) {
      // 如果目标进度小于当前且很小（可能是新任务），直接设置
      setDisplayProgress(targetProgress);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.progress, task?.status]);

  // 任务变化时重置进度和报告显示状态
  useEffect(() => {
    if (task?.id) {
      // 如果是新任务，重置状态
      setDisplayProgress(task.progress || 0);
      // 如果任务已完成且有报告内容，直接显示报告
      if (task.status === 'completed' && (task.final_review_content || task.review_content)) {
        setShowReport(true);
      } else {
        setShowReport(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // 解析稿件内容获取预览
  const getManuscriptPreview = useCallback(() => {
    if (!task?.manuscript_text) return '暂无内容';
    return task.manuscript_text.length > 300
      ? task.manuscript_text.substring(0, 300) + '...'
      : task.manuscript_text;
  }, [task?.manuscript_text]);

  // 格式化日期
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  // 只有在完全没有任务数据时才显示全屏 loading
  if (!task && loading) {
    return (
      <div className="prvr-page">
        <div className="prvr-loading">
          <div className="prvr-loading-content">
            <div className="prvr-spinner"></div>
            <h3>正在加载审稿报告...</h3>
            <p>请稍候</p>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有任务数据且不在加载中，显示错误
  if (!task) {
    return (
      <div className="prvr-page">
        <div className="prvr-loading">
          <div className="prvr-loading-content">
            <h3>未找到任务</h3>
            <p>任务可能已被删除</p>
            <button className="prvr-btn prvr-btn-secondary" onClick={onBack}>
              返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = task.status === 'pending' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  return (
    <div className="prvr-page">
      {/* 左侧边栏 - 稿件信息 */}
      <TaskDetailSidebar
        task={task}
        isProcessing={isProcessing}
        isCompleted={isCompleted}
        isFailed={isFailed}
        showReport={showReport}
        getDownloadUrl={getDownloadUrl}
        getManuscriptPreview={getManuscriptPreview}
        formatDate={formatDate}
      />

      {/* 右侧主内容 - 审稿报告 */}
      <main className="prvr-main">
        {/* 报告头部 */}
        <div className="prvr-header">
          <div className="prvr-header-left">
            <div className="prvr-title">
              <div className="prvr-title-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
                </svg>
              </div>
              <h2>审稿报告</h2>
            </div>

            {/* 推荐意见、三审一致性和审稿人Tab */}
            {isCompleted && showReport && (
              <div className="prvr-header-badges">
                {(task.final_recommendation || task.recommendation) && (
                  <div className={`prvr-verdict-badge ${getRecommendationClass(task.final_recommendation || task.recommendation)}`}>
                    <span className="prvr-verdict-text">{task.final_recommendation || task.recommendation}</span>
                  </div>
                )}
                {task.consensus_score > 0 && (
                  <div className={`prvr-consensus-badge ${task.consensus_score >= 0.67 ? 'high' : task.consensus_score >= 0.34 ? 'medium' : 'low'}`}>
                    <span className="prvr-consensus-label">三审一致性</span>
                    <span className="prvr-consensus-value">{Math.round(task.consensus_score * 100)}%</span>
                  </div>
                )}

                {/* 审稿人Tab切换 */}
                {task.reviews && task.reviews.length > 0 && (
                  <div className="prvr-reviewer-tabs">
                    {task.reviews.map((review, idx) => {
                      const reviewerInfo = getReviewerInfo(review.reviewer_index);
                      const isActive = activeReviewTab === reviewerInfo.label;
                      const isReviewCompleted = review.status === 'completed';
                      return (
                        <button
                          key={idx}
                          className={`prvr-reviewer-tab ${isActive ? 'active' : ''} ${isReviewCompleted ? 'completed' : 'pending'}`}
                          onClick={() => isReviewCompleted && setActiveReviewTab(reviewerInfo.label)}
                          disabled={!isReviewCompleted}
                          title={isReviewCompleted ? `查看${reviewerInfo.name}的意见` : '审稿中...'}
                        >
                          <span className="prvr-tab-avatar">{reviewerInfo.short}</span>
                          <span className="prvr-tab-label">{reviewerInfo.name}</span>
                          {review.recommendation && (
                            <span className={`prvr-tab-badge ${getRecommendationClass(review.recommendation)}`}>
                              {review.recommendation}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 导出按钮 */}
                <div className="prvr-export-dropdown">
                  <button className="prvr-export-btn" title="导出报告">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    导出
                  </button>
                  <div className="prvr-export-menu">
                    <button
                      className="prvr-export-item"
                      onClick={() => exportToWord(task, parsedReport)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      Word 文档
                    </button>
                    <button
                      className="prvr-export-item"
                      onClick={() => exportToPDF(task, parsedReport)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      PDF 文档
                    </button>
                    <button
                      className="prvr-export-item"
                      onClick={() => exportToPPT(task, parsedReport)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                      PPT 演示
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 处理中状态 - 详细步骤进度展示 */}
        {(isProcessing || (isCompleted && !showReport)) && (
          <div className="prvr-processing-container">
            <ReviewStepsProgress stepsData={taskSteps} loading={stepsLoading} />
          </div>
        )}

        {/* 错误状态 */}
        {isFailed && (
          <div className="prvr-error">
            <div className="prvr-error-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3>审稿失败</h3>
            <p>{task.error_message || '处理过程中发生错误，请重试'}</p>
            <button className="prvr-btn prvr-btn-secondary" onClick={onDelete}>
              删除任务
            </button>
          </div>
        )}

        {/* 任务完成但没有最终汇总报告（可能部分审稿人完成） */}
        {isCompleted && !task.final_review_content && !task.review_content && (
          <div className="prvr-partial-result">
            {/* 提示信息 */}
            <div className="prvr-partial-notice">
              <div className="prvr-partial-notice-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4"/>
                  <path d="M12 16h.01"/>
                </svg>
              </div>
              <div className="prvr-partial-notice-content">
                <h4>
                  {task.reviews?.every(r => r.status === 'failed')
                    ? '审稿未能完成'
                    : '综合报告生成失败'}
                </h4>
                <p>
                  {task.reviews?.every(r => r.status === 'failed')
                    ? '三位审稿人均审稿失败，请重新提交或联系客服'
                    : task.reviews?.some(r => r.status === 'completed' && r.review_content)
                      ? '部分审稿人已完成，您可以查看已完成的审稿意见'
                      : '审稿报告生成失败，请重新提交或联系客服'}
                </p>
              </div>
              <button className="prvr-btn prvr-btn-secondary prvr-btn-small" onClick={onDelete}>
                删除任务
              </button>
            </div>

            {/* 如果有部分审稿人完成，展示他们的独立意见 */}
            {task.reviews && task.reviews.some(r => r.status === 'completed' || r.review_content) && (
              <div className="prvr-report-content">
                <section className="prvr-report-section prvr-section-reviewers">
                  <h3 className="prvr-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    三位审稿人意见 ({task.reviews.filter(r => r.status === 'completed').length}/3 完成)
                  </h3>
                  <div className="prvr-section-content">
                    <div className="prvr-reviewers-grid">
                      {task.reviews.map((review, idx) => {
                        const reviewerInfo = getReviewerInfo(review.reviewer_index);
                        return (
                        <div
                          key={idx}
                          className={`prvr-reviewer-card ${review.status} ${(review.status === 'completed' || review.review_content) ? 'clickable' : ''}`}
                          onClick={() => {
                            // 点击评审者卡片功能已简化，相关状态已移除
                          }}
                        >
                          <div className="prvr-reviewer-avatar">
                            {reviewerInfo.short}
                          </div>
                          <div className="prvr-reviewer-info">
                            <span className="prvr-reviewer-name">{reviewerInfo.name}</span>
                            <span className={`prvr-reviewer-status ${review.status}`}>
                              {review.status === 'completed' ? '已完成' : review.status === 'processing' ? '审稿中' : review.status === 'failed' ? '失败' : '等待中'}
                            </span>
                          </div>
                          {review.recommendation && (
                            <span className={`prvr-mini-badge ${getRecommendationClass(review.recommendation)}`}>
                              {review.recommendation}
                            </span>
                          )}
                          {(review.status === 'completed' || review.review_content) && (
                            <svg className="prvr-reviewer-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {/* 已完成 - 显示审稿报告（等待进度条动画完成后显示） */}
        {isCompleted && showReport && (
          <div className="prvr-report-layout prvr-report-single-column">
            {/* 审稿报告正文 - 单列布局 */}
            <div className="prvr-report-main">
              {/* 返回主报告按钮 - 仅在查看单个审稿人时显示 */}
              {activeReviewTab !== 'main' && (
                <button className="prvr-back-to-main" onClick={() => setActiveReviewTab('main')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  返回主报告
                </button>
              )}

              {/* 主报告内容 */}
              {activeReviewTab === 'main' && (task.final_review_content || task.review_content) && (
                <div className="prvr-report-content">
                  <ReportSections
                    parsedReport={parsedReport}
                    rawContent={task.final_review_content || task.review_content}
                  />
                </div>
              )}

              {/* 单个审稿人的内容 - 当选择了某个审稿人Tab时显示 */}
              {activeReviewTab !== 'main' && task.reviews && (() => {
                const selectedReview = task.reviews.find(r =>
                  getReviewerInfo(r.reviewer_index).label === activeReviewTab
                );
                if (!selectedReview) return null;

                const reviewerReport = parseReviewJSON(selectedReview.review_content);
                const selectedReviewerInfo = getReviewerInfo(selectedReview.reviewer_index);

                return (
                  <div className="prvr-report-content prvr-reviewer-report">
                    {/* 审稿人标题 */}
                    <div className="prvr-reviewer-header">
                      <div className="prvr-reviewer-title">
                        <span className="prvr-reviewer-avatar-large">{selectedReviewerInfo.short}</span>
                        <h3>{selectedReviewerInfo.name}的审稿意见</h3>
                      </div>
                      {selectedReview.recommendation && (
                        <div className={`prvr-verdict-badge ${getRecommendationClass(selectedReview.recommendation)}`}>
                          <span className="prvr-verdict-text">{selectedReview.recommendation}</span>
                        </div>
                      )}
                    </div>

                    <ReportSections
                      parsedReport={reviewerReport}
                      rawContent={selectedReview.review_content}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
});

export default TaskDetailView;

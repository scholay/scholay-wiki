/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseReviewJSON, getRecommendationClass } from '../../../utils/peer-review/parseUtils';
import { exportToWord, exportToPDF, exportToPPT } from '../../../utils/peer-review/exportUtils';
import ReviewStepsProgress from '../../../components/peer-review/ReviewStepsProgress';
import TaskDetailSidebar from './TaskDetailSidebar';
import ReportSections from './ReportSections';

// 审稿人名称映射 —— 与 ReviewStepsProgress 保持一致的配色
const REVIEWER_NAMES = {
  1: { name: '审稿人 Alpha', short: 'α', label: 'Alpha', accent: '#8b5cf6' },
  2: { name: '审稿人 Beta', short: 'β', label: 'Beta', accent: '#06b6d4' },
  3: { name: '审稿人 Gamma', short: 'γ', label: 'Gamma', accent: '#10b981' },
};

// 获取审稿人信息的辅助函数
const getReviewerInfo = (reviewerIndex) => {
  return REVIEWER_NAMES[reviewerIndex] || {
    name: `审稿人 ${reviewerIndex}`,
    short: String(reviewerIndex),
    label: String(reviewerIndex),
    accent: '#64748b'
  };
};

// 根据 getRecommendationClass 返回的类名映射文案与色调
// 色调值直接对应 CSS 的 recommendation-{tone} 类名
const RECOMMENDATION_META = {
  'accept': { label: '接收发表', tone: 'accept', desc: '整体质量达到发表标准' },
  'minor-revision': { label: '小修后接收', tone: 'minor-revision', desc: '需要少量修改后即可发表' },
  'major-revision': { label: '大修后接收', tone: 'major-revision', desc: '存在重要问题需要显著修改' },
  'reject': { label: '建议拒稿', tone: 'reject', desc: '存在根本性问题不建议发表' },
};

const resolveRecommendationMeta = (raw) => {
  if (!raw) return { label: '审稿完成', tone: 'neutral', desc: '已生成综合审稿意见' };
  const cls = getRecommendationClass(raw);
  const match = RECOMMENDATION_META[cls];
  if (match) return match;
  return { label: String(raw), tone: 'neutral', desc: '综合三位审稿人意见' };
};

// 任务详情视图 - 左右分栏布局
const TaskDetailView = React.memo(function TaskDetailView({ task, loading, onBack, onDelete, onStartTask, taskSteps, stepsLoading, getDownloadUrl }) {
  const [displayProgress, setDisplayProgress] = useState(0); // 显示的进度值（用于平滑动画）
  const [showReport, setShowReport] = useState(false); // 控制是否显示报告（等待进度条完成）
  const [activeReviewTab, setActiveReviewTab] = useState('main'); // 当前选中的审稿Tab: 'main' | 'Alpha' | 'Beta' | 'Gamma'
  const progressIntervalRef = useRef(null);
  const showReportTimeoutRef = useRef(null);
  const displayProgressRef = useRef(0); // 镜像 displayProgress，避免 effect 闭包读到旧值

  // 同步 ref 与 state —— 让 effect 中的读取永远拿到最新值
  useEffect(() => {
    displayProgressRef.current = displayProgress;
  }, [displayProgress]);

  // 统一的清理函数
  const clearProgressTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (showReportTimeoutRef.current) {
      clearTimeout(showReportTimeoutRef.current);
      showReportTimeoutRef.current = null;
    }
  }, []);

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

    // 清除之前的定时器（包括延迟显示报告的 setTimeout）
    clearProgressTimers();

    // 如果任务失败，停止动画
    if (isFailed) {
      return;
    }

    // 如果任务完成，先平滑到100%，然后再显示报告
    if (isCompleted) {
      // 如果当前进度已经很接近100%，直接显示报告
      if (displayProgressRef.current >= 99.5) {
        setDisplayProgress(100);
        showReportTimeoutRef.current = setTimeout(() => {
          setShowReport(true);
          showReportTimeoutRef.current = null;
        }, 300);
        return;
      }

      // 平滑过渡到100%
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = 100 - prev;
          if (diff <= 0.5) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            // 到达100%后延迟显示报告
            showReportTimeoutRef.current = setTimeout(() => {
              setShowReport(true);
              showReportTimeoutRef.current = null;
            }, 500);
            return 100;
          }
          // 快速但平滑地到达100%
          const increment = Math.max(1, diff * 0.15);
          return Math.min(prev + increment, 100);
        });
      }, 50);
      return clearProgressTimers;
    }

    // 处理中：计算实际目标值，最后阶段卡在99%
    const actualTarget = targetProgress >= 90 ? Math.min(targetProgress, 99) : targetProgress;

    // 如果目标进度大于当前显示进度，启动平滑动画
    if (actualTarget > displayProgressRef.current) {
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = actualTarget - prev;
          if (diff <= 0) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            return actualTarget;
          }

          // 根据不同阶段使用不同的增速
          let increment;
          if (prev < 25) {
            increment = Math.max(0.3, diff * 0.08);
          } else if (prev < 55) {
            increment = Math.max(0.25, diff * 0.06);
          } else if (prev < 90) {
            increment = Math.max(0.2, diff * 0.05);
          } else {
            increment = Math.max(0.1, diff * 0.03);
          }

          // 如果接近目标，直接到达
          if (diff < 0.5) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            return actualTarget;
          }

          return Math.min(prev + increment, actualTarget);
        });
      }, 150);
    } else if (targetProgress < displayProgressRef.current && targetProgress < 10) {
      // 如果目标进度小于当前且很小（可能是新任务），直接设置
      setDisplayProgress(targetProgress);
    }

    return clearProgressTimers;
  }, [task?.progress, task?.status, clearProgressTimers]);

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

            {/* 审稿人Tab + 导出按钮（终审结论已在下方 Hero 区展示） */}
            {isCompleted && showReport && (
              <div className="prvr-header-badges">
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

        {/* 处理中 → 已完成 的主阶段切换（带 framer-motion 过渡动画） */}
        <AnimatePresence mode="wait">
          {(isProcessing || (isCompleted && !showReport)) && (
            <motion.div
              key="processing"
              className="prvr-processing-container"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, scale: 0.985 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.25, 1] }}
            >
              <ReviewStepsProgress
                stepsData={taskSteps}
                loading={stepsLoading}
                overallProgress={displayProgress}
              />
            </motion.div>
          )}

          {isFailed && (
            <motion.div
              key="failed"
              className="prvr-error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>

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
        <AnimatePresence mode="wait">
          {isCompleted && showReport && (
            <motion.div
              key="report"
              className="prvr-report-layout prvr-report-single-column"
              initial={{ opacity: 0, y: 24, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.55, ease: [0.2, 0.8, 0.25, 1], delay: 0.05 }}
            >
              <div className="prvr-report-main">
                {/* Hero 终审判决 —— 仅在主报告视图显示 */}
                {activeReviewTab === 'main' && (task.final_review_content || task.review_content) && (() => {
                  const rec = task.final_recommendation || task.recommendation;
                  const meta = resolveRecommendationMeta(rec);
                  const consensusPct = task.consensus_score > 0 ? Math.round(task.consensus_score * 100) : null;
                  const CIRCUM = 2 * Math.PI * 54; // r=54
                  const dashoffset = consensusPct != null ? CIRCUM * (1 - consensusPct / 100) : CIRCUM;

                  return (
                    <motion.section
                      className="prvr-verdict-hero"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.25, 1], delay: 0.15 }}
                    >
                      <div className="prvr-vh-bg" aria-hidden="true" />

                      {/* 主判决文案 */}
                      <div className="prvr-vh-verdict">
                        <span className="prvr-vh-eyebrow">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          终审结论
                        </span>
                        <h3 className={`prvr-vh-result recommendation-${meta.tone}`}>{meta.label}</h3>
                        <p className="prvr-vh-desc">{meta.desc}</p>
                      </div>

                      {/* 一致性评分圆环 —— SVG 整体已在 CSS 中旋转 -90° */}
                      {consensusPct != null && (
                        <div className="prvr-vh-consensus">
                          <svg width="132" height="132" viewBox="0 0 132 132">
                            <defs>
                              <linearGradient id="prvrVhGrad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#06b6d4" />
                              </linearGradient>
                            </defs>
                            <circle
                              className="prvr-vh-consensus-track"
                              cx="66" cy="66" r="54"
                              fill="none" strokeWidth="8"
                            />
                            <circle
                              className="prvr-vh-consensus-fill"
                              cx="66" cy="66" r="54"
                              fill="none" strokeWidth="8"
                              stroke="url(#prvrVhGrad)"
                              strokeDasharray={CIRCUM}
                              strokeDashoffset={dashoffset}
                            />
                          </svg>
                          <div className="prvr-vh-consensus-inner">
                            <span className="prvr-vh-consensus-num">{consensusPct}<sup>%</sup></span>
                            <span className="prvr-vh-consensus-label">三审一致性</span>
                          </div>
                        </div>
                      )}

                      {/* 三位审稿人快览 */}
                      {task.reviews && task.reviews.length > 0 && (
                        <div className="prvr-vh-reviewers">
                          {task.reviews.map((review, idx) => {
                            const info = getReviewerInfo(review.reviewer_index);
                            const recMeta = resolveRecommendationMeta(review.recommendation);
                            return (
                              <motion.div
                                key={idx}
                                className="prvr-vh-reviewer"
                                style={{ '--rv-accent': info.accent }}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, delay: 0.35 + idx * 0.08 }}
                              >
                                <span className="prvr-vh-avatar">{info.short}</span>
                                <div className="prvr-vh-r-meta">
                                  <span className="prvr-vh-r-name">{info.label}</span>
                                  {review.recommendation && (
                                    <span className={`prvr-vh-r-badge recommendation-${recMeta.tone}`}>
                                      {recMeta.label}
                                    </span>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </motion.section>
                  );
                })()}

                {/* 返回主报告按钮 - 仅在查看单个审稿人时显示 */}
                {activeReviewTab !== 'main' && (
                  <button className="prvr-back-to-main" onClick={() => setActiveReviewTab('main')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    返回主报告
                  </button>
                )}

                {/* 报告正文区 —— Tab 切换使用 AnimatePresence 做淡入淡出 */}
                <AnimatePresence mode="wait">
                  {activeReviewTab === 'main' && (task.final_review_content || task.review_content) && (
                    <motion.div
                      key="main-report"
                      className="prvr-report-content"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <ReportSections
                        parsedReport={parsedReport}
                        rawContent={task.final_review_content || task.review_content}
                      />
                    </motion.div>
                  )}

                  {activeReviewTab !== 'main' && task.reviews && (() => {
                    const selectedReview = task.reviews.find(r =>
                      getReviewerInfo(r.reviewer_index).label === activeReviewTab
                    );
                    if (!selectedReview) return null;

                    const reviewerReport = parseReviewJSON(selectedReview.review_content);
                    const selectedReviewerInfo = getReviewerInfo(selectedReview.reviewer_index);

                    return (
                      <motion.div
                        key={`reviewer-${activeReviewTab}`}
                        className="prvr-report-content prvr-reviewer-report"
                        style={{ '--rv-accent': selectedReviewerInfo.accent }}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
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
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
});

export default TaskDetailView;

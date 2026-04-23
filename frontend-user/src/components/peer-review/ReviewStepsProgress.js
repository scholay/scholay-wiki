/**
 * 审稿步骤进度展示组件 — Mission Control 风格
 * 顶部：圆形进度环 + 当前阶段摘要；下方：三阶段竖向时间线
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import './ReviewStepsProgress.css';

// 审稿人配置（α/β/γ 各自独立配色）
const REVIEWER_NAMES = {
  1: { name: '审稿人 Alpha', short: 'α', hue: 262, accent: '#8b5cf6' },   // 紫
  2: { name: '审稿人 Beta',  short: 'β', hue: 188, accent: '#06b6d4' },   // 青
  3: { name: '审稿人 Gamma', short: 'γ', hue: 160, accent: '#10b981' },   // 绿
};

const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
};

const StepStatusIcon = ({ status }) => {
  switch (status) {
    case 'completed':
      return (
        <svg className="step-icon completed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      );
    case 'processing':
      return (
        <svg className="step-icon processing spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          <circle cx="12" cy="12" r="8"/>
        </svg>
      );
  }
};

// 顶部圆形进度环 Hero
function ProgressHero({ progress, phaseLabel, subLabel, isDone }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`prvr-phero ${isDone ? 'is-done' : ''}`}>
      <div className="prvr-phero-bg" aria-hidden>
        <span className="prvr-phero-beam prvr-phero-beam-a" />
        <span className="prvr-phero-beam prvr-phero-beam-b" />
        <span className="prvr-phero-grid" />
      </div>

      <div className="prvr-phero-ring">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="prvr-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={radius} className="prvr-ring-track" strokeWidth="8" fill="none" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            className="prvr-ring-fill"
            strokeWidth="8"
            fill="none"
            stroke="url(#prvr-ring-grad)"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="prvr-phero-num">
          <span className="prvr-phero-num-val">{Math.round(progress)}</span>
          <span className="prvr-phero-num-unit">%</span>
        </div>
      </div>

      <div className="prvr-phero-info">
        <div className="prvr-phero-eyebrow">
          <span className="prvr-phero-dot" />
          {isDone ? 'Ready to reveal' : 'Review in progress'}
        </div>
        <h3 className="prvr-phero-title">{phaseLabel}</h3>
        <p className="prvr-phero-sub">{subLabel}</p>
        <div className="prvr-phero-bar">
          <span className="prvr-phero-bar-fill" style={{ width: `${Math.max(4, progress)}%` }} />
        </div>
      </div>
    </div>
  );
}

// 单个审稿人卡片
function ReviewerInlineCard({ reviewer }) {
  const info = REVIEWER_NAMES[reviewer.reviewer_index] || {
    name: `审稿人 ${reviewer.reviewer_index}`,
    short: reviewer.reviewer_index,
    accent: '#8b5cf6',
    hue: 262,
  };

  const isCompleted = reviewer.status === 'completed';
  const isFailed = reviewer.status === 'failed';
  const isProcessing = reviewer.status === 'processing';

  const cardProgress = isCompleted ? 100 : (reviewer.progress || 0);

  return (
    <div
      className={`reviewer-inline-card ${reviewer.status}`}
      style={{ '--rv-accent': info.accent, '--rv-hue': info.hue }}
    >
      <div className="reviewer-inline-header">
        <div className="reviewer-inline-avatar">
          <span>{info.short}</span>
          {isProcessing && <span className="reviewer-inline-pulse" />}
        </div>
        <div className="reviewer-inline-info">
          <span className="reviewer-inline-name">{info.name}</span>
        </div>
        <div className={`reviewer-inline-status ${reviewer.status}`}>
          {isCompleted && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              {reviewer.progress || 0}%
            </>
          )}
          {!isCompleted && !isFailed && !isProcessing && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="8"/>
              </svg>
              等待中
            </>
          )}
        </div>
      </div>

      {/* 审稿人专属细进度条 */}
      <div className={`reviewer-inline-progress ${reviewer.status}`}>
        <span className="reviewer-inline-progress-fill" style={{ width: `${cardProgress}%` }} />
      </div>

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

      {isFailed && reviewer.error_message && (
        <div className="reviewer-inline-error">{reviewer.error_message}</div>
      )}
    </div>
  );
}

// 阶段状态摘要（供顶部Hero使用）
function computeHeroState({ preprocess_steps = [], reviewer_steps = [], summarize_step }) {
  const preTotal = preprocess_steps.length;
  const preDone = preprocess_steps.filter(s => s.status === 'completed').length;
  const prePaying = preprocess_steps.find(s => s.status === 'processing');
  const preAllDone = preTotal > 0 && preDone === preTotal;

  const rvTotal = reviewer_steps.length;
  const rvDone = reviewer_steps.filter(r => r.status === 'completed').length;
  const rvProcessing = reviewer_steps.find(r => r.status === 'processing');

  const sumDone = summarize_step?.status === 'completed';
  const sumProcessing = summarize_step?.status === 'processing';

  // 内部聚合进度：预处理 30% + 三审 55% + 汇总 15%
  const preWeight = preTotal > 0 ? (preDone / preTotal) * 30 : 0;
  const rvWeight = rvTotal > 0 ? (rvDone / rvTotal) * 55 : 0;
  const sumWeight = sumDone ? 15 : (sumProcessing ? 7 : 0);
  const agg = Math.min(99, Math.round(preWeight + rvWeight + sumWeight));

  let phaseLabel = '准备审稿环境';
  let subLabel = '正在初始化三位审稿人...';

  if (sumDone) {
    phaseLabel = '即将揭晓结果';
    subLabel = '报告已生成，即将呈现...';
  } else if (sumProcessing) {
    phaseLabel = '综合三审意见中';
    subLabel = '正在融合 Alpha · Beta · Gamma 的评审观点';
  } else if (preAllDone && rvTotal > 0) {
    if (rvDone === rvTotal) {
      phaseLabel = '三审已完成';
      subLabel = '等待汇总最终审稿意见';
    } else if (rvProcessing) {
      const info = REVIEWER_NAMES[rvProcessing.reviewer_index];
      phaseLabel = '三审并行进行中';
      subLabel = `${info?.name || '审稿人'} 正在审阅（已完成 ${rvDone}/${rvTotal}）`;
    } else {
      phaseLabel = '三审准备中';
      subLabel = `已完成 ${rvDone}/${rvTotal} 位审稿`;
    }
  } else if (prePaying) {
    phaseLabel = '预处理进行中';
    subLabel = `${prePaying.step_name}... (${preDone}/${preTotal})`;
  } else if (preTotal > 0) {
    phaseLabel = '预处理阶段';
    subLabel = `已完成 ${preDone}/${preTotal} 个步骤`;
  }

  return { agg, phaseLabel, subLabel, isDone: sumDone };
}

// 主组件
export default function ReviewStepsProgress({ stepsData, loading, overallProgress }) {
  const heroState = useMemo(() => computeHeroState(stepsData || {}), [stepsData]);

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

  const preprocessCompleted = preprocess_steps?.filter(s => s.status === 'completed').length || 0;
  const preprocessTotal = preprocess_steps?.length || 0;
  const isPreprocessDone = preprocessCompleted === preprocessTotal && preprocessTotal > 0;
  const processingPreprocessStep = preprocess_steps?.find(s => s.status === 'processing');

  const reviewersCompleted = reviewerStepsArray.filter(r => r.status === 'completed').length;
  const reviewersTotal = reviewerStepsArray.length;
  const isReviewDone = reviewersCompleted === reviewersTotal && reviewersTotal > 0;
  const processingReviewer = reviewerStepsArray.find(r => r.status === 'processing');

  const isSummarizeDone = summarize_step?.status === 'completed';
  const isSummarizeProcessing = summarize_step?.status === 'processing';

  // 使用外部传入的进度（若有）优先，否则用内部聚合
  const displayProgress = typeof overallProgress === 'number' ? overallProgress : heroState.agg;

  const cardVariant = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <div className="review-steps-progress-container">
      {/* 顶部 Hero 进度环 */}
      <ProgressHero
        progress={displayProgress}
        phaseLabel={heroState.phaseLabel}
        subLabel={heroState.subLabel}
        isDone={heroState.isDone}
      />

      <motion.div
        className="review-steps-progress"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
      >
        {/* 预处理阶段卡片 */}
        {preprocess_steps && preprocess_steps.length > 0 && (
          <motion.div
            className={`process-card ${isPreprocessDone ? 'stage-done' : 'stage-active'}`}
            variants={cardVariant}
          >
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
                <div className="process-card-phase">Phase 01</div>
                <h4>预处理阶段</h4>
                <span className={`process-card-status ${isPreprocessDone ? 'completed' : 'processing'}`}>
                  {isPreprocessDone ? '已完成' : processingPreprocessStep ? processingPreprocessStep.step_name + '...' : '处理中'}
                </span>
              </div>
              <div className="process-card-progress">
                <span className="pcp-num">{preprocessCompleted}</span>
                <span className="pcp-sep">/</span>
                <span className="pcp-tot">{preprocessTotal}</span>
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
                    {step.status === 'completed' && step.result && (
                      <div className="step-result">
                        {step.step_name === '稿件分析' && step.result.title && (
                          <div className="result-item">
                            <span className="result-label">标题</span>
                            <span className="result-value title">{step.result.title}</span>
                          </div>
                        )}
                        {step.step_name === '稿件分析' && step.result.field && (
                          <div className="result-item">
                            <span className="result-label">领域</span>
                            <span className="result-value">{step.result.field}</span>
                          </div>
                        )}
                        {step.step_name === '稿件分析' && step.result.keywords?.length > 0 && (
                          <div className="result-item keywords">
                            <span className="result-label">关键词</span>
                            <div className="keywords-list">
                              {step.result.keywords.slice(0, 5).map((kw, i) => (
                                <span key={i} className="keyword-tag">{kw}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {step.step_name === '文献检索' && step.result.total_papers > 0 && (
                          <div className="result-item">
                            <span className="result-label">筛选后</span>
                            <span className="result-value highlight">{step.result.total_papers} 篇候选文献</span>
                          </div>
                        )}
                        {step.step_name === '文献总结' && step.result.closest_papers !== undefined && (
                          <div className="result-item">
                            <span className="result-label">最相关</span>
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
          </motion.div>
        )}

        {/* 三审阶段卡片 */}
        {reviewerStepsArray.length > 0 && (
          <motion.div
            className={`process-card ${isReviewDone ? 'stage-done' : processingReviewer ? 'stage-active' : 'stage-pending'}`}
            variants={cardVariant}
          >
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
                <div className="process-card-phase">Phase 02</div>
                <h4>三审并行</h4>
                <span className={`process-card-status ${isReviewDone ? 'completed' : 'processing'}`}>
                  {isReviewDone ? '全部完成' : processingReviewer ? '审稿中...' : '等待预处理完成'}
                </span>
              </div>
              <div className="process-card-progress">
                <span className="pcp-num">{reviewersCompleted}</span>
                <span className="pcp-sep">/</span>
                <span className="pcp-tot">{reviewersTotal}</span>
              </div>
            </div>

            <div className="reviewers-list">
              {reviewerStepsArray.map((reviewer, idx) => (
                <ReviewerInlineCard key={idx} reviewer={reviewer} />
              ))}
            </div>
          </motion.div>
        )}

        {/* 汇总阶段卡片 */}
        {summarize_step && (
          <motion.div
            className={`process-card ${isSummarizeDone ? 'stage-done' : isSummarizeProcessing ? 'stage-active' : 'stage-pending'}`}
            variants={cardVariant}
          >
            <div className="process-card-header">
              <div className={`process-card-icon summarize ${isSummarizeDone ? 'completed' : isSummarizeProcessing ? 'processing' : 'pending'}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <div className="process-card-title">
                <div className="process-card-phase">Phase 03</div>
                <h4>综合汇总</h4>
                <span className={`process-card-status ${isSummarizeDone ? 'completed' : isSummarizeProcessing ? 'processing' : 'pending'}`}>
                  {isSummarizeDone ? '已完成' : isSummarizeProcessing ? '融合三审中...' : '等待三审完成'}
                </span>
              </div>
              {isSummarizeDone && (
                <div className="process-card-progress done">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              )}
            </div>

            {isSummarizeDone && summarize_step.result?.recommendation && (
              <div className="summarize-result">
                <div className="result-item">
                  <span className="result-label">最终建议</span>
                  <span className={`result-value recommendation ${summarize_step.result.recommendation.toLowerCase().replace(/\s+/g, '-')}`}>
                    {summarize_step.result.recommendation}
                  </span>
                </div>
              </div>
            )}

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

            {summarize_step.status === 'failed' && summarize_step.error_msg && (
              <div className="summarize-error">{summarize_step.error_msg}</div>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

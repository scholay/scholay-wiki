/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * TaskCard - 审稿任务卡片组件
 * 从 PeerReviewPage.js 提取
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { STATUS_MAP } from '../../utils/peer-review/constants';

/**
 * 获取模型名称
 */
const getModelName = (level) => {
  const models = { low: '普通', mid: '进阶', high: '高级' };
  return models[level] || level || '普通';
};

/**
 * 获取推荐意见信息
 */
const getRecommendationInfo = (recommendation) => {
  if (!recommendation) return null;
  const map = {
    'Accept': { label: 'Accept', className: 'accept' },
    'Minor Revision': { label: 'Minor Revision', className: 'minor' },
    'Major Revision': { label: 'Major Revision', className: 'major' },
    'Reject': { label: 'Reject', className: 'reject' },
    'Pending Review': { label: 'Pending', className: 'pending' },
  };
  return map[recommendation] || { label: recommendation, className: 'pending' };
};

/**
 * 模型图标组件
 */
const ModelIcon = ({ level }) => {
  if (!level || level === 'low') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    );
  }
  if (level === 'mid') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
};

/**
 * TaskCard 组件
 */
const TaskCard = memo(({ task, onViewDetail, onDelete }) => {
  const recommendationInfo = getRecommendationInfo(task.final_recommendation);

  return (
    <div 
      className={`prv-task-card prv-task-card-${task.status}`} 
      onClick={() => onViewDetail(task.id)}
    >
      {/* 盖章 */}
      {task.status === 'completed' && recommendationInfo && (
        <div className={`prv-task-stamp prv-stamp-${recommendationInfo.className}`}>
          <span className="prv-stamp-text">{recommendationInfo.label}</span>
        </div>
      )}
      
      {/* 顶部：标题和状态 */}
      <div className="prv-task-card-header">
        <h4 className="prv-task-card-title">{task.title || '未命名稿件'}</h4>
        <span className={`prv-task-status-badge prv-status-${task.status}`}>
          {task.status === 'processing' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="prv-spin-icon">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          )}
          {task.status === 'completed' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          {task.status === 'failed' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          )}
          {STATUS_MAP[task.status]?.label || task.status}
        </span>
      </div>

      {/* 中部：任务信息标签 */}
      <div className="prv-task-card-meta">
        {task.input_type === 'file' ? (
          <span className="prv-task-meta-tag prv-meta-file">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="prv-meta-label">{task.file_ext ? task.file_ext.toUpperCase() : '文件'}</span>
          </span>
        ) : (
          <span className="prv-task-meta-tag prv-meta-text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span className="prv-meta-label">文字输入</span>
          </span>
        )}

        <span className={`prv-task-meta-tag prv-meta-model prv-meta-model-${task.model_level || 'low'}`}>
          <ModelIcon level={task.model_level} />
          {getModelName(task.model_level)}
        </span>

        {task.target_venue && (
          <span className="prv-task-meta-tag prv-meta-venue">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span className="prv-meta-label" title={task.target_venue}>{task.target_venue}</span>
          </span>
        )}
      </div>

      {/* 底部：时间和操作 */}
      <div className="prv-task-card-footer">
        <span className="prv-task-card-time">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {new Date(task.created_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
        {(task.status === 'draft' || task.status === 'failed') && (
          <button 
            className="prv-task-card-delete" 
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            title="删除任务"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

TaskCard.propTypes = {
  task: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string,
    status: PropTypes.string.isRequired,
    input_type: PropTypes.string,
    file_ext: PropTypes.string,
    model_level: PropTypes.string,
    target_venue: PropTypes.string,
    final_recommendation: PropTypes.string,
    created_at: PropTypes.string.isRequired,
  }).isRequired,
  onViewDetail: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default TaskCard;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { STATUS_MAP } from '../../../utils/peer-review/constants';
import { getFileIcon } from '../../../utils/peer-review/fileUtils';
import { PreviewCard } from './index';

/**
 * 任务详情 - 左侧边栏
 * 包含：隐私模式标记、状态卡片、提交信息、附件、内容预览、稿件分析
 */
const TaskDetailSidebar = React.memo(function TaskDetailSidebar({
  task,
  isProcessing,
  isCompleted,
  isFailed,
  showReport,
  getDownloadUrl,
  getManuscriptPreview,
  formatDate,
}) {
  return (
    <aside className="prvr-sidebar">
      {/* 隐私模式标记 */}
      {task.is_private && (
        <div className="prv-private-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <div className="prv-private-banner-text">
            <strong>隐私模式</strong>
            <span>审稿完成后请及时下载报告，数据将在 24 小时内自动删除</span>
          </div>
        </div>
      )}
      {/* 状态卡片 */}
      <div className="prvr-card">
        <div className="prvr-card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          任务状态
        </div>
        <div className={`prvr-status prvr-status-${task.status}`}>
          {isProcessing && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="prvr-spin">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          )}
          {isCompleted && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          {isFailed && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          )}
          {STATUS_MAP[task.status]?.label || task.status}
        </div>
      </div>

      {/* 提交信息卡片 */}
      <div className="prvr-card prvr-submit-card">
        <div className="prvr-card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          提交信息
        </div>

        {/* 文件/文本来源区块 */}
        <div className="prvr-source-block">
          {task.input_type === 'file' && task.manuscript_file ? (
            <>
              <div className="prvr-source-icon file">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div className="prvr-source-info">
                <span className="prvr-source-type">文件上传</span>
                <span className="prvr-source-name" title={task.manuscript_file.file_name}>
                  {task.manuscript_file.file_name}
                </span>
              </div>
              {task.manuscript_file.id && (
                <button
                  className="prvr-download-btn"
                  onClick={() => window.open(getDownloadUrl(task.manuscript_file.id), '_blank')}
                  title="下载原文件"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              )}
            </>
          ) : (
            <>
              <div className="prvr-source-icon text">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </div>
              <div className="prvr-source-info">
                <span className="prvr-source-type">文本粘贴</span>
                <span className="prvr-source-name">{task.manuscript_text?.length?.toLocaleString() || 0} 字</span>
              </div>
            </>
          )}
        </div>

        {/* 信息网格 */}
        <div className="prvr-info-grid">
          <div className="prvr-info-cell">
            <span className="prvr-info-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            <span className="prvr-info-text">
              <span className="prvr-info-label">审稿模式:</span> 三模型并行审稿
            </span>
          </div>
        </div>

        {/* 时间信息 */}
        <div className="prvr-time-info">
          <div className="prvr-time-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <span>提交于 {formatDate(task.submitted_at || task.created_at)}</span>
          </div>
          {task.completed_at && (
            <div className="prvr-time-row completed">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>完成于 {formatDate(task.completed_at)}</span>
            </div>
          )}
        </div>

        {/* 附件信息 */}
        {task.attachments && task.attachments.length > 0 && (
          <div className="prvr-attachments-section">
            <div className="prvr-attachments-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <span>附件 ({task.attachments.length})</span>
            </div>
            <div className="prvr-attachments-list">
              {task.attachments.map((att, idx) => (
                <div
                  key={att.id || idx}
                  className="prvr-attachment-item clickable"
                  onClick={() => att.id && window.open(getDownloadUrl(att.id), '_blank')}
                  title={`点击下载: ${att.file_name}`}
                >
                  {getFileIcon(att.file_ext)}
                  <span className="prvr-attachment-name">
                    {att.file_name}
                  </span>
                  <span className="prvr-attachment-download">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 内容预览卡片 - 仅文本输入方式显示 */}
      {!task.manuscript_file && task.manuscript_text && (
        <PreviewCard
          preview={getManuscriptPreview()}
          fullText={task.manuscript_text}
        />
      )}

      {/* 稿件分析卡片 */}
      {isCompleted && showReport && task.manuscript_meta && (
        <div className="prvr-card prvr-analysis-card">
          <div className="prvr-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            稿件分析
          </div>
          <div className="prvr-analysis-content">
            {task.manuscript_meta.title && (
              <div className="prvr-analysis-item prvr-analysis-title">
                <span className="prvr-analysis-label">论文标题</span>
                <span className="prvr-analysis-value">{task.manuscript_meta.title}</span>
              </div>
            )}
            {task.manuscript_meta.field && (
              <div className="prvr-analysis-item">
                <span className="prvr-analysis-label">研究领域</span>
                <span className="prvr-analysis-value">{task.manuscript_meta.field}</span>
              </div>
            )}
            {task.manuscript_meta.main_topic && (
              <div className="prvr-analysis-item">
                <span className="prvr-analysis-label">研究主题</span>
                <span className="prvr-analysis-value">{task.manuscript_meta.main_topic}</span>
              </div>
            )}
            {task.manuscript_meta.keywords?.length > 0 && (
              <div className="prvr-analysis-item">
                <span className="prvr-analysis-label">关键词</span>
                <div className="prvr-analysis-tags">
                  {task.manuscript_meta.keywords.map((keyword, idx) => (
                    <span key={idx} className="prvr-analysis-tag">{keyword}</span>
                  ))}
                </div>
              </div>
            )}
            {task.manuscript_meta.claimed_novelty?.length > 0 && (
              <div className="prvr-analysis-item">
                <span className="prvr-analysis-label">创新点</span>
                <ul className="prvr-analysis-list">
                  {task.manuscript_meta.claimed_novelty.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
});

export default TaskDetailSidebar;

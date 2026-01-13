/**
 * 历史任务区域组件
 */
import React, { useState, useRef, useEffect } from 'react';
import { STATUS_MAP } from '../../../utils/peer-review/constants';

function HistorySection({ tasks, loading, totalTasks, currentPage, onPageChange, onSearch, onViewDetail, onDelete }) {
  const pageSize = 10;
  const totalPages = Math.ceil(totalTasks / pageSize);
  const [localSearch, setLocalSearch] = useState('');
  const searchTimeoutRef = useRef(null);

  // 获取推荐意见的显示文本和样式类
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

  // 处理搜索输入（防抖）
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalSearch(value);

    // 清除之前的定时器
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 设置新的定时器，500ms 后触发搜索
    searchTimeoutRef.current = setTimeout(() => {
      onSearch(value);
    }, 500);
  };

  // 清除搜索
  const handleClearSearch = () => {
    setLocalSearch('');
    onSearch('');
  };

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="prv-history-section">
      <div className="prv-section-header">
        <h2 className="prv-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          历史任务
          {totalTasks > 0 && <span className="prv-task-count">({totalTasks})</span>}
        </h2>

        {/* 搜索框 */}
        <div className="prv-search-box">
          <svg className="prv-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="prv-search-input"
            placeholder="搜索标题、文件名..."
            value={localSearch}
            onChange={handleSearchChange}
          />
          {localSearch && (
            <button className="prv-search-clear" onClick={handleClearSearch}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="prv-loading-inline">
          <div className="prv-spinner-small"></div>
          <span>加载中...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="prv-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <p>{localSearch ? `未找到与"${localSearch}"相关的任务` : '暂无历史任务'}</p>
        </div>
      ) : (
        <>
          <div className="prv-task-list-compact">
            {tasks.map(task => {
              const recommendationInfo = getRecommendationInfo(task.final_recommendation);
              return (
                <div key={task.id} className={`prv-task-card prv-task-card-${task.status}`} onClick={() => onViewDetail(task.id)}>
                  {/* 盖章 - 绝对定位浮在卡片上 */}
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
                    {/* 输入类型标签 - 文件显示类型，文字显示文字输入 */}
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
            })}
          </div>

          {totalPages > 1 && (
            <div className="prv-pagination-compact">
              <button
                className="prv-page-btn-small"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                ‹ 上一页
              </button>
              <span className="prv-page-info-small">{currentPage} / {totalPages}</span>
              <button
                className="prv-page-btn-small"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                下一页 ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default HistorySection;

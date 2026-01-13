/**
 * 空状态组件
 * 显示搜索无结果时的提示
 */
import React from 'react';
import { setSearchMode as saveSearchMode } from '../../utils/searchStorage';

const EmptyState = ({ searchState }) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      <h3 className="empty-state-title">未找到相关论文</h3>
      <p className="empty-state-description">
        请尝试使用其他关键词或调整筛选条件
      </p>

      <div className="empty-state-actions">
        <button
          className="empty-state-button primary"
          onClick={() => {
            if (!searchState.isAuthenticated) {
              searchState.setShowAuthModal(true);
              return;
            }
            saveSearchMode('ai');
            searchState.setSearchParams(prev => {
              const newParams = new URLSearchParams(prev);
              newParams.set('mode', 'ai');
              return newParams;
            });
          }}
        >
          使用智能分析
        </button>
      </div>
    </div>
  );
};

export default EmptyState;

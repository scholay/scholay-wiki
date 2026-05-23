/**
 * 空状态组件
 * 显示搜索无结果时的提示
 */
import React from 'react';

const EmptyState = () => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      <h3 className="empty-state-title">未找到相关论文</h3>
    </div>
  );
};

export default EmptyState;

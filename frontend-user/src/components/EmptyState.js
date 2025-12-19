/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * EmptyState - 空状态组件
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import './EmptyState.css';

const EmptyState = memo(({
  icon,
  title,
  description,
  action,
  actionText,
  className = '',
}) => {
  // 默认图标
  const defaultIcon = (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );

  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">
        {icon || defaultIcon}
      </div>
      {title && <h3 className="empty-state-title">{title}</h3>}
      {description && <p className="empty-state-description">{description}</p>}
      {action && actionText && (
        <button className="empty-state-action" onClick={action}>
          {actionText}
        </button>
      )}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  action: PropTypes.func,
  actionText: PropTypes.string,
  className: PropTypes.string,
};

// 预设的空状态变体
export const NoResults = memo(({ query, onClear }) => (
  <EmptyState
    icon={
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    }
    title="未找到结果"
    description={query ? `没有找到与"${query}"相关的内容` : '没有找到相关内容'}
    action={onClear}
    actionText={onClear ? '清除搜索' : undefined}
  />
));

NoResults.displayName = 'NoResults';
NoResults.propTypes = {
  query: PropTypes.string,
  onClear: PropTypes.func,
};

export const NoData = memo(({ title = '暂无数据', description }) => (
  <EmptyState
    icon={
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    }
    title={title}
    description={description}
  />
));

NoData.displayName = 'NoData';
NoData.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
};

export const ErrorState = memo(({ 
  title = '加载失败', 
  description = '请稍后重试',
  onRetry 
}) => (
  <EmptyState
    icon={
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    }
    title={title}
    description={description}
    action={onRetry}
    actionText={onRetry ? '重试' : undefined}
  />
));

ErrorState.displayName = 'ErrorState';
ErrorState.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  onRetry: PropTypes.func,
};

export default EmptyState;


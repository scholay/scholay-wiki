/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Loading - 通用加载组件
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import './Loading.css';

/**
 * Spinner 加载动画
 */
export const Spinner = memo(({ size = 24, color = 'currentColor', className = '' }) => (
  <svg 
    className={`loading-spinner ${className}`}
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none"
  >
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.25"
    />
    <path 
      d="M12 2a10 10 0 0 1 10 10" 
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
));

Spinner.displayName = 'Spinner';
Spinner.propTypes = {
  size: PropTypes.number,
  color: PropTypes.string,
  className: PropTypes.string,
};

/**
 * 加载中文本
 */
export const LoadingText = memo(({ text = '加载中...', className = '' }) => (
  <div className={`loading-text ${className}`}>
    <Spinner size={16} />
    <span>{text}</span>
  </div>
));

LoadingText.displayName = 'LoadingText';
LoadingText.propTypes = {
  text: PropTypes.string,
  className: PropTypes.string,
};

/**
 * 全屏加载覆盖层
 */
export const LoadingOverlay = memo(({ 
  text = '加载中...', 
  visible = true,
  className = '' 
}) => {
  if (!visible) return null;
  
  return (
    <div className={`loading-overlay ${className}`}>
      <div className="loading-overlay-content">
        <Spinner size={40} color="rgb(16, 185, 129)" />
        <p>{text}</p>
      </div>
    </div>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';
LoadingOverlay.propTypes = {
  text: PropTypes.string,
  visible: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * 按钮内加载状态
 */
export const ButtonLoading = memo(({ loading, children, className = '' }) => (
  <span className={`button-loading ${loading ? 'is-loading' : ''} ${className}`}>
    {loading && <Spinner size={14} />}
    <span className={loading ? 'loading-hidden' : ''}>{children}</span>
  </span>
));

ButtonLoading.displayName = 'ButtonLoading';
ButtonLoading.propTypes = {
  loading: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
};

/**
 * 骨架屏行
 */
export const SkeletonLine = memo(({ 
  width = '100%', 
  height = 16, 
  className = '' 
}) => (
  <div 
    className={`skeleton-line ${className}`}
    style={{ width, height }}
  />
));

SkeletonLine.displayName = 'SkeletonLine';
SkeletonLine.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

/**
 * 骨架屏圆形
 */
export const SkeletonCircle = memo(({ size = 40, className = '' }) => (
  <div 
    className={`skeleton-circle ${className}`}
    style={{ width: size, height: size }}
  />
));

SkeletonCircle.displayName = 'SkeletonCircle';
SkeletonCircle.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};

// 默认导出
const Loading = {
  Spinner,
  LoadingText,
  LoadingOverlay,
  ButtonLoading,
  SkeletonLine,
  SkeletonCircle,
};

export default Loading;


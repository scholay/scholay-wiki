/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Skeleton - 通用骨架屏组件
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import './Skeleton.css';

/**
 * 基础骨架屏
 */
export const Skeleton = memo(({
  width = '100%',
  height = 16,
  borderRadius = 4,
  className = '',
  style = {},
  variant = 'rectangular', // rectangular, circular, text
  animation = 'shimmer', // shimmer, pulse, none
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'circular':
        return { borderRadius: '50%' };
      case 'text':
        return { borderRadius: 4, height: '1em' };
      default:
        return { borderRadius };
    }
  };

  return (
    <div
      className={`skeleton skeleton-${animation} ${className}`}
      style={{
        width,
        height,
        ...getVariantStyle(),
        ...style,
      }}
    />
  );
});

Skeleton.displayName = 'Skeleton';
Skeleton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  borderRadius: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  style: PropTypes.object,
  variant: PropTypes.oneOf(['rectangular', 'circular', 'text']),
  animation: PropTypes.oneOf(['shimmer', 'pulse', 'none']),
};

/**
 * 文本骨架屏
 */
export const SkeletonText = memo(({
  lines = 3,
  lastLineWidth = '60%',
  spacing = 8,
  className = '',
}) => (
  <div className={`skeleton-text-group ${className}`}>
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton
        key={index}
        width={index === lines - 1 ? lastLineWidth : '100%'}
        height={16}
        variant="text"
        style={{ marginBottom: index < lines - 1 ? spacing : 0 }}
      />
    ))}
  </div>
));

SkeletonText.displayName = 'SkeletonText';
SkeletonText.propTypes = {
  lines: PropTypes.number,
  lastLineWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  spacing: PropTypes.number,
  className: PropTypes.string,
};

/**
 * 头像骨架屏
 */
export const SkeletonAvatar = memo(({
  size = 40,
  className = '',
}) => (
  <Skeleton
    width={size}
    height={size}
    variant="circular"
    className={className}
  />
));

SkeletonAvatar.displayName = 'SkeletonAvatar';
SkeletonAvatar.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};

/**
 * 图片骨架屏
 */
export const SkeletonImage = memo(({
  width = '100%',
  height = 200,
  className = '',
}) => (
  <Skeleton
    width={width}
    height={height}
    borderRadius={8}
    className={className}
  />
));

SkeletonImage.displayName = 'SkeletonImage';
SkeletonImage.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

/**
 * 按钮骨架屏
 */
export const SkeletonButton = memo(({
  width = 100,
  height = 36,
  className = '',
}) => (
  <Skeleton
    width={width}
    height={height}
    borderRadius={8}
    className={className}
  />
));

SkeletonButton.displayName = 'SkeletonButton';
SkeletonButton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.number,
  className: PropTypes.string,
};

/**
 * 卡片骨架屏
 */
export const SkeletonCard = memo(({
  hasImage = true,
  imageHeight = 160,
  lines = 3,
  className = '',
}) => (
  <div className={`skeleton-card ${className}`}>
    {hasImage && <SkeletonImage height={imageHeight} />}
    <div className="skeleton-card-content">
      <Skeleton width="70%" height={20} style={{ marginBottom: 12 }} />
      <SkeletonText lines={lines} />
    </div>
  </div>
));

SkeletonCard.displayName = 'SkeletonCard';
SkeletonCard.propTypes = {
  hasImage: PropTypes.bool,
  imageHeight: PropTypes.number,
  lines: PropTypes.number,
  className: PropTypes.string,
};

/**
 * 列表项骨架屏
 */
export const SkeletonListItem = memo(({
  hasAvatar = true,
  avatarSize = 40,
  lines = 2,
  className = '',
}) => (
  <div className={`skeleton-list-item ${className}`}>
    {hasAvatar && <SkeletonAvatar size={avatarSize} />}
    <div className="skeleton-list-item-content">
      <SkeletonText lines={lines} />
    </div>
  </div>
));

SkeletonListItem.displayName = 'SkeletonListItem';
SkeletonListItem.propTypes = {
  hasAvatar: PropTypes.bool,
  avatarSize: PropTypes.number,
  lines: PropTypes.number,
  className: PropTypes.string,
};

/**
 * 论文项骨架屏
 */
export const SkeletonPaperItem = memo(({ className = '' }) => (
  <div className={`skeleton-paper-item ${className}`}>
    <div className="skeleton-paper-number">
      <Skeleton width={24} height={24} variant="circular" />
    </div>
    <div className="skeleton-paper-content">
      <Skeleton width="85%" height={22} style={{ marginBottom: 12 }} />
      <div className="skeleton-paper-authors">
        <Skeleton width={80} height={24} borderRadius={12} style={{ marginRight: 8 }} />
        <Skeleton width={80} height={24} borderRadius={12} style={{ marginRight: 8 }} />
        <Skeleton width={80} height={24} borderRadius={12} />
      </div>
      <Skeleton width="40%" height={16} style={{ marginTop: 8, marginBottom: 12 }} />
      <SkeletonText lines={2} />
      <div className="skeleton-paper-meta" style={{ marginTop: 12 }}>
        <Skeleton width={60} height={20} borderRadius={4} style={{ marginRight: 12 }} />
        <Skeleton width={40} height={20} borderRadius={4} style={{ marginRight: 12 }} />
        <Skeleton width={50} height={20} borderRadius={4} />
      </div>
    </div>
  </div>
));

SkeletonPaperItem.displayName = 'SkeletonPaperItem';
SkeletonPaperItem.propTypes = {
  className: PropTypes.string,
};

/**
 * 论文列表骨架屏
 */
export const SkeletonPaperList = memo(({ count = 5, className = '' }) => (
  <div className={`skeleton-paper-list ${className}`}>
    {Array.from({ length: count }).map((_, index) => (
      <SkeletonPaperItem key={index} />
    ))}
  </div>
));

SkeletonPaperList.displayName = 'SkeletonPaperList';
SkeletonPaperList.propTypes = {
  count: PropTypes.number,
  className: PropTypes.string,
};

export default Skeleton;


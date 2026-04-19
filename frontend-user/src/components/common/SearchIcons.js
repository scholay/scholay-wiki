/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';

/**
 * 学术检索图标 - 极简扁平化设计（纯白色填充）
 * 设计理念：圆形放大镜，简洁清晰
 */
export const NormalSearchIcon = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 放大镜圆圈 - 填充 */}
    <circle cx="10.5" cy="10.5" r="6" fill="currentColor" opacity="0.2"/>
    <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2"/>

    {/* 放大镜手柄 - 粗线条 */}
    <path
      d="M15 15L20 20"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * 智能分析图标 - 极简扁平化设计（纯白色填充）
 * 设计理念：魔法棒/星形，表示智能AI分析
 */
export const AdvancedSearchIcon = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 魔法棒手柄 */}
    <rect
      x="2"
      y="16"
      width="10"
      height="2.5"
      rx="1.25"
      transform="rotate(-45 7 17)"
      fill="currentColor"
    />

    {/* 星形装饰 */}
    <path
      d="M18 2L19.5 6.5L24 8L19.5 9.5L18 14L16.5 9.5L12 8L16.5 6.5L18 2Z"
      fill="currentColor"
    />

    {/* 小星星装饰1 */}
    <path
      d="M8 3L8.75 5L11 5.75L8.75 6.5L8 9L7.25 6.5L5 5.75L7.25 5L8 3Z"
      fill="currentColor"
      opacity="0.6"
    />

    {/* 小星星装饰2 */}
    <path
      d="M14 13L14.5 14.5L16 15L14.5 15.5L14 17L13.5 15.5L12 15L13.5 14.5L14 13Z"
      fill="currentColor"
      opacity="0.6"
    />
  </svg>
);

/**
 * 学术检索图标 - 备选方案1（文档+放大镜，扁平填充）
 */
export const NormalSearchIconAlt1 = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 文档形状 */}
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L18 6V16C18 17.1046 17.1046 18 16 18H13"
      fill="currentColor"
      opacity="0.25"
    />
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L18 6V16C18 17.1046 17.1046 18 16 18H13"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />

    {/* 放大镜 */}
    <circle cx="10" cy="15" r="4.5" fill="currentColor" opacity="0.2"/>
    <circle cx="10" cy="15" r="4.5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M13 18L16.5 21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/**
 * 智能分析图标 - 备选方案1（闪电+放大镜，表示快速智能分析）
 */
export const AdvancedSearchIconAlt1 = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 放大镜圆圈 */}
    <circle cx="10.5" cy="10.5" r="6" fill="currentColor" opacity="0.15"/>
    <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>

    {/* 闪电符号（在圆内） */}
    <path
      d="M11.5 6L8.5 11H10.5L9.5 15L12.5 10H10.5L11.5 6Z"
      fill="currentColor"
    />

    {/* 放大镜手柄 */}
    <path d="M15 15L20 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

/**
 * 学术检索图标 - 备选方案2（圆角方形+放大镜）
 */
export const NormalSearchIconAlt2 = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 圆角方形框 */}
    <rect x="3" y="3" width="13" height="13" rx="3" fill="currentColor" opacity="0.2"/>
    <rect x="3" y="3" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2" fill="none"/>

    {/* 内部横线装饰 */}
    <line x1="6" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>

    {/* 放大镜手柄 */}
    <path d="M15 15L21 21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

/**
 * 智能分析图标 - 备选方案2（六边形+星星，科技感）
 */
export const AdvancedSearchIconAlt2 = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 六边形外框 */}
    <path
      d="M12 2L20 7V17L12 22L4 17V7L12 2Z"
      fill="currentColor"
      opacity="0.15"
    />
    <path
      d="M12 2L20 7V17L12 22L4 17V7L12 2Z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />

    {/* 中心星星 */}
    <path
      d="M12 8L13 11L16 11.5L13.5 13.5L14 16.5L12 15L10 16.5L10.5 13.5L8 11.5L11 11L12 8Z"
      fill="currentColor"
    />
  </svg>
);

const SearchIcons = {
  NormalSearchIcon,
  AdvancedSearchIcon,
  NormalSearchIconAlt1,
  AdvancedSearchIconAlt1,
  NormalSearchIconAlt2,
  AdvancedSearchIconAlt2
};

export default SearchIcons;

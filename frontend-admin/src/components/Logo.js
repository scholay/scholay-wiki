/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Logo 组件 - 管理后台 Logo
 */

import React from 'react';

/**
 * Logo 组件
 * @param {number} size - Logo 尺寸（宽度，高度会按比例自动计算）
 * @param {string} className - 额外的 CSS 类名
 * @param {object} style - 额外的内联样式
 * @param {string} variant - 变体: 'default' (黑色描边) 或 'white' (白色描边)
 */
const Logo = ({ size = 32, className = '', style = {}, variant = 'default', ...props }) => {
  // 根据宽度计算高度，保持原始比例 (771:900 ≈ 0.857)
  const width = size;
  const height = Math.round(size * (900 / 771));
  
  const strokeColor = variant === 'white' ? 'white' : 'black';
  
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 771 900" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...props}
    >
      <path 
        d="M729.812 648.5H42.1885L386 53L729.812 648.5Z" 
        stroke={strokeColor} 
        strokeWidth="53"
      />
      <path 
        d="M729.812 251.5H42.1885L386 847L729.812 251.5Z" 
        stroke={strokeColor} 
        strokeWidth="53"
      />
    </svg>
  );
};

/**
 * LogoWithBackground 组件 - 带背景的 Logo（用于登录页等）
 * @param {number} size - 整体尺寸
 * @param {string} bgColor - 背景颜色
 * @param {number} borderRadius - 圆角大小
 */
export const LogoWithBackground = ({ 
  size = 48, 
  bgColor = '#2563eb', 
  borderRadius = 12,
  className = '',
  style = {}
}) => {
  const logoSize = Math.round(size * 0.6); // Logo 占背景的 60%
  
  return (
    <div 
      className={className}
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
        borderRadius: borderRadius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      <Logo size={logoSize} variant="white" />
    </div>
  );
};

export default Logo;


/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Logo 组件 - 根据主题自动切换日间/夜间模式的 Logo
 */

import React from 'react';
import { useTheme } from '../stores/theme.store';

/**
 * Logo 组件
 * @param {number} size - Logo 尺寸（宽度，高度会按比例自动计算）
 * @param {string} className - 额外的 CSS 类名
 * @param {object} style - 额外的内联样式
 */
const Logo = ({ size = 32, className = '', style = {}, ...props }) => {
  const { isDark } = useTheme();
  
  // 根据宽度计算高度，保持原始比例 (771:900 ≈ 0.857)
  const width = size;
  const height = Math.round(size * (900 / 771));
  
  const strokeColor = isDark ? 'white' : 'black';
  
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
 * LogoWithText 组件 - Logo + 文字
 * @param {number} logoSize - Logo 尺寸
 * @param {string} text - 显示的文字，默认为 "Scholay"
 * @param {string} className - 容器的 CSS 类名
 * @param {string} textClassName - 文字的 CSS 类名
 */
export const LogoWithText = ({ 
  logoSize = 32, 
  text = 'Scholay', 
  className = '', 
  textClassName = '',
  onClick,
  style = {}
}) => {
  return (
    <div 
      className={className} 
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      <Logo size={logoSize} />
      {text && <span className={textClassName}>{text}</span>}
    </div>
  );
};

export default Logo;


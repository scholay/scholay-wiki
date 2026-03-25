/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Logo 组件 - 统一的 Logo，支持 user / admin 变体
 */

import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Logo 组件
 * @param {number} size - Logo 尺寸（宽度，高度会按比例自动计算）
 * @param {string} className - 额外的 CSS 类名
 * @param {object} style - 额外的内联样式
 * @param {'user'|'admin'} variant - 变体: 'user' (跟随主题) 或 'admin' (手动控制颜色)
 * @param {string} strokeOverride - 手动指定描边颜色（仅 variant='admin' 时生效）
 */
const Logo = ({ size = 32, className = '', style = {}, variant = 'user', strokeOverride, ...props }) => {
  const { isDark } = useTheme();
  
  const width = size;
  const height = Math.round(size * (900 / 771));
  
  let strokeColor;
  if (variant === 'admin' && strokeOverride) {
    strokeColor = strokeOverride;
  } else {
    strokeColor = isDark ? 'white' : 'black';
  }
  
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
  const logoSize = Math.round(size * 0.6);
  
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
      <Logo size={logoSize} variant="admin" strokeOverride="white" />
    </div>
  );
};

export default Logo;

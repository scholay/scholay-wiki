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

import type { CSSProperties, SVGProps } from 'react';

export type LogoVariant = 'default' | 'white';

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'style' | 'className'> {
  size?: number;
  className?: string;
  style?: CSSProperties;
  variant?: LogoVariant;
}

const Logo = ({
  size = 32,
  className = '',
  style = {},
  variant = 'default',
  ...props
}: LogoProps) => {
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

export interface LogoWithBackgroundProps {
  size?: number;
  bgColor?: string;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
}

export const LogoWithBackground = ({
  size = 48,
  bgColor = '#2563eb',
  borderRadius = 12,
  className = '',
  style = {},
}: LogoWithBackgroundProps) => {
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


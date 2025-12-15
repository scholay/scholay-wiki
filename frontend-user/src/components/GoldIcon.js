import React from 'react';
import goldSmall from '../assets/images/gold-56.png';
import goldLarge from '../assets/images/gold-256.png';
import './styles/GoldIcon.css';

/**
 * 经费图标组件
 * @param {string} size - 尺寸: 'xs' (12px), 'sm' (16px), 'md' (20px), 'lg' (24px), 'xl' (32px), 'xxl' (48px)
 * @param {string} className - 额外的CSS类名
 */
const GoldIcon = ({ size = 'md', className = '' }) => {
  const sizeMap = {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
    xxl: 48
  };

  const pixelSize = sizeMap[size] || sizeMap.md;
  // 使用小图片（56px）用于小尺寸，大图片（256px）用于大尺寸
  const imageSrc = pixelSize <= 32 ? goldSmall : goldLarge;

  return (
    <img 
      src={imageSrc} 
      alt="经费" 
      className={`gold-icon gold-icon-${size} ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    />
  );
};

export default GoldIcon;


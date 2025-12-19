/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LazyImage - 懒加载图片组件
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import PropTypes from 'prop-types';

const LazyImage = memo(({
  src,
  alt = '',
  placeholder,
  className = '',
  style = {},
  onLoad,
  onError,
  threshold = 0.1,
  rootMargin = '50px',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  const handleLoad = (e) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    setHasError(true);
    onError?.(e);
  };

  const containerStyle = {
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  const imgStyle = {
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  const placeholderStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--background-secondary, #1a1a1a)',
    opacity: isLoaded ? 0 : 1,
    transition: 'opacity 0.3s ease',
  };

  return (
    <div ref={imgRef} className={`lazy-image ${className}`} style={containerStyle}>
      {/* 占位符 */}
      <div style={placeholderStyle}>
        {placeholder || (
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
            style={{ color: 'var(--text-tertiary, #6b7280)' }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
      </div>

      {/* 实际图片 - 只在进入视口后加载 */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          style={imgStyle}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}

      {/* 错误状态 */}
      {hasError && (
        <div style={{ ...placeholderStyle, opacity: 1 }}>
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
            style={{ color: 'var(--text-tertiary, #6b7280)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

LazyImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string,
  placeholder: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  threshold: PropTypes.number,
  rootMargin: PropTypes.string,
};

export default LazyImage;


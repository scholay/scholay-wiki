/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useIntersectionObserver - 交叉观察器 Hook
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 交叉观察器 Hook
 * @param {Object} options - 配置选项
 * @param {number} options.threshold - 阈值
 * @param {string} options.rootMargin - 根边距
 * @param {boolean} options.triggerOnce - 是否只触发一次
 * @param {Function} options.onIntersect - 进入视口回调
 * @param {Function} options.onLeave - 离开视口回调
 */
const useIntersectionObserver = (options = {}) => {
  const {
    threshold = 0,
    rootMargin = '0px',
    triggerOnce = false,
    onIntersect,
    onLeave,
  } = options;

  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const targetRef = useRef(null);
  const observerRef = useRef(null);

  const handleIntersect = useCallback((entries) => {
    entries.forEach(entry => {
      const isVisible = entry.isIntersecting;
      
      if (isVisible) {
        setIsIntersecting(true);
        setHasIntersected(true);
        onIntersect?.(entry);
        
        if (triggerOnce && observerRef.current) {
          observerRef.current.disconnect();
        }
      } else {
        setIsIntersecting(false);
        onLeave?.(entry);
      }
    });
  }, [triggerOnce, onIntersect, onLeave]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    observerRef.current = new IntersectionObserver(handleIntersect, {
      threshold,
      rootMargin,
    });

    observerRef.current.observe(target);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, handleIntersect]);

  // 手动触发观察
  const observe = useCallback((element) => {
    if (observerRef.current && element) {
      observerRef.current.observe(element);
    }
  }, []);

  // 停止观察
  const unobserve = useCallback((element) => {
    if (observerRef.current && element) {
      observerRef.current.unobserve(element);
    }
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
  }, []);

  return {
    ref: targetRef,
    isIntersecting,
    hasIntersected,
    observe,
    unobserve,
    disconnect,
  };
};

export default useIntersectionObserver;


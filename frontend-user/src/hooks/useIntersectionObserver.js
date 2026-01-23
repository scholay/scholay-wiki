/**
 * Intersection Observer Hook
 * 检测元素是否在可视区域内
 */
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 使用 Intersection Observer 检测元素可见性
 * @param {Object} options - Observer 配置
 * @param {string} options.root - 根元素选择器
 * @param {string} options.rootMargin - 根元素边距
 * @param {number} options.threshold - 可见阈值
 * @returns {[React.RefObject, boolean]} - [ref, isVisible]
 */
export const useIntersectionObserver = (options = {}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef(null);
  const observerRef = useRef(null);

  const { root = null, rootMargin = '100px 0px', threshold = 0.1 } = options;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // 创建 observer
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: root ? document.querySelector(root) : null,
        rootMargin,
        threshold,
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [root, rootMargin, threshold]);

  return [elementRef, isVisible];
};

/**
 * 使用 Intersection Observer 触发一次性回调
 * @param {Function} callback - 进入可视区域时的回调
 * @param {Object} options - Observer 配置
 * @returns {React.RefObject} - ref
 */
export const useVisibilityTrigger = (callback, options = {}) => {
  const elementRef = useRef(null);
  const hasTriggeredRef = useRef(false);
  const callbackRef = useRef(callback);

  // 更新 callback ref
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const { root = null, rootMargin = '50px 0px', threshold = 0.1, enabled = true } = options;

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          callbackRef.current?.();
        }
      },
      {
        root: root ? document.querySelector(root) : null,
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [root, rootMargin, threshold, enabled]);

  // 重置触发状态的方法
  const reset = useCallback(() => {
    hasTriggeredRef.current = false;
  }, []);

  return { ref: elementRef, reset };
};

export default useIntersectionObserver;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * performance - 性能监控工具
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 性能计时器
 */
class PerformanceTimer {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.marks = [];
  }

  start() {
    this.startTime = performance.now();
    this.marks = [];
    return this;
  }

  mark(label) {
    if (this.startTime) {
      this.marks.push({
        label,
        time: performance.now() - this.startTime,
      });
    }
    return this;
  }

  end() {
    if (!this.startTime) return null;
    
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    
    this.startTime = null;
    return duration;
  }
}

/**
 * 创建性能计时器
 * @param {string} name - 计时器名称
 * @returns {PerformanceTimer}
 */
export const createTimer = (name) => new PerformanceTimer(name);

/**
 * 测量函数执行时间
 * @param {Function} fn - 要测量的函数
 * @param {string} name - 函数名称
 * @returns {Function} 包装后的函数
 */
export const measureTime = (fn, name) => {
  return async (...args) => {
    const timer = createTimer(name || fn.name || 'anonymous');
    timer.start();
    try {
      const result = await fn(...args);
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  };
};

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
export const debounce = (fn, delay = 300) => {
  let timeoutId = null;
  
  const debounced = (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
  
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
};

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 时间间隔（毫秒）
 * @returns {Function}
 */
export const throttle = (fn, limit = 100) => {
  let inThrottle = false;
  let lastArgs = null;
  
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
};

/**
 * 请求空闲回调
 * @param {Function} callback - 回调函数
 * @param {Object} options - 配置选项
 * @returns {number} 回调 ID
 */
export const requestIdleCallback = (callback, options = {}) => {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, options);
  }
  // 降级处理
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 50,
    });
  }, 1);
};

/**
 * 取消空闲回调
 * @param {number} id - 回调 ID
 */
export const cancelIdleCallback = (id) => {
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

/**
 * 批量更新 DOM
 * @param {Function[]} updates - 更新函数数组
 */
export const batchDOMUpdates = (updates) => {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};

/**
 * 检测是否在视口内
 * @param {Element} element - DOM 元素
 * @param {number} threshold - 阈值（0-1）
 * @returns {boolean}
 */
export const isInViewport = (element, threshold = 0) => {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  
  const vertInView = (rect.top <= windowHeight * (1 - threshold)) && 
                     ((rect.top + rect.height) >= windowHeight * threshold);
  const horInView = (rect.left <= windowWidth * (1 - threshold)) && 
                    ((rect.left + rect.width) >= windowWidth * threshold);
  
  return vertInView && horInView;
};

/**
 * 创建 Intersection Observer
 * @param {Function} callback - 回调函数
 * @param {Object} options - 配置选项
 * @returns {IntersectionObserver}
 */
export const createIntersectionObserver = (callback, options = {}) => {
  const defaultOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0,
    ...options,
  };
  
  return new IntersectionObserver(callback, defaultOptions);
};

/**
 * 内存使用情况（仅在支持的浏览器中可用）
 * @returns {Object|null}
 */
export const getMemoryUsage = () => {
  if (performance.memory) {
    return {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      usedPercentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit * 100).toFixed(2) + '%',
    };
  }
  return null;
};

/**
 * 获取性能指标
 * @returns {Object}
 */
export const getPerformanceMetrics = () => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  
  const metrics = {};
  
  if (navigation) {
    metrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.startTime;
    metrics.load = navigation.loadEventEnd - navigation.startTime;
    metrics.ttfb = navigation.responseStart - navigation.requestStart;
  }
  
  paint.forEach(entry => {
    if (entry.name === 'first-paint') {
      metrics.firstPaint = entry.startTime;
    }
    if (entry.name === 'first-contentful-paint') {
      metrics.firstContentfulPaint = entry.startTime;
    }
  });
  
  return metrics;
};

/**
 * 在开发环境打印性能报告
 */
export const logPerformanceReport = () => {
  if (!isDevelopment) return;
  
  const metrics = getPerformanceMetrics();
  const memory = getMemoryUsage();
  
  // Metrics and memory data available via getPerformanceMetrics() and getMemoryUsage()
};


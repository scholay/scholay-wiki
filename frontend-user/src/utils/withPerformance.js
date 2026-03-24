/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * withPerformance - 性能优化高阶组件
 */

import React, { memo, useEffect, useRef } from 'react';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 包装组件并添加渲染计数日志（仅开发环境）
 * @param {React.Component} WrappedComponent - 要包装的组件
 * @param {string} componentName - 组件名称
 */
export const withRenderCount = (WrappedComponent, componentName) => {
  if (!isDevelopment) {
    return WrappedComponent;
  }

  const WithRenderCount = (props) => {
    const renderCount = useRef(0);
    
    useEffect(() => {
      renderCount.current += 1;
    });

    return <WrappedComponent {...props} />;
  };

  WithRenderCount.displayName = `WithRenderCount(${componentName})`;
  return WithRenderCount;
};

/**
 * 包装组件并添加渲染时间日志（仅开发环境）
 * @param {React.Component} WrappedComponent - 要包装的组件
 * @param {string} componentName - 组件名称
 */
export const withRenderTime = (WrappedComponent, componentName) => {
  if (!isDevelopment) {
    return WrappedComponent;
  }

  const WithRenderTime = (props) => {
    const startTime = performance.now();
    
    useEffect(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      if (duration > 16) { // 超过一帧 (16ms)
        console.warn(`[Slow Render] ${componentName}: ${duration.toFixed(2)}ms`);
      }
    });

    return <WrappedComponent {...props} />;
  };

  WithRenderTime.displayName = `WithRenderTime(${componentName})`;
  return WithRenderTime;
};

/**
 * 自动添加 React.memo 并使用浅比较
 * @param {React.Component} WrappedComponent - 要包装的组件
 * @param {Function} areEqual - 自定义比较函数
 */
export const withMemo = (WrappedComponent, areEqual) => {
  const MemoizedComponent = memo(WrappedComponent, areEqual);
  MemoizedComponent.displayName = `Memo(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return MemoizedComponent;
};

/**
 * 创建一个带有性能监控的组件
 * @param {React.Component} WrappedComponent - 要包装的组件
 * @param {Object} options - 配置选项
 * @param {string} options.name - 组件名称
 * @param {boolean} options.logRenderCount - 是否记录渲染次数
 * @param {boolean} options.logRenderTime - 是否记录渲染时间
 * @param {boolean} options.useMemo - 是否使用 memo
 * @param {Function} options.areEqual - 自定义比较函数
 */
export const withPerformance = (WrappedComponent, options = {}) => {
  const {
    name = WrappedComponent.displayName || WrappedComponent.name || 'Component',
    logRenderCount = false,
    logRenderTime = false,
    useMemo = true,
    areEqual,
  } = options;

  let Component = WrappedComponent;

  if (useMemo) {
    Component = withMemo(Component, areEqual);
  }

  if (isDevelopment && logRenderCount) {
    Component = withRenderCount(Component, name);
  }

  if (isDevelopment && logRenderTime) {
    Component = withRenderTime(Component, name);
  }

  return Component;
};

/**
 * 用于检测不必要的重渲染
 * @param {Object} prevProps - 前一个 props
 * @param {Object} nextProps - 下一个 props
 * @param {string} componentName - 组件名称
 */
export const logPropsChanges = (prevProps, nextProps, componentName) => {
  if (!isDevelopment) return;

  const changedProps = {};
  const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);

  allKeys.forEach(key => {
    if (prevProps[key] !== nextProps[key]) {
      changedProps[key] = {
        from: prevProps[key],
        to: nextProps[key],
      };
    }
  });

  if (Object.keys(changedProps).length > 0) {
    // Props changes detected - available in changedProps for debugging tools
  }
};

export default withPerformance;


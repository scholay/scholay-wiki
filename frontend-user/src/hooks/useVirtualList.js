/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useVirtualList - 虚拟列表 Hook
 * 用于优化大量数据的渲染性能
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * 虚拟列表 Hook
 * @param {Object} options - 配置选项
 * @param {Array} options.items - 数据数组
 * @param {number} options.itemHeight - 每项高度（固定高度模式）
 * @param {Function} options.getItemHeight - 获取每项高度的函数（动态高度模式）
 * @param {number} options.overscan - 上下额外渲染的项数
 * @param {number} options.containerHeight - 容器高度（可选，不传则自动检测）
 */
const useVirtualList = (options) => {
  const {
    items = [],
    itemHeight = 50,
    getItemHeight,
    overscan = 5,
    containerHeight: propContainerHeight,
  } = options;

  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(propContainerHeight || 0);

  // 监听容器大小变化
  useEffect(() => {
    if (propContainerHeight) {
      setContainerHeight(propContainerHeight);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [propContainerHeight]);

  // 处理滚动事件
  const handleScroll = useCallback((e) => {
    const target = e.target;
    setScrollTop(target.scrollTop);
  }, []);

  // 计算每项的偏移量（支持动态高度）
  const itemOffsets = useMemo(() => {
    const offsets = [0];
    let totalHeight = 0;

    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight ? getItemHeight(items[i], i) : itemHeight;
      totalHeight += height;
      offsets.push(totalHeight);
    }

    return offsets;
  }, [items, itemHeight, getItemHeight]);

  // 总高度
  const totalHeight = itemOffsets[items.length] || 0;

  // 计算可见范围
  const visibleRange = useMemo(() => {
    if (containerHeight === 0) {
      return { start: 0, end: Math.min(overscan * 2, items.length) };
    }

    // 二分查找起始索引
    let start = 0;
    let end = items.length;
    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (itemOffsets[mid] < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }
    start = Math.max(0, start - 1 - overscan);

    // 查找结束索引
    end = start;
    while (end < items.length && itemOffsets[end] < scrollTop + containerHeight) {
      end++;
    }
    end = Math.min(items.length, end + overscan);

    return { start, end };
  }, [scrollTop, containerHeight, itemOffsets, items.length, overscan]);

  // 可见项
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end).map((item, index) => ({
      item,
      index: visibleRange.start + index,
      style: {
        position: 'absolute',
        top: itemOffsets[visibleRange.start + index],
        left: 0,
        width: '100%',
        height: getItemHeight 
          ? getItemHeight(item, visibleRange.start + index)
          : itemHeight,
      },
    }));
  }, [items, visibleRange, itemOffsets, itemHeight, getItemHeight]);

  // 滚动到指定索引
  const scrollToIndex = useCallback((index, behavior = 'auto') => {
    const container = containerRef.current;
    if (!container || index < 0 || index >= items.length) return;

    const offset = itemOffsets[index];
    container.scrollTo({
      top: offset,
      behavior,
    });
  }, [itemOffsets, items.length]);

  // 滚动到顶部
  const scrollToTop = useCallback((behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: 0,
      behavior,
    });
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: totalHeight,
      behavior,
    });
  }, [totalHeight]);

  // 容器样式
  const containerStyle = useMemo(() => ({
    overflow: 'auto',
    position: 'relative',
  }), []);

  // 内容样式
  const contentStyle = useMemo(() => ({
    height: totalHeight,
    position: 'relative',
  }), [totalHeight]);

  return {
    // Refs
    containerRef,
    
    // 状态
    scrollTop,
    containerHeight,
    totalHeight,
    visibleRange,
    visibleItems,
    
    // 方法
    handleScroll,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    
    // 样式
    containerStyle,
    contentStyle,
  };
};

export default useVirtualList;


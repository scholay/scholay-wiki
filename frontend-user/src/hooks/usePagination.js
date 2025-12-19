/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * usePagination - 通用分页 Hook
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * 分页 Hook
 * @param {Object} options - 配置选项
 * @param {number} options.initialPage - 初始页码，默认 1
 * @param {number} options.initialPageSize - 初始每页数量，默认 20
 * @param {number} options.total - 总数量
 * @param {Function} options.onPageChange - 页码变化回调
 * @param {Function} options.onPageSizeChange - 每页数量变化回调
 * @param {string} options.storageKey - localStorage 存储键（可选）
 */
const usePagination = ({
  initialPage = 1,
  initialPageSize = 20,
  total = 0,
  onPageChange,
  onPageSizeChange,
  storageKey,
} = {}) => {
  // 从 localStorage 读取初始值
  const getInitialPageSize = () => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    return initialPageSize;
  };

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(getInitialPageSize);

  // 计算总页数
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  // 页码变化处理
  const handlePageChange = useCallback((newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    onPageChange?.(newPage);
  }, [totalPages, onPageChange]);

  // 每页数量变化处理
  const handlePageSizeChange = useCallback((newSize) => {
    if (newSize < 1) return;
    
    // 保存到 localStorage
    if (storageKey) {
      localStorage.setItem(storageKey, String(newSize));
    }
    
    setPageSize(newSize);
    setPage(1); // 重置到第一页
    onPageSizeChange?.(newSize);
  }, [storageKey, onPageSizeChange]);

  // 重置分页
  const reset = useCallback(() => {
    setPage(initialPage);
  }, [initialPage]);

  // 跳转到第一页
  const goToFirst = useCallback(() => {
    handlePageChange(1);
  }, [handlePageChange]);

  // 跳转到最后一页
  const goToLast = useCallback(() => {
    handlePageChange(totalPages);
  }, [handlePageChange, totalPages]);

  // 上一页
  const goToPrev = useCallback(() => {
    handlePageChange(page - 1);
  }, [handlePageChange, page]);

  // 下一页
  const goToNext = useCallback(() => {
    handlePageChange(page + 1);
  }, [handlePageChange, page]);

  // 计算当前页的起始和结束索引
  const { startIndex, endIndex } = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return { startIndex: start, endIndex: end };
  }, [page, pageSize, total]);

  return {
    // 状态
    page,
    pageSize,
    totalPages,
    total,
    startIndex,
    endIndex,
    
    // 派生状态
    hasNext: page < totalPages,
    hasPrev: page > 1,
    isFirst: page === 1,
    isLast: page === totalPages,
    
    // 方法
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
    reset,
    goToFirst,
    goToLast,
    goToPrev,
    goToNext,
  };
};

export default usePagination;


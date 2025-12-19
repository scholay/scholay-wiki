/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Pagination - 通用分页组件
 */

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import './Pagination.css';

const Pagination = ({
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [20, 50, 100, 200],
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
  maxVisiblePages = 5,
}) => {
  // 计算要显示的页码
  const visiblePages = useMemo(() => {
    const pages = [];
    const halfVisible = Math.floor(maxVisiblePages / 2);
    
    let startPage, endPage;
    
    if (totalPages <= maxVisiblePages) {
      startPage = 1;
      endPage = totalPages;
    } else if (currentPage <= halfVisible + 1) {
      startPage = 1;
      endPage = maxVisiblePages;
    } else if (currentPage >= totalPages - halfVisible) {
      startPage = totalPages - maxVisiblePages + 1;
      endPage = totalPages;
    } else {
      startPage = currentPage - halfVisible;
      endPage = currentPage + halfVisible;
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }, [currentPage, totalPages, maxVisiblePages]);

  if (totalPages <= 1 && !showPageSize) {
    return null;
  }

  return (
    <div className="pagination">
      {/* 每页数量选择器 */}
      {showPageSize && onPageSizeChange && (
        <div className="page-size-selector">
          <span className="page-size-label">每页</span>
          <select
            className="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span className="page-size-label">条</span>
        </div>
      )}

      {totalPages > 1 && (
        <>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            上一页
          </button>

          <div className="pagination-pages">
            {visiblePages.map(pageNum => (
              <button
                key={pageNum}
                className={`pagination-page ${currentPage === pageNum ? 'active' : ''}`}
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页
          </button>
        </>
      )}
    </div>
  );
};

Pagination.propTypes = {
  currentPage: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  pageSize: PropTypes.number,
  pageSizeOptions: PropTypes.arrayOf(PropTypes.number),
  onPageChange: PropTypes.func.isRequired,
  onPageSizeChange: PropTypes.func,
  showPageSize: PropTypes.bool,
  maxVisiblePages: PropTypes.number,
};

Pagination.defaultProps = {
  pageSizeOptions: [20, 50, 100, 200],
  showPageSize: true,
  maxVisiblePages: 5,
};

export default React.memo(Pagination);


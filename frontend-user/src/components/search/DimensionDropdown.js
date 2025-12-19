/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * DimensionDropdown - AI 分析维度选择下拉框组件
 * 从 SearchResultsPage.js 提取
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * DimensionDropdown 组件
 */
const DimensionDropdown = memo(({
  dimensions,
  selectedDimensions,
  onToggleDimension,
  onSelectAll,
  onClearAll,
}) => {
  const allSelected = dimensions.length > 0 && selectedDimensions.length === dimensions.length;

  return (
    <div className="dimension-dropdown">
      <div className="dimension-dropdown-header">
        <span className="dimension-dropdown-title">选择分析维度</span>
        <div className="dimension-dropdown-actions">
          <button 
            className="dimension-action-btn"
            onClick={allSelected ? onClearAll : onSelectAll}
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
        </div>
      </div>
      <div className="dimension-list">
        {dimensions.map((dim) => {
          const isSelected = selectedDimensions.includes(dim.key);
          return (
            <button
              key={dim.key}
              className={`dimension-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggleDimension(dim.key)}
            >
              <div className="dimension-item-checkbox">
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div className="dimension-item-content">
                <span className="dimension-item-name">{dim.name}</span>
                <span className="dimension-item-desc">{dim.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

DimensionDropdown.displayName = 'DimensionDropdown';

DimensionDropdown.propTypes = {
  dimensions: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
  })).isRequired,
  selectedDimensions: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggleDimension: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
};

export default DimensionDropdown;

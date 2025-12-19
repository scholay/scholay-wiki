/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * DimensionSelector - AI 分析维度选择器组件
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Sparkles, X, Check, Plus, Trash2 } from 'lucide-react';

const DimensionSelector = memo(({
  dimensions = [],
  selectedDimensions = [],
  onToggle,
  onSelectAll,
  onClear,
  onAddCustom,
  onDeleteCustom,
  loading = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const dropdownRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 处理添加自定义维度
  const handleAddCustom = useCallback(() => {
    if (customInput.trim() && onAddCustom) {
      onAddCustom(customInput.trim());
      setCustomInput('');
      setShowCustomInput(false);
    }
  }, [customInput, onAddCustom]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustom();
    }
    if (e.key === 'Escape') {
      setShowCustomInput(false);
      setCustomInput('');
    }
  }, [handleAddCustom]);

  const hasSelected = selectedDimensions.length > 0;

  return (
    <div className="dimension-selector" ref={dropdownRef}>
      {/* 触发按钮 */}
      {hasSelected ? (
        <div className="dimension-active">
          <span className="dimension-active-label">
            <Sparkles size={14} />
            <span>{selectedDimensions.length} 个维度</span>
          </span>
          <button 
            className="dimension-edit-btn"
            onClick={() => setIsOpen(!isOpen)}
            title="编辑维度"
            disabled={disabled}
          >
            <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
          </button>
          <button 
            className="dimension-clear-btn"
            onClick={onClear}
            title="清除所有"
            disabled={disabled}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button 
          className="dimension-select-btn"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <Sparkles size={14} />
          <span>AI 分析</span>
          <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
        </button>
      )}

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="dimension-dropdown">
          <div className="dimension-dropdown-header">
            <span className="dimension-dropdown-title">选择分析维度</span>
            <div className="dimension-dropdown-actions">
              <button 
                className="dimension-select-all-btn"
                onClick={onSelectAll}
                disabled={loading}
              >
                全选
              </button>
              <button 
                className="dimension-clear-all-btn"
                onClick={onClear}
                disabled={loading || selectedDimensions.length === 0}
              >
                清除
              </button>
            </div>
          </div>

          <div className="dimension-dropdown-list">
            {loading ? (
              <div className="dimension-loading">
                <div className="dimension-loading-spinner"></div>
                <span>加载维度中...</span>
              </div>
            ) : (
              <>
                {dimensions.map((dimension) => {
                  const isSelected = selectedDimensions.includes(dimension.name);
                  const isCustom = dimension.isCustom;
                  
                  return (
                    <div 
                      key={dimension.id || dimension.name}
                      className={`dimension-item ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
                    >
                      <button
                        className="dimension-item-btn"
                        onClick={() => onToggle(dimension)}
                      >
                        <span className="dimension-check">
                          {isSelected && <Check size={14} />}
                        </span>
                        <span className="dimension-name">{dimension.name}</span>
                        {dimension.description && (
                          <span className="dimension-desc">{dimension.description}</span>
                        )}
                      </button>
                      
                      {isCustom && onDeleteCustom && (
                        <button
                          className="dimension-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustom(dimension);
                          }}
                          title="删除自定义维度"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* 添加自定义维度 */}
                {onAddCustom && (
                  <div className="dimension-custom-add">
                    {showCustomInput ? (
                      <div className="dimension-custom-input-wrapper">
                        <input
                          type="text"
                          className="dimension-custom-input"
                          placeholder="输入自定义维度名称"
                          value={customInput}
                          onChange={(e) => setCustomInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          maxLength={50}
                        />
                        <button 
                          className="dimension-custom-confirm"
                          onClick={handleAddCustom}
                          disabled={!customInput.trim()}
                        >
                          <Check size={14} />
                        </button>
                        <button 
                          className="dimension-custom-cancel"
                          onClick={() => {
                            setShowCustomInput(false);
                            setCustomInput('');
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="dimension-add-btn"
                        onClick={() => setShowCustomInput(true)}
                      >
                        <Plus size={14} />
                        <span>添加自定义维度</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {selectedDimensions.length > 0 && (
            <div className="dimension-dropdown-footer">
              <span className="dimension-selected-count">
                已选择 {selectedDimensions.length} 个维度
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

DimensionSelector.displayName = 'DimensionSelector';

DimensionSelector.propTypes = {
  dimensions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    isCustom: PropTypes.bool,
  })),
  selectedDimensions: PropTypes.arrayOf(PropTypes.string),
  onToggle: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func,
  onClear: PropTypes.func,
  onAddCustom: PropTypes.func,
  onDeleteCustom: PropTypes.func,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
};

export default DimensionSelector;


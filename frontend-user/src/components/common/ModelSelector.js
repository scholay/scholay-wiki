/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import './ModelSelector.css';

/**
 * 模型选择器组件
 * @param {string} value - 当前选中的模型级别 ('low', 'mid', 'high')
 * @param {function} onChange - 模型变更回调
 * @param {boolean} disabled - 是否禁用
 * @param {boolean} compact - 是否使用紧凑模式
 * @param {boolean} showOnly - 是否只显示，不可交互
 * @param {string} dropdownAlign - 下拉菜单对齐方式 ('left' 或 'right')，默认 'left'
 * @param {array} allowedModels - 允许显示的模型列表，例如 ['mid', 'high']，默认全部显示
 */
const ModelSelector = memo(({ value = 'low', onChange, disabled = false, compact = false, showOnly = false, dropdownAlign = 'left', allowedModels = null }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  // SVG图标组件
  const LowIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );

  const MidIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  );

  const HighIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );

  // 模型配置
  const allModels = [
    {
      value: 'low',
      label: '普通模型',
      description: '快速响应，适合基础搜索',
      icon: <LowIcon />
    },
    {
      value: 'mid',
      label: '进阶模型',
      description: '平衡性能，适合大多数场景',
      icon: <MidIcon />
    },
    {
      value: 'high',
      label: '高级模型',
      description: '最高质量，深度分析',
      icon: <HighIcon />
    }
  ];

  // 根据 allowedModels 过滤可显示的模型
  const models = allowedModels 
    ? allModels.filter(m => allowedModels.includes(m.value))
    : allModels;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      // 使用 capture 阶段捕获事件，确保优先处理
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('touchstart', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [showDropdown]);

  // 获取当前选中的模型（默认第一个，即普通模型）
  const selectedModel = models.find(m => m.value === value) || models[0];

  const handleModelSelect = useCallback((model) => {
    onChange(model.value);
    setShowDropdown(false);
  }, [onChange]);

  return (
    <div ref={containerRef} className={`model-selector ${compact ? 'compact' : ''} ${showOnly ? 'show-only' : ''}`}>
        <button
          type="button"
          className={`model-selector-btn ${showDropdown ? 'open' : ''} ${compact ? 'compact' : ''} ${showOnly ? 'show-only' : ''}`}
          onClick={() => !disabled && !showOnly && setShowDropdown(!showDropdown)}
          disabled={disabled || showOnly}
        >
          <span className="model-icon">{selectedModel.icon}</span>
          <span className="model-label">{selectedModel.label}</span>
          {!compact && !showOnly && (
          <svg
            className={`dropdown-arrow ${showDropdown ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
          )}
        </button>

        {showDropdown && (
          <div className={`model-selector-dropdown ${dropdownAlign === 'right' ? 'align-right' : ''}`}>
            <div className="dropdown-header">选择模型</div>
            {models.map((model) => {
              const isSelected = model.value === value;

              return (
                <button
                  key={model.value}
                  type="button"
                  className={`model-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleModelSelect(model)}
                >
                  <div className="model-option-icon-wrapper">
                    {model.icon}
                  </div>
                  <div className="model-option-header">
                    <div className="model-option-top">
                      <span className="model-option-label">{model.label}</span>
                      {isSelected && (
                        <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    <div className="model-option-desc">{model.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
  );
});

ModelSelector.displayName = 'ModelSelector';

export default ModelSelector;


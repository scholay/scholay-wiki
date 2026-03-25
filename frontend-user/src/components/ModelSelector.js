/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { memo, useMemo } from 'react';
import { Select } from 'antd';
import './ModelSelector.css';

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

const iconMap = { low: <LowIcon />, mid: <MidIcon />, high: <HighIcon /> };

const allModels = [
  { value: 'low', label: '普通模型', description: '快速响应，适合基础搜索' },
  { value: 'mid', label: '进阶模型', description: '平衡性能，适合大多数场景' },
  { value: 'high', label: '高级模型', description: '最高质量，深度分析' },
];

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
  const models = useMemo(() =>
    allowedModels ? allModels.filter(m => allowedModels.includes(m.value)) : allModels,
    [allowedModels]
  );

  const options = useMemo(() => models.map(m => ({
    value: m.value,
    label: (
      <span className="model-select-option-label">
        <span className="model-icon">{iconMap[m.value]}</span>
        <span className="model-label">{m.label}</span>
      </span>
    ),
  })), [models]);

  const selectedModel = models.find(m => m.value === value) || models[0];

  if (showOnly) {
    return (
      <div className={`model-selector show-only ${compact ? 'compact' : ''}`}>
        <span className="model-selector-display">
          <span className="model-icon">{iconMap[selectedModel.value]}</span>
          <span className="model-label">{selectedModel.label}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`model-selector ${compact ? 'compact' : ''}`}>
      <Select
        className="model-antd-select"
        popupClassName="model-antd-dropdown"
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={options}
        popupMatchSelectWidth={false}
        placement={dropdownAlign === 'right' ? 'bottomRight' : 'bottomLeft'}
        variant="borderless"
        suffixIcon={!compact ? undefined : null}
        optionRender={(option) => {
          const model = models.find(m => m.value === option.value);
          return (
            <div className="model-option-render">
              <span className="model-icon">{iconMap[option.value]}</span>
              <div className="model-option-info">
                <span className="model-option-label">{model?.label}</span>
                <span className="model-option-desc">{model?.description}</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
});

ModelSelector.displayName = 'ModelSelector';

export default ModelSelector;


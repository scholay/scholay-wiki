import React, { useState, useEffect } from 'react';
import { subscriptionAPI } from '../services/api';
import './ModelSelector.css';

/**
 * 模型选择器组件
 * @param {string} value - 当前选中的模型级别 ('low', 'mid', 'high')
 * @param {function} onChange - 模型变更回调
 * @param {boolean} disabled - 是否禁用
 * @param {object} userSubscription - 用户订阅信息
 * @param {string} mode - 使用场景 ('advanced-search' 或 'ai-chat')，默认 'advanced-search'
 * @param {boolean} compact - 是否使用紧凑模式
 * @param {boolean} showOnly - 是否只显示，不可交互
 */
const ModelSelector = ({ value = 'low', onChange, disabled = false, userSubscription, mode = 'advanced-search', compact = false, showOnly = false }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [quota, setQuota] = useState(null);
  const [usage, setUsage] = useState(null);

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
  const models = [
    {
      value: 'low',
      label: '普通模型',
      description: '快速响应，适合基础搜索',
      icon: <LowIcon />,
      featureTypes: ['advanced_search_low', 'ai_chat_normal']
    },
    {
      value: 'mid',
      label: '进阶模型',
      description: '平衡性能，适合大多数场景',
      icon: <MidIcon />,
      featureTypes: ['advanced_search_mid', 'ai_chat_mid']
    },
    {
      value: 'high',
      label: '高级模型',
      description: '最高质量，深度分析',
      icon: <HighIcon />,
      featureTypes: ['advanced_search_high', 'ai_chat_high']
    }
  ];

  // 获取配额和使用情况
  useEffect(() => {
    const fetchQuotaAndUsage = async () => {
      try {
        const response = await subscriptionAPI.getUsage();

        if (response.data.code === 0) {
          const data = response.data.data;
          // 后端返回的数据包含 usage 和 limits
          // 将 limits 映射为 quota 格式
          const quotaData = {
            advancedSearchLowQuota: data.limits?.advanced_search_low?.limit ?? -1,
            advancedSearchMidQuota: data.limits?.advanced_search_mid?.limit ?? -1,
            advancedSearchHighQuota: data.limits?.advanced_search_high?.limit ?? -1,
            aiChatNormalQuota: data.limits?.ai_chat_normal?.limit ?? -1,
            aiChatMidQuota: data.limits?.ai_chat_mid?.limit ?? -1,
            aiChatHighQuota: data.limits?.ai_chat_high?.limit ?? -1,
          };

          // 将 usage 映射为前端格式
          const usageData = {
            advancedSearchLowCount: data.usage?.advanced_search_low ?? 0,
            advancedSearchMidCount: data.usage?.advanced_search_mid ?? 0,
            advancedSearchHighCount: data.usage?.advanced_search_high ?? 0,
            aiChatNormalCount: data.usage?.ai_chat_normal ?? 0,
            aiChatMidCount: data.usage?.ai_chat_mid ?? 0,
            aiChatHighCount: data.usage?.ai_chat_high ?? 0,
          };

          setQuota(quotaData);
          setUsage(usageData);
        }
      } catch (error) {
        console.error('Failed to fetch quota/usage:', error);
      }
    };

    // 只在组件挂载时获取一次配额信息
    fetchQuotaAndUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取当前选中的模型（默认第一个，即普通模型）
  const selectedModel = models.find(m => m.value === value) || models[0];

  // 检查模型是否可用
  const isModelAvailable = (model) => {
    if (!quota || !userSubscription) return true;

    const planCode = userSubscription.plan_code;

    // FREE 用户只能使用普通模型
    if (planCode === 'FREE' && model.value !== 'low') {
      return false;
    }

    // PRO 用户可以使用普通和进阶模型
    if (planCode === 'PRO' && model.value === 'high') {
      return false;
    }

    // MAX 用户可以使用所有模型
    return true;
  };

  // 获取模型的剩余次数
  const getRemainingCount = (model) => {
    if (!quota || !usage) return null;

    // 根据 mode 选择对应的 feature type
    const featurePrefix = mode === 'ai-chat' ? 'ai_chat_' : 'advanced_search_';
    const feature = model.featureTypes.find(ft => ft.startsWith(featurePrefix));

    if (feature) {
      // 提取级别名称（low, mid, high 或 normal）
      const levelName = feature.replace(featurePrefix, '');

      // 映射配额字段名
      const quotaFieldMap = {
        // Advanced Search
        'low': 'advancedSearchLowQuota',
        'mid': 'advancedSearchMidQuota',
        'high': 'advancedSearchHighQuota',
        // AI Chat
        'normal': 'aiChatNormalQuota',
      };

      const usageFieldMap = {
        // Advanced Search
        'low': 'advancedSearchLowCount',
        'mid': 'advancedSearchMidCount',
        'high': 'advancedSearchHighCount',
        // AI Chat
        'normal': 'aiChatNormalCount',
      };

      // AI Chat 的 mid 和 high
      if (mode === 'ai-chat') {
        if (levelName === 'mid') {
          quotaFieldMap['mid'] = 'aiChatMidQuota';
          usageFieldMap['mid'] = 'aiChatMidCount';
        } else if (levelName === 'high') {
          quotaFieldMap['high'] = 'aiChatHighQuota';
          usageFieldMap['high'] = 'aiChatHighCount';
        }
      }

      const quotaField = quotaFieldMap[levelName];
      const usageField = usageFieldMap[levelName];

      const quotaValue = quota[quotaField];
      const usageValue = usage[usageField] || 0;

      // -1 表示无限制
      if (quotaValue === -1) return '无限制';

      const remaining = Math.max(0, quotaValue - usageValue);
      return remaining;
    }

    return null;
  };

  const handleModelSelect = (model) => {
    if (!isModelAvailable(model)) return;
    onChange(model.value);
    setShowDropdown(false);
  };

  return (
    <div className={`model-selector ${compact ? 'compact' : ''} ${showOnly ? 'show-only' : ''}`}>
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
        <>
          <div className="model-selector-overlay" onClick={() => setShowDropdown(false)} />
          <div className="model-selector-dropdown">
            <div className="dropdown-header">选择模型</div>
            {models.map((model) => {
              const available = isModelAvailable(model);
              const remaining = getRemainingCount(model);
              const isSelected = model.value === value;

              return (
                <button
                  key={model.value}
                  type="button"
                  className={`model-option ${isSelected ? 'selected' : ''} ${!available ? 'disabled' : ''}`}
                  onClick={() => handleModelSelect(model)}
                  disabled={!available}
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
                    {!available && (
                      <div className="model-option-badge">
                        {userSubscription?.plan_code === 'FREE' && '需要升级订阅'}
                        {userSubscription?.plan_code === 'PRO' && model.value === 'high' && '需要 MAX 订阅'}
                      </div>
                    )}
                    {available && remaining !== null && remaining !== '无限制' && (
                      <div className="model-option-quota">
                        剩余 {remaining} 次
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;

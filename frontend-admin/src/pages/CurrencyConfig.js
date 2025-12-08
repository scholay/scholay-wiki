/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './CurrencyConfig.css';

const CurrencyConfig = () => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editForm, setEditForm] = useState({ amount: 0, description: '', enabled: true });

  // 加载配置
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCurrencyConfigs();
      if (response.data?.code === 0) {
        setConfigs(response.data.data || []);
      } else {
        showToast(response.data?.message || '加载配置失败', 'error');
      }
    } catch (error) {
      showToast('加载配置失败: ' + (error.response?.data?.message || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // 初始化默认配置
  const handleInitConfigs = async () => {
    try {
      const response = await adminAPI.initCurrencyConfigs();
      if (response.data?.code === 0) {
        showToast('初始化成功', 'success');
        loadConfigs();
      } else {
        showToast(response.data?.message || '初始化失败', 'error');
      }
    } catch (error) {
      showToast('初始化失败: ' + (error.response?.data?.message || error.message), 'error');
    }
  };

  // 开始编辑
  const handleEdit = (config) => {
    setEditingConfig(config.config_key);
    setEditForm({
      amount: config.amount,
      description: config.description,
      enabled: config.enabled
    });
  };

  // 取消编辑
  const handleCancel = () => {
    setEditingConfig(null);
    setEditForm({ amount: 0, description: '', enabled: true });
  };

  // 保存配置
  const handleSave = async (configKey) => {
    try {
      const response = await adminAPI.updateCurrencyConfig(configKey, editForm);
      if (response.data?.code === 0) {
        showToast('保存成功', 'success');
        setEditingConfig(null);
        loadConfigs();
      } else {
        showToast(response.data?.message || '保存失败', 'error');
      }
    } catch (error) {
      showToast('保存失败: ' + (error.response?.data?.message || error.message), 'error');
    }
  };

  // 获取分类标签
  const getCategoryLabel = (category) => {
    const labels = {
      reward: '奖励配置',
      cost: '消耗配置',
      recharge: '充值配置',
      exchange: '兑换配置',
      membership: '会员配置'
    };
    return labels[category] || category;
  };

  // 获取货币类型标签
  const getCurrencyLabel = (type) => {
    const labels = {
      gold: '金币',
      diamond: '钻石'
    };
    return labels[type] || type;
  };

  // 获取金额显示单位（特殊处理某些配置）
  const getAmountUnit = (config) => {
    // 钻石单价的单位是"分"，不是钻石
    if (config.config_key === 'diamond_price') {
      return '分';
    }
    return config.currency_type === 'gold' ? '金币' : '钻石';
  };

  // 格式化金额显示（特殊处理某些配置）
  const formatAmountDisplay = (config) => {
    if (config.config_key === 'diamond_price') {
      const yuan = (config.amount / 100).toFixed(2);
      return (
        <span className="amount-value price-value">
          {config.amount}
          <span className="currency-unit">分</span>
          <span className="price-hint">（{yuan}元/个钻石）</span>
        </span>
      );
    }
    return (
      <span className="amount-value">
        {config.amount}
        <span className="currency-unit">
          {config.currency_type === 'gold' ? '金币' : '钻石'}
        </span>
      </span>
    );
  };

  // 按分类分组配置
  const groupedConfigs = configs.reduce((acc, config) => {
    const category = config.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(config);
    return acc;
  }, {});

  return (
    <div className="currency-config-page">
      <div className="page-header">
        <h1>货币配置管理</h1>
        <p className="page-description">
          管理系统中的金币和钻石配置，包括注册赠送、签到奖励、功能消耗等
        </p>
        <button className="init-btn" onClick={handleInitConfigs}>
          初始化默认配置
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      ) : configs.length === 0 ? (
        <div className="empty-state">
          <p>暂无配置，请点击"初始化默认配置"按钮创建</p>
        </div>
      ) : (
        <div className="config-sections">
          {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => (
            <div key={category} className="config-section">
              <h2 className="section-title">
                <span className={`category-badge ${category}`}>
                  {getCategoryLabel(category)}
                </span>
              </h2>
              <div className="config-table-wrapper">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>配置名称</th>
                      <th>配置键</th>
                      <th>货币类型</th>
                      <th>金额</th>
                      <th>描述</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryConfigs.map((config) => (
                      <tr key={config.id} className={!config.enabled ? 'disabled-row' : ''}>
                        <td className="config-name">{config.config_name}</td>
                        <td className="config-key">
                          <code>{config.config_key}</code>
                        </td>
                        <td>
                          <span className={`currency-badge ${config.currency_type}`}>
                            {getCurrencyLabel(config.currency_type)}
                          </span>
                        </td>
                        <td className="config-amount">
                          {editingConfig === config.config_key ? (
                            <div className="edit-amount-wrapper">
                              <input
                                type="number"
                                value={editForm.amount}
                                onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value) || 0 })}
                                className="edit-input amount-input"
                                min="0"
                              />
                              <span className="edit-unit">{getAmountUnit(config)}</span>
                              {config.config_key === 'diamond_price' && editForm.amount > 0 && (
                                <span className="edit-price-hint">= {(editForm.amount / 100).toFixed(2)}元/个</span>
                              )}
                            </div>
                          ) : (
                            formatAmountDisplay(config)
                          )}
                        </td>
                        <td className="config-desc">
                          {editingConfig === config.config_key ? (
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className="edit-input desc-input"
                              placeholder="配置描述"
                            />
                          ) : (
                            config.description || '-'
                          )}
                        </td>
                        <td>
                          {editingConfig === config.config_key ? (
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={editForm.enabled}
                                onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          ) : (
                            <span className={`status-badge ${config.enabled ? 'enabled' : 'disabled'}`}>
                              {config.enabled ? '启用' : '禁用'}
                            </span>
                          )}
                        </td>
                        <td className="actions">
                          {editingConfig === config.config_key ? (
                            <>
                              <button 
                                className="save-btn"
                                onClick={() => handleSave(config.config_key)}
                              >
                                保存
                              </button>
                              <button 
                                className="cancel-btn"
                                onClick={handleCancel}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button 
                              className="edit-btn"
                              onClick={() => handleEdit(config)}
                            >
                              编辑
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="config-tips">
        <h3>配置说明</h3>
        <ul>
          <li><strong>注册赠送金币</strong>：新用户注册时自动赠送的金币数量</li>
          <li><strong>每日签到金币</strong>：用户每日签到获得的金币数量</li>
          <li><strong>邀请奖励金币</strong>：成功邀请新用户注册后获得的金币奖励</li>
          <li><strong>功能消耗</strong>：使用各项功能时消耗的金币/钻石数量，设为0表示免费</li>
          <li><strong>禁用配置</strong>：禁用后该配置不会生效（如禁用注册赠送则新用户不会获得金币）</li>
        </ul>
      </div>
    </div>
  );
};

export default CurrencyConfig;


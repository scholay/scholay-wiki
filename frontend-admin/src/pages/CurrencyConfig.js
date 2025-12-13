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
  const [deductConfigs, setDeductConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editForm, setEditForm] = useState({ amount: 0, display_name: '', display_remark: '', description: '', enabled: true });
  const [editingDeduct, setEditingDeduct] = useState(null);
  const [deductForm, setDeductForm] = useState({ amount: 0, display_name: '', display_remark: '', description: '', enabled: true });
  const [activeTab, setActiveTab] = useState('currency'); // 'currency' or 'deduct'

  // 加载货币配置
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

  // 加载扣费配置
  const loadDeductConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getDeductConfigs();
      if (response.data?.code === 0) {
        setDeductConfigs(response.data.data || []);
      } else {
        showToast(response.data?.message || '加载扣费配置失败', 'error');
      }
    } catch (error) {
      showToast('加载扣费配置失败: ' + (error.response?.data?.message || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
    loadDeductConfigs();
  }, []);

  // 开始编辑
  const handleEdit = (config) => {
    setEditingConfig(config.config_key);
    setEditForm({
      amount: config.amount,
      display_name: config.display_name || '',
      display_remark: config.display_remark || '',
      description: config.description || '',
      enabled: config.enabled
    });
  };

  // 取消编辑
  const handleCancel = () => {
    setEditingConfig(null);
    setEditForm({ amount: 0, display_name: '', display_remark: '', description: '', enabled: true });
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

  // 开始编辑扣费配置
  const handleEditDeduct = (config) => {
    setEditingDeduct(config.biz_type);
    setDeductForm({
      amount: config.amount,
      display_name: config.display_name || '',
      display_remark: config.display_remark || '',
      description: config.description || '',
      enabled: config.enabled
    });
  };

  // 取消编辑扣费配置
  const handleCancelDeduct = () => {
    setEditingDeduct(null);
    setDeductForm({ amount: 0, display_name: '', display_remark: '', description: '', enabled: true });
  };

  // 保存扣费配置
  const handleSaveDeduct = async (bizType) => {
    try {
      const response = await adminAPI.updateDeductConfig({
        biz_type: bizType,
        currency_type: 'gold',
        ...deductForm
      });
      if (response.data?.code === 0) {
        showToast('保存成功', 'success');
        setEditingDeduct(null);
        loadDeductConfigs();
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
      recharge: '充值配置',
      exchange: '兑换配置',
      membership: '会员配置'
    };
    return labels[category] || category;
  };

  // 获取扣费配置名称
  const getDeductConfigName = (bizType) => {
    const names = {
      paper_analysis: '多维度分析',
      peer_review: 'AI审稿',
      // AI对话（按模型级别）
      ai_chat_low: 'AI对话-普通模型',
      ai_chat_mid: 'AI对话-进阶模型',
      ai_chat_high: 'AI对话-高级模型',
      // 智能分析（按模型级别）
      smart_analysis_low: '智能分析-普通模型',
      smart_analysis_mid: '智能分析-进阶模型',
      smart_analysis_high: '智能分析-高级模型'
    };
    return names[bizType] || bizType;
  };

  // 获取货币类型标签
  const getCurrencyLabel = (type) => {
    const labels = {
      gold: '经费',
      diamond: '恩特币'
    };
    return labels[type] || type;
  };

  // 获取金额显示单位（特殊处理某些配置）
  const getAmountUnit = (config) => {
    // 恩特币单价的单位是"分"，不是恩特币
    if (config.config_key === 'diamond_price') {
      return '分';
    }
    return config.currency_type === 'gold' ? '经费' : '恩特币';
  };

  // 格式化金额显示（特殊处理某些配置）
  const formatAmountDisplay = (config) => {
    if (config.config_key === 'diamond_price') {
      const yuan = (config.amount / 100).toFixed(2);
      return (
        <span className="amount-value price-value">
          {config.amount}
          <span className="currency-unit">分</span>
          <span className="price-hint">（{yuan}元/个恩特币）</span>
        </span>
      );
    }
    return (
      <span className="amount-value">
        {config.amount}
        <span className="currency-unit">
          {config.currency_type === 'gold' ? '经费' : '恩特币'}
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
          管理系统中的经费和恩特币配置，包括注册赠送、签到奖励、功能消耗等
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="config-tabs">
        <button
          className={`tab-btn ${activeTab === 'currency' ? 'active' : ''}`}
          onClick={() => setActiveTab('currency')}
        >
          货币配置
        </button>
        <button
          className={`tab-btn ${activeTab === 'deduct' ? 'active' : ''}`}
          onClick={() => setActiveTab('deduct')}
        >
          扣费配置
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      ) : activeTab === 'currency' ? (
        // 货币配置 Tab
        configs.length === 0 ? (
          <div className="empty-state">
            <p>暂无配置数据</p>
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
                        <th>流水标题 <span className="th-hint">（交易流水显示）</span></th>
                        <th>流水备注 <span className="th-hint">（交易流水显示）</span></th>
                        <th>后台描述</th>
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
                          <td className="config-display-name">
                            {editingConfig === config.config_key ? (
                              <input
                                type="text"
                                value={editForm.display_name}
                                onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                                className="edit-input"
                                placeholder="流水标题"
                              />
                            ) : (
                              config.display_name || '-'
                            )}
                          </td>
                          <td className="config-display-remark">
                            {editingConfig === config.config_key ? (
                              <input
                                type="text"
                                value={editForm.display_remark}
                                onChange={(e) => setEditForm({ ...editForm, display_remark: e.target.value })}
                                className="edit-input"
                                placeholder="流水备注"
                              />
                            ) : (
                              config.display_remark || '-'
                            )}
                          </td>
                          <td className="config-desc">
                            {editingConfig === config.config_key ? (
                              <input
                                type="text"
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="edit-input desc-input"
                                placeholder="后台描述"
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
        )
      ) : (
        // 扣费配置 Tab
        deductConfigs.length === 0 ? (
          <div className="empty-state">
            <p>暂无扣费配置数据</p>
          </div>
        ) : (
          <div className="config-sections">
            <div className="config-section">
              <h2 className="section-title">
                <span className="category-badge deduct">
                  功能扣费配置
                </span>
              </h2>
              <p className="section-desc">配置各功能使用时的经费扣费数量，设为0表示免费使用。<strong>流水标题</strong>和<strong>流水备注</strong>会显示在用户的交易流水中。</p>
              <div className="config-table-wrapper">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>功能名称</th>
                      <th>配置键</th>
                      <th>扣费经费</th>
                      <th>流水标题 <span className="th-hint">（交易流水显示）</span></th>
                      <th>流水备注 <span className="th-hint">（交易流水显示）</span></th>
                      <th>后台描述</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductConfigs.map((config) => (
                      <tr key={config.id} className={!config.enabled ? 'disabled-row' : ''}>
                        <td className="config-name">{getDeductConfigName(config.biz_type)}</td>
                        <td className="config-key">
                          <code>{config.biz_type}</code>
                        </td>
                        <td className="config-amount">
                          {editingDeduct === config.biz_type ? (
                            <div className="edit-amount-wrapper">
                              <input
                                type="number"
                                value={deductForm.amount}
                                onChange={(e) => setDeductForm({ ...deductForm, amount: parseInt(e.target.value) || 0 })}
                                className="edit-input amount-input"
                                min="0"
                              />
                              <span className="edit-unit">经费</span>
                            </div>
                          ) : (
                            <span className="amount-value">
                              {config.amount}
                              <span className="currency-unit">经费</span>
                            </span>
                          )}
                        </td>
                        <td className="config-display-name">
                          {editingDeduct === config.biz_type ? (
                            <input
                              type="text"
                              value={deductForm.display_name}
                              onChange={(e) => setDeductForm({ ...deductForm, display_name: e.target.value })}
                              className="edit-input"
                              placeholder="流水标题"
                            />
                          ) : (
                            config.display_name || '-'
                          )}
                        </td>
                        <td className="config-display-remark">
                          {editingDeduct === config.biz_type ? (
                            <input
                              type="text"
                              value={deductForm.display_remark}
                              onChange={(e) => setDeductForm({ ...deductForm, display_remark: e.target.value })}
                              className="edit-input"
                              placeholder="流水备注"
                            />
                          ) : (
                            config.display_remark || '-'
                          )}
                        </td>
                        <td className="config-desc">
                          {editingDeduct === config.biz_type ? (
                            <input
                              type="text"
                              value={deductForm.description}
                              onChange={(e) => setDeductForm({ ...deductForm, description: e.target.value })}
                              className="edit-input desc-input"
                              placeholder="后台描述"
                            />
                          ) : (
                            config.description || '-'
                          )}
                        </td>
                        <td>
                          {editingDeduct === config.biz_type ? (
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={deductForm.enabled}
                                onChange={(e) => setDeductForm({ ...deductForm, enabled: e.target.checked })}
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
                          {editingDeduct === config.biz_type ? (
                            <>
                              <button 
                                className="save-btn"
                                onClick={() => handleSaveDeduct(config.biz_type)}
                              >
                                保存
                              </button>
                              <button 
                                className="cancel-btn"
                                onClick={handleCancelDeduct}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button 
                              className="edit-btn"
                              onClick={() => handleEditDeduct(config)}
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
          </div>
        )
      )}

      <div className="config-tips">
        <h3>配置说明</h3>
        <div className="tips-section">
          <h4>📋 交易流水显示说明</h4>
          <p className="tips-highlight">用户在"交易流水"中看到的内容由以下字段决定：</p>
          <ul>
            <li><strong>流水标题 (display_name)</strong>：显示在交易流水列表的标题位置</li>
            <li><strong>流水备注 (display_remark)</strong>：显示在交易流水列表的描述位置</li>
          </ul>
        </div>
        <div className="tips-section">
          <h4>💰 货币配置</h4>
          <ul>
            <li><strong>配置名称</strong>：后台管理显示用，帮助管理员理解配置用途</li>
            <li><strong>金额</strong>：实际赠送/扣费的数量</li>
            <li><strong>流水标题</strong>：交易流水中显示的标题（如"每日签到"）</li>
            <li><strong>流水备注</strong>：交易流水中显示的备注（如"签到奖励"）</li>
            <li><strong>后台描述</strong>：仅在后台显示，用于管理员参考</li>
          </ul>
        </div>
        <div className="tips-section">
          <h4>⚡ 扣费配置</h4>
          <ul>
            <li><strong>功能名称</strong>：对应功能的显示名称</li>
            <li><strong>配置键(biz_type)</strong>：系统内部标识，用于匹配扣费逻辑</li>
            <li><strong>扣费经费</strong>：使用该功能时扣除的经费数量，设为0表示免费</li>
            <li><strong>流水标题</strong>：交易流水中显示的标题（如"AI对话"）</li>
            <li><strong>流水备注</strong>：交易流水中显示的备注（如"普通模型对话"）</li>
            <li><strong>后台描述</strong>：仅在后台显示，用于管理员参考</li>
          </ul>
        </div>
        <div className="tips-section">
          <h4>⚠️ 注意事项</h4>
          <ul>
            <li>禁用配置后，该配置不会生效（如禁用注册赠送则新用户不会获得经费）</li>
            <li>修改金额后立即生效，会影响后续的交易</li>
            <li>修改流水标题/备注后，新产生的交易会使用新内容，历史交易不受影响</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CurrencyConfig;


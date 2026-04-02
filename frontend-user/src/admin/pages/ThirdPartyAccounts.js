/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './ThirdPartyAccounts.css';

const ThirdPartyAccounts = () => {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'semantic_scholar',
    config: {
      api_key: '',
      base_url: '',
      model_low: '',
      model_mid: '',
      model_high: '',
      peer_review_model_1: '',
      peer_review_model_2: '',
      peer_review_model_3: '',
    },
    status: 1,
    priority: 0,
  });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getThirdPartyAccounts(filterType, filterActive);
      if (response.data.code === 0 && response.data.data) {
        setAccounts(response.data.data.accounts || []);
      }
    } catch (err) {
      showToast('加载账号列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterActive]);

  const loadStats = useCallback(async () => {
    try {
      const response = await adminAPI.getThirdPartyAccountStats();
      if (response.data.code === 0 && response.data.data) {
        setStats(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadStats();
  }, [loadAccounts, loadStats]);

  const handleCreate = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'semantic_scholar',
      config: {
        api_key: '',
        base_url: '',
        model_low: '',
        model_mid: '',
        model_high: '',
        peer_review_model_1: '',
        peer_review_model_2: '',
        peer_review_model_3: '',
      },
      status: 1,
      priority: 0,
    });
    setShowModal(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      config: account.config || {},
      status: account.status,
      priority: account.priority || 0,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除此账号？')) return;

    try {
      const response = await adminAPI.deleteThirdPartyAccount(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadAccounts();
        loadStats();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleTest = async (id) => {
    try {
      const response = await adminAPI.testThirdPartyAccount(id);
      if (response.data.code === 0) {
        showToast('测试成功: ' + response.data.data.message, 'success');
      } else {
        showToast('测试失败: ' + response.data.message, 'error');
      }
    } catch (err) {
      showToast('测试失败', 'error');
    }
  };

  const handleRefreshCache = async () => {
    try {
      const response = await adminAPI.refreshThirdPartyAccountCache();
      if (response.data.code === 0) {
        showToast('缓存刷新成功', 'success');
      } else {
        showToast('刷新失败: ' + response.data.message, 'error');
      }
    } catch (err) {
      showToast('刷新失败', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prepare config based on account type
    let config = {};
    if (formData.type === 'semantic_scholar') {
      if (!formData.config.api_key) {
        showToast('请输入API Key', 'error');
        return;
      }
      config = { api_key: formData.config.api_key };
    } else if (formData.type === 'ai_model') {
      if (!formData.config.base_url || !formData.config.api_key) {
        showToast('请输入Base URL和API Key', 'error');
        return;
      }
      config = {
        base_url: formData.config.base_url,
        api_key: formData.config.api_key,
      };
      // Add model codes if provided
      if (formData.config.model_low) {
        config.model_low = formData.config.model_low;
      }
      if (formData.config.model_mid) {
        config.model_mid = formData.config.model_mid;
      }
      if (formData.config.model_high) {
        config.model_high = formData.config.model_high;
      }
      // Add peer review model codes if provided
      if (formData.config.peer_review_model_1) {
        config.peer_review_model_1 = formData.config.peer_review_model_1;
      }
      if (formData.config.peer_review_model_2) {
        config.peer_review_model_2 = formData.config.peer_review_model_2;
      }
      if (formData.config.peer_review_model_3) {
        config.peer_review_model_3 = formData.config.peer_review_model_3;
      }
    }

    const data = {
      name: formData.name,
      type: formData.type,
      config,
      status: formData.status,
      priority: formData.priority,
    };

    try {
      let response;
      if (editingAccount) {
        response = await adminAPI.updateThirdPartyAccount(editingAccount.id, data);
      } else {
        response = await adminAPI.createThirdPartyAccount(data);
      }

      if (response.data.code === 0) {
        showToast(editingAccount ? '更新成功' : '创建成功', 'success');
        setShowModal(false);
        loadAccounts();
        loadStats();
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err) {
      showToast('操作失败', 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '从未使用';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  // 格式化为相对时间（更友好的显示）
  const formatRelativeTime = (dateString) => {
    if (!dateString) return '从未使用';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 30) {
      return '刚刚';
    } else if (diffSeconds < 60) {
      return `${diffSeconds}秒前`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks}周前`;
    } else if (diffMonths < 12) {
      return `${diffMonths}个月前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  };

  // 格式化数字（添加千分位）
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('zh-CN');
  };

  const getAccountTypeLabel = (type) => {
    switch (type) {
      case 'semantic_scholar':
        return <span className="type-badge type-scholar">Semantic Scholar</span>;
      case 'ai_model':
        return <span className="type-badge type-ai">AI模型</span>;
      default:
        return <span className="type-badge">{type}</span>;
    }
  };

  const getStatusLabel = (status) => {
    return status === 1 ? (
      <span className="status-badge status-active">启用</span>
    ) : (
      <span className="status-badge status-inactive">停用</span>
    );
  };

  const getModelCodesLabel = (config) => {
    if (!config) return '-';
    const models = [];
    if (config.model_low) models.push(`Low: ${config.model_low}`);
    if (config.model_mid) models.push(`Mid: ${config.model_mid}`);
    if (config.model_high) models.push(`High: ${config.model_high}`);
    
    // 审稿模型
    const prModels = [];
    if (config.peer_review_model_1) prModels.push(`α: ${config.peer_review_model_1}`);
    if (config.peer_review_model_2) prModels.push(`β: ${config.peer_review_model_2}`);
    if (config.peer_review_model_3) prModels.push(`γ: ${config.peer_review_model_3}`);
    
    let result = models.length > 0 ? models.join(' / ') : '';
    if (prModels.length > 0) {
      result += (result ? ' | 审稿: ' : '审稿: ') + prModels.join(', ');
    }
    return result || '-';
  };

  return (
    <div className="third-party-accounts">
      <div className="page-header">
        <h2>第三方账号配置</h2>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleRefreshCache}>
            刷新缓存
          </button>
          <button className="btn btn-primary" onClick={handleCreate}>
            添加账号
          </button>
        </div>
      </div>

      {stats && (
        <>
          {/* 总览统计 */}
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-label">总账号数</div>
              <div className="stat-value">{stats.total || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">启用账号</div>
              <div className="stat-value">{stats.active_count || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总请求次数</div>
              <div className="stat-value">{formatNumber(stats.total_usage || 0)}</div>
            </div>
          </div>

          {/* 按类型统计 */}
          {stats.type_stats && stats.type_stats.length > 0 && (
            <div className="type-stats-section">
              <h3 className="section-title">按类型统计</h3>
              <div className="type-stats-cards">
                {stats.type_stats.map((typeStat) => (
                  <div key={typeStat.type} className={`type-stat-card type-stat-${typeStat.type}`}>
                    <div className="type-stat-header">
                      <span className="type-stat-name">{typeStat.type_name}</span>
                      <span className="type-stat-badge">{typeStat.type}</span>
                    </div>
                    <div className="type-stat-body">
                      <div className="type-stat-item">
                        <span className="type-stat-label">账号数</span>
                        <span className="type-stat-value">
                          {typeStat.active_count} / {typeStat.total_count}
                          <span className="type-stat-unit">启用/总数</span>
                        </span>
                      </div>
                      <div className="type-stat-item">
                        <span className="type-stat-label">总请求次数</span>
                        <span className="type-stat-value">{formatNumber(typeStat.total_usage)}</span>
                      </div>
                      <div className="type-stat-item">
                        <span className="type-stat-label">最后使用</span>
                        <span className="type-stat-value type-stat-time" title={formatDate(typeStat.last_used_at)}>
                          {formatRelativeTime(typeStat.last_used_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="filters">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="">全部类型</option>
          <option value="semantic_scholar">Semantic Scholar</option>
          <option value="ai_model">AI模型</option>
        </select>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={filterActive}
            onChange={(e) => setFilterActive(e.target.checked)}
          />
          <span>仅显示启用账号</span>
        </label>
      </div>

      <div className="accounts-table-container">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">暂无账号</div>
        ) : (
          <table className="accounts-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>类型</th>
                <th>优先级</th>
                <th>模型编码</th>
                <th>状态</th>
                <th>使用次数</th>
                <th>最后使用时间</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.id}</td>
                  <td>{account.name}</td>
                  <td>{getAccountTypeLabel(account.type)}</td>
                  <td>
                    <span className={`priority-badge priority-${account.priority || 0}`}>
                      {account.priority || 0}
                    </span>
                  </td>
                  <td className="model-codes-cell">{account.type === 'ai_model' ? getModelCodesLabel(account.config) : '-'}</td>
                  <td>{getStatusLabel(account.status)}</td>
                  <td>{account.usage_count || 0}</td>
                  <td>{formatDate(account.last_used_at)}</td>
                  <td>{formatDate(account.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-action btn-test"
                        onClick={() => handleTest(account.id)}
                        title="测试"
                      >
                        测试
                      </button>
                      <button
                        className="btn-action btn-edit"
                        onClick={() => handleEdit(account)}
                        title="编辑"
                      >
                        编辑
                      </button>
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(account.id)}
                        title="删除"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingAccount ? '编辑账号' : '添加账号'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-body">
              <div className="form-group">
                <label>账号名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入账号名称"
                  required
                />
              </div>

              <div className="form-group">
                <label>账号类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  disabled={!!editingAccount}
                  required
                >
                  <option value="semantic_scholar">Semantic Scholar</option>
                  <option value="ai_model">AI模型</option>
                </select>
              </div>

              {formData.type === 'semantic_scholar' && (
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="text"
                    value={formData.config.api_key || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        config: { ...formData.config, api_key: e.target.value },
                      })
                    }
                    placeholder="请输入Semantic Scholar API Key"
                    required
                  />
                </div>
              )}

              {formData.type === 'ai_model' && (
                <>
                  <div className="form-group">
                    <label>Base URL</label>
                    <input
                      type="text"
                      value={formData.config.base_url || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, base_url: e.target.value },
                        })
                      }
                      placeholder="https://api.example.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="text"
                      value={formData.config.api_key || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, api_key: e.target.value },
                        })
                      }
                      placeholder="请输入API Key"
                      required
                    />
                  </div>

                  <div className="model-codes-section">
                    <h4>模型编码配置</h4>
                    <small className="form-hint-section">
                      为不同级别的任务配置对应的模型编码。至少配置一个模型编码。
                    </small>

                    <div className="form-group">
                      <label>低级模型编码（Low）</label>
                      <input
                        type="text"
                        value={formData.config.model_low || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, model_low: e.target.value },
                          })
                        }
                        placeholder="例如: gpt-3.5-turbo, claude-3-haiku"
                      />
                      <small className="form-hint">
                        用于普通任务和基础对话
                      </small>
                    </div>

                    <div className="form-group">
                      <label>中级模型编码（Mid）</label>
                      <input
                        type="text"
                        value={formData.config.model_mid || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, model_mid: e.target.value },
                          })
                        }
                        placeholder="例如: gpt-4, claude-3-sonnet"
                      />
                      <small className="form-hint">
                        用于复杂分析和深度对话
                      </small>
                    </div>

                    <div className="form-group">
                      <label>高级模型编码（High）</label>
                      <input
                        type="text"
                        value={formData.config.model_high || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, model_high: e.target.value },
                          })
                        }
                        placeholder="例如: gpt-4-turbo, claude-3-opus"
                      />
                      <small className="form-hint">
                        用于最高质量的任务和专业分析
                      </small>
                    </div>
                  </div>

                  <div className="model-codes-section">
                    <h4>🔬 智能审稿专用模型</h4>
                    <small className="form-hint-section">
                      为智能审稿功能配置三个不同的模型，分别对应三位虚拟审稿人（Alpha、Beta、Gamma）。
                      如果不配置，将回退使用上面的高/中/低级模型。
                    </small>

                    <div className="form-group">
                      <label>审稿人 Alpha 模型</label>
                      <input
                        type="text"
                        value={formData.config.peer_review_model_1 || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, peer_review_model_1: e.target.value },
                          })
                        }
                        placeholder="例如: gpt-4-turbo, claude-3-opus"
                      />
                      <small className="form-hint">
                        审稿人 Alpha（α）使用的模型
                      </small>
                    </div>

                    <div className="form-group">
                      <label>审稿人 Beta 模型</label>
                      <input
                        type="text"
                        value={formData.config.peer_review_model_2 || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, peer_review_model_2: e.target.value },
                          })
                        }
                        placeholder="例如: gemini-1.5-pro, deepseek-chat"
                      />
                      <small className="form-hint">
                        审稿人 Beta（β）使用的模型
                      </small>
                    </div>

                    <div className="form-group">
                      <label>审稿人 Gamma 模型</label>
                      <input
                        type="text"
                        value={formData.config.peer_review_model_3 || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, peer_review_model_3: e.target.value },
                          })
                        }
                        placeholder="例如: qwen-max, glm-4"
                      />
                      <small className="form-hint">
                        审稿人 Gamma（γ）使用的模型
                      </small>
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>优先级</label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  min="0"
                  placeholder="0"
                />
                <small className="form-hint">
                  数字越小优先级越高，相同优先级的账号会随机选择
                </small>
              </div>

              <div className="form-group">
                <label>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: parseInt(e.target.value) })}
                  required
                >
                  <option value="1">启用</option>
                  <option value="0">停用</option>
                </select>
              </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingAccount ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThirdPartyAccounts;

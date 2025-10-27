import React, { useState, useEffect } from 'react';
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
      model: '',
    },
    status: 1,
  });

  useEffect(() => {
    loadAccounts();
    loadStats();
  }, [filterType, filterActive]);

  const loadAccounts = async () => {
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
  };

  const loadStats = async () => {
    try {
      const response = await adminAPI.getThirdPartyAccountStats();
      if (response.data.code === 0 && response.data.data) {
        setStats(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleCreate = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'semantic_scholar',
      config: {
        api_key: '',
        base_url: '',
        model: '',
      },
      status: 1,
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
      if (formData.config.model) {
        config.model = formData.config.model;
      }
    }

    const data = {
      name: formData.name,
      type: formData.type,
      config,
      status: formData.status,
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
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-label">Semantic Scholar账号</div>
            <div className="stat-value">{stats.semantic_scholar || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">AI模型账号</div>
            <div className="stat-value">{stats.ai_model || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">总账号数</div>
            <div className="stat-value">{stats.total || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">启用账号</div>
            <div className="stat-value">{stats.active || 0}</div>
          </div>
        </div>
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
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingAccount ? '编辑账号' : '添加账号'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
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
                  <div className="form-group">
                    <label>模型名称（可选）</label>
                    <input
                      type="text"
                      value={formData.config.model || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, model: e.target.value },
                        })
                      }
                      placeholder="例如: gpt-4"
                    />
                  </div>
                </>
              )}

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

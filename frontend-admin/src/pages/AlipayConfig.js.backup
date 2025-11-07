import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './AlipayConfig.css';

const AlipayConfig = () => {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [formData, setFormData] = useState({
    app_id: '',
    private_key: '',
    alipay_public_key: '',
    notify_url: '',
    return_url: '',
    is_sandbox: false,
    is_active: false,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAlipayConfigs();
      if (response.data.code === 0 && response.data.data) {
        setConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载配置列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setFormData({
      app_id: '',
      private_key: '',
      alipay_public_key: '',
      notify_url: `${window.location.origin}/api/v1/payment/alipay/notify`,
      return_url: `${window.location.origin}/orders`,
      is_sandbox: false,
      is_active: false,
    });
    setShowModal(true);
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setFormData({
      app_id: config.app_id,
      private_key: config.private_key === '***MASKED***' ? '' : config.private_key,
      alipay_public_key: config.alipay_public_key === '***MASKED***' ? '' : config.alipay_public_key,
      notify_url: config.notify_url,
      return_url: config.return_url || '',
      is_sandbox: config.is_sandbox,
      is_active: config.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除此配置？')) return;

    try {
      const response = await adminAPI.deleteAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadConfigs();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivate = async (id) => {
    try {
      const response = await adminAPI.activateAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadConfigs();
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      if (editingConfig) {
        // Update existing config
        const updateData = { ...formData };
        // Only include keys that are not masked (i.e., user entered new values)
        if (!updateData.private_key) delete updateData.private_key;
        if (!updateData.alipay_public_key) delete updateData.alipay_public_key;

        response = await adminAPI.updateAlipayConfig(editingConfig.id, updateData);
      } else {
        // Create new config
        response = await adminAPI.createAlipayConfig(formData);
      }

      if (response.data.code === 0) {
        showToast(editingConfig ? '更新成功' : '创建成功', 'success');
        setShowModal(false);
        loadConfigs();
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="alipay-config">
      <div className="page-header">
        <h1>支付宝配置管理</h1>
        <button onClick={handleCreate} className="btn-primary">
          <span className="icon">+</span> 新增配置
        </button>
      </div>

      {loading && configs.length === 0 ? (
        <div className="loading-state">加载中...</div>
      ) : (
        <div className="configs-list">
          {configs.length === 0 ? (
            <div className="empty-state">
              <p>暂无配置</p>
              <button onClick={handleCreate} className="btn-primary">
                创建第一个配置
              </button>
            </div>
          ) : (
            <div className="configs-grid">
              {configs.map(config => (
                <div key={config.id} className={`config-card ${config.is_active ? 'active' : ''}`}>
                  <div className="card-header">
                    <div className="card-title">
                      <h3>配置 #{config.id}</h3>
                      {config.is_active && <span className="badge active">当前激活</span>}
                      {config.is_sandbox && <span className="badge sandbox">沙箱环境</span>}
                    </div>
                    <div className="card-actions">
                      {!config.is_active && (
                        <button
                          onClick={() => handleActivate(config.id)}
                          className="btn-activate"
                          title="激活此配置"
                        >
                          激活
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(config)}
                        className="btn-edit"
                        title="编辑"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(config.id)}
                        className="btn-delete"
                        title="删除"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="card-content">
                    <div className="info-row">
                      <span className="label">应用ID:</span>
                      <span className="value">{config.app_id}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">应用私钥:</span>
                      <span className="value masked">{config.private_key}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">支付宝公钥:</span>
                      <span className="value masked">{config.alipay_public_key}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">回调地址:</span>
                      <span className="value url">{config.notify_url}</span>
                    </div>
                    {config.return_url && (
                      <div className="info-row">
                        <span className="label">返回地址:</span>
                        <span className="value url">{config.return_url}</span>
                      </div>
                    )}
                    <div className="info-row">
                      <span className="label">网关:</span>
                      <span className="value url">{config.gateway_url}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">创建时间:</span>
                      <span className="value">{new Date(config.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingConfig ? '编辑配置' : '新增配置'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>应用ID *</label>
                <input
                  type="text"
                  name="app_id"
                  value={formData.app_id}
                  onChange={handleChange}
                  placeholder="请输入支付宝应用ID"
                  required
                />
                <small>从支付宝开放平台获取</small>
              </div>

              <div className="form-group">
                <label>应用私钥 (PKCS8格式) {!editingConfig && '*'}</label>
                <textarea
                  name="private_key"
                  value={formData.private_key}
                  onChange={handleChange}
                  placeholder={editingConfig ? "留空表示不修改" : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                  rows={6}
                  required={!editingConfig}
                />
                <small>{editingConfig ? "留空表示不修改现有私钥" : "请妥善保管私钥，不要泄露"}</small>
              </div>

              <div className="form-group">
                <label>支付宝公钥 {!editingConfig && '*'}</label>
                <textarea
                  name="alipay_public_key"
                  value={formData.alipay_public_key}
                  onChange={handleChange}
                  placeholder={editingConfig ? "留空表示不修改" : "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                  rows={6}
                  required={!editingConfig}
                />
                <small>{editingConfig ? "留空表示不修改现有公钥" : "从支付宝开放平台获取"}</small>
              </div>

              <div className="form-group">
                <label>异步通知地址 *</label>
                <input
                  type="url"
                  name="notify_url"
                  value={formData.notify_url}
                  onChange={handleChange}
                  placeholder="https://yourdomain.com/api/v1/payment/alipay/notify"
                  required
                />
                <small>支付宝将支付结果发送到此地址</small>
              </div>

              <div className="form-group">
                <label>同步返回地址</label>
                <input
                  type="url"
                  name="return_url"
                  value={formData.return_url}
                  onChange={handleChange}
                  placeholder="https://yourdomain.com/orders"
                />
                <small>用户支付完成后跳转的页面</small>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="is_sandbox"
                    checked={formData.is_sandbox}
                    onChange={handleChange}
                  />
                  <span>沙箱环境（用于测试）</span>
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                  />
                  <span>设为激活配置</span>
                </label>
                <small>激活后将作为默认支付配置使用</small>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  取消
                </button>
                <button type="submit" disabled={loading} className="btn-submit">
                  {loading ? '提交中...' : '确定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlipayConfig;

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './WeChatConfig.css';

const WeChatConfig = () => {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [formData, setFormData] = useState({
    app_id: '',
    app_secret: '',
    redirect_uri: '',
    scope: 'snsapi_login',
    is_active: false,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getWeChatConfigs();
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
      app_secret: '',
      redirect_uri: `${window.location.origin}/wechat/callback`,
      scope: 'snsapi_login',
      is_active: false,
    });
    setShowModal(true);
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setFormData({
      app_id: config.app_id,
      app_secret: config.app_secret === '***MASKED***' ? '' : config.app_secret,
      redirect_uri: config.redirect_uri,
      scope: config.scope,
      is_active: config.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除此配置？')) return;

    try {
      const response = await adminAPI.deleteWeChatConfig(id);
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
      const response = await adminAPI.activateWeChatConfig(id);
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
        // Only include secret if user entered a new value
        if (!updateData.app_secret) delete updateData.app_secret;

        response = await adminAPI.updateWeChatConfig(editingConfig.id, updateData);
      } else {
        // Create new config
        response = await adminAPI.createWeChatConfig(formData);
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
    <div className="wechat-config">
      <div className="page-header">
        <h1>微信登录配置</h1>
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
                      <span className="label">应用ID (AppID):</span>
                      <span className="value">{config.app_id}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">应用密钥 (AppSecret):</span>
                      <span className="value masked">{config.app_secret}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">回调地址:</span>
                      <span className="value url">{config.redirect_uri}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">授权作用域:</span>
                      <span className="value">{config.scope}</span>
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
                <label>应用ID (AppID) *</label>
                <input
                  type="text"
                  name="app_id"
                  value={formData.app_id}
                  onChange={handleChange}
                  placeholder="请输入微信开放平台应用AppID"
                  required
                />
                <small>从微信开放平台获取</small>
              </div>

              <div className="form-group">
                <label>应用密钥 (AppSecret) *</label>
                <input
                  type="password"
                  name="app_secret"
                  value={formData.app_secret}
                  onChange={handleChange}
                  placeholder={editingConfig ? "留空表示不修改" : "请输入应用密钥"}
                  required={!editingConfig}
                />
                <small>请妥善保管密钥，不要泄露</small>
              </div>

              <div className="form-group">
                <label>回调地址 (Redirect URI) *</label>
                <input
                  type="url"
                  name="redirect_uri"
                  value={formData.redirect_uri}
                  onChange={handleChange}
                  placeholder="https://yourdomain.com/wechat/callback"
                  required
                />
                <small>用户授权后跳转的地址，需要在微信开放平台配置</small>
              </div>

              <div className="form-group">
                <label>授权作用域 *</label>
                <select
                  name="scope"
                  value={formData.scope}
                  onChange={handleChange}
                  required
                >
                  <option value="snsapi_login">snsapi_login (网页扫码登录)</option>
                  <option value="snsapi_userinfo">snsapi_userinfo (移动应用授权)</option>
                  <option value="snsapi_base">snsapi_base (静默授权)</option>
                </select>
                <small>
                  snsapi_login: PC网站扫码登录（推荐）<br/>
                  snsapi_userinfo: 获取用户详细信息<br/>
                  snsapi_base: 只获取OpenID
                </small>
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
                <small>激活后将作为默认微信登录配置使用</small>
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

export default WeChatConfig;

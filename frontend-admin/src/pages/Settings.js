import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './Settings.css';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(false);

  // Email configuration state
  const [emailConfig, setEmailConfig] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
  });

  // Privacy policy state
  const [privacyPolicy, setPrivacyPolicy] = useState({
    content: '',
    version: '',
  });

  // System config state
  const [systemConfig, setSystemConfig] = useState({
    requireEmailVerification: true,
  });

  useEffect(() => {
    if (activeTab === 'privacy') {
      loadPrivacyPolicy();
    } else if (activeTab === 'system') {
      loadSystemConfig();
    }
  }, [activeTab]);

  const loadPrivacyPolicy = async () => {
    try {
      const response = await fetch('/api/v1/config/privacy-policy');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        setPrivacyPolicy({
          content: data.data.content || '',
          version: data.data.version || '',
        });
      }
    } catch (err) {
      console.error('Failed to load privacy policy:', err);
    }
  };

  const loadSystemConfig = async () => {
    try {
      const response = await fetch('/api/v1/config/system');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        setSystemConfig({
          requireEmailVerification: data.data.require_email_verification ?? true,
        });
      }
    } catch (err) {
      console.error('Failed to load system config:', err);
    }
  };

  const handleEmailConfigChange = (e) => {
    setEmailConfig({
      ...emailConfig,
      [e.target.name]: e.target.value,
    });
  };

  const handlePrivacyPolicyChange = (e) => {
    setPrivacyPolicy({
      ...privacyPolicy,
      [e.target.name]: e.target.value,
    });
  };

  const handleEmailConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updateEmailConfig(emailConfig);

      if (response.data.code === 0) {
        showToast('邮箱配置已成功保存', 'success');
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacyPolicySubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updatePrivacyPolicy(
        privacyPolicy.content,
        privacyPolicy.version
      );

      if (response.data.code === 0) {
        showToast('隐私协议已成功更新', 'success');
      } else {
        showToast(response.data.message || '更新失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '更新失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSystemConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updateSystemConfig({
        require_email_verification: systemConfig.requireEmailVerification,
      });

      if (response.data.code === 0) {
        showToast('系统配置已成功保存', 'success');
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>系统设置</h1>
        <p>配置系统参数和应用设置</p>
      </div>

      <div className="settings-tabs">
        <button
          className={`tab-button ${activeTab === 'email' ? 'active' : ''}`}
          onClick={() => setActiveTab('email')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
          </svg>
          邮箱服务器
        </button>
        <button
          className={`tab-button ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd"/>
          </svg>
          隐私协议
        </button>
        <button
          className={`tab-button ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
          </svg>
          系统配置
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'email' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>邮箱服务器配置</h2>
              <p>配置SMTP服务器用于发送验证邮件</p>
            </div>

            <form onSubmit={handleEmailConfigSubmit} className="settings-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="smtpHost">SMTP服务器地址</label>
                  <input
                    type="text"
                    id="smtpHost"
                    name="smtpHost"
                    className="input"
                    value={emailConfig.smtpHost}
                    onChange={handleEmailConfigChange}
                    placeholder="smtp.example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="smtpPort">SMTP端口</label>
                  <input
                    type="number"
                    id="smtpPort"
                    name="smtpPort"
                    className="input"
                    value={emailConfig.smtpPort}
                    onChange={handleEmailConfigChange}
                    placeholder="587"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="smtpUser">SMTP用户名</label>
                  <input
                    type="text"
                    id="smtpUser"
                    name="smtpUser"
                    className="input"
                    value={emailConfig.smtpUser}
                    onChange={handleEmailConfigChange}
                    placeholder="user@example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="smtpPassword">SMTP密码</label>
                  <input
                    type="password"
                    id="smtpPassword"
                    name="smtpPassword"
                    className="input"
                    value={emailConfig.smtpPassword}
                    onChange={handleEmailConfigChange}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fromEmail">发件人邮箱</label>
                  <input
                    type="email"
                    id="fromEmail"
                    name="fromEmail"
                    className="input"
                    value={emailConfig.fromEmail}
                    onChange={handleEmailConfigChange}
                    placeholder="noreply@example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="fromName">发件人名称</label>
                  <input
                    type="text"
                    id="fromName"
                    name="fromName"
                    className="input"
                    value={emailConfig.fromName}
                    onChange={handleEmailConfigChange}
                    placeholder="Scholar"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      <span style={{ marginLeft: '0.5rem' }}>保存中...</span>
                    </>
                  ) : (
                    '保存配置'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>隐私协议配置</h2>
              <p>编辑用户注册和登录时显示的隐私协议内容</p>
            </div>

            <form onSubmit={handlePrivacyPolicySubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="version">版本号</label>
                <input
                  type="text"
                  id="version"
                  name="version"
                  className="input"
                  value={privacyPolicy.version}
                  onChange={handlePrivacyPolicyChange}
                  placeholder="1.0"
                  required
                />
                <small className="form-hint">更新版本号以标识新版本的隐私协议</small>
              </div>

              <div className="form-group">
                <label htmlFor="content">隐私协议内容</label>
                <textarea
                  id="content"
                  name="content"
                  className="textarea"
                  value={privacyPolicy.content}
                  onChange={handlePrivacyPolicyChange}
                  rows={15}
                  placeholder="请输入隐私协议的详细内容..."
                  required
                />
                <small className="form-hint">支持换行，用户将看到与您输入相同格式的内容</small>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      <span style={{ marginLeft: '0.5rem' }}>更新中...</span>
                    </>
                  ) : (
                    '更新隐私协议'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>系统配置</h2>
              <p>配置系统级别的功能设置</p>
            </div>

            <form onSubmit={handleSystemConfigSubmit} className="settings-form">
              <div className="form-group">
                <label className="toggle-label">
                  <span className="toggle-label-text">
                    <span className="toggle-title">邮箱验证码验证</span>
                    <small className="form-hint">启用后，用户登录和注册时需要输入邮箱验证码</small>
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={systemConfig.requireEmailVerification}
                      onChange={(e) => setSystemConfig({
                        ...systemConfig,
                        requireEmailVerification: e.target.checked
                      })}
                    />
                    <span className="slider"></span>
                  </label>
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      <span style={{ marginLeft: '0.5rem' }}>保存中...</span>
                    </>
                  ) : (
                    '保存配置'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;

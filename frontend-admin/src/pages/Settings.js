import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './Settings.css';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Saved email configuration (from backend)
  const [savedEmailConfig, setSavedEmailConfig] = useState(null);

  // Editing mode
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  // Email configuration state (for editing)
  const [emailConfig, setEmailConfig] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
  });

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // Saved SMS configuration (from backend)
  const [savedSMSConfig, setSavedSMSConfig] = useState(null);

  // Editing mode for SMS
  const [isEditingSMS, setIsEditingSMS] = useState(false);

  // SMS configuration state (for editing)
  const [smsConfig, setSMSConfig] = useState({
    accessKeyId: '',
    accessSecret: '',
    signName: '',
    templateCode: '',
    templateContent: '',
    endpoint: 'dypnsapi.aliyuncs.com', // Phone Number Service endpoint
  });

  // Test SMS state
  const [testPhone, setTestPhone] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);

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
    if (activeTab === 'email') {
      loadEmailConfig();
    } else if (activeTab === 'sms') {
      loadSMSConfig();
    } else if (activeTab === 'privacy') {
      loadPrivacyPolicy();
    } else if (activeTab === 'system') {
      loadSystemConfig();
    }
  }, [activeTab]);

  const loadEmailConfig = async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getEmailConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedEmailConfig(response.data.data);
      } else {
        setSavedEmailConfig(null);
      }
    } catch (err) {
      console.error('Failed to load email config:', err);
      setSavedEmailConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

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

  const handleStartEditing = () => {
    if (savedEmailConfig) {
      // Load saved config into editing form
      setEmailConfig({
        smtpHost: savedEmailConfig.smtp_host || '',
        smtpPort: savedEmailConfig.smtp_port || '',
        smtpUser: savedEmailConfig.smtp_user || '',
        smtpPassword: '', // Don't load masked password
        fromEmail: savedEmailConfig.from_email || '',
        fromName: savedEmailConfig.from_name || '',
      });
    }
    setIsEditingEmail(true);
  };

  const handleCancelEditing = () => {
    setIsEditingEmail(false);
    setEmailConfig({
      smtpHost: '',
      smtpPort: '',
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: '',
    });
  };

  const handleEmailConfigChange = (e) => {
    const { name, value } = e.target;
    setEmailConfig({
      ...emailConfig,
      // Convert smtpPort to number
      [name]: name === 'smtpPort' ? (value === '' ? '' : parseInt(value, 10)) : value,
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
      // Ensure smtpPort is a number before sending
      const configToSend = {
        ...emailConfig,
        smtpPort: typeof emailConfig.smtpPort === 'string' ? parseInt(emailConfig.smtpPort, 10) : emailConfig.smtpPort
      };

      const response = await adminAPI.updateEmailConfig(configToSend);

      if (response.data.code === 0) {
        showToast('邮箱配置已成功保存', 'success');
        setIsEditingEmail(false);
        loadEmailConfig(); // Reload saved config
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();

    if (!testEmail || !testEmail.includes('@')) {
      showToast('请输入有效的邮箱地址', 'error');
      return;
    }

    // Use saved config or editing config
    const configToTest = isEditingEmail ? emailConfig : {
      smtpHost: savedEmailConfig?.smtp_host || '',
      smtpPort: savedEmailConfig?.smtp_port || '',
      smtpUser: savedEmailConfig?.smtp_user || '',
      smtpPassword: savedEmailConfig?.smtp_password || '',
      fromEmail: savedEmailConfig?.from_email || '',
      fromName: savedEmailConfig?.from_name || '',
    };

    // Validate email config
    if (!configToTest.smtpHost || !configToTest.smtpPort || !configToTest.smtpUser || !configToTest.smtpPassword) {
      showToast('请先配置邮箱服务器', 'error');
      return;
    }

    setTestingEmail(true);

    try {
      // Ensure smtpPort is a number
      const testConfig = {
        ...configToTest,
        smtpPort: typeof configToTest.smtpPort === 'string' ? parseInt(configToTest.smtpPort, 10) : configToTest.smtpPort,
        testEmail: testEmail
      };

      const response = await adminAPI.testEmailConfig(testConfig);

      if (response.data.code === 0) {
        showToast('测试邮件已发送成功，请检查收件箱', 'success');
        setTestEmail('');
      } else {
        showToast(response.data.message || '发送测试邮件失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '发送测试邮件失败，请检查配置', 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  // SMS Configuration Handlers
  const loadSMSConfig = async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getSMSConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedSMSConfig(response.data.data);
        setIsEditingSMS(false);
      } else {
        setSavedSMSConfig(null);
      }
    } catch (err) {
      console.error('Failed to load SMS config:', err);
      setSavedSMSConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleStartEditingSMS = () => {
    if (savedSMSConfig) {
      setSMSConfig({
        accessKeyId: savedSMSConfig.access_key_id || '',
        accessSecret: '', // Don't pre-fill for security
        signName: savedSMSConfig.sign_name || '',
        templateCode: savedSMSConfig.template_code || '',
        templateContent: savedSMSConfig.template_content || '',
        endpoint: savedSMSConfig.endpoint || 'dypnsapi.aliyuncs.com',
      });
    }
    setIsEditingSMS(true);
  };

  const handleCancelEditingSMS = () => {
    setIsEditingSMS(false);
    setSMSConfig({
      accessKeyId: '',
      accessSecret: '',
      signName: '',
      templateCode: '',
      templateContent: '',
      endpoint: 'dypnsapi.aliyuncs.com',
    });
  };

  const handleSMSConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const configToSend = {
        access_key_id: smsConfig.accessKeyId,
        access_secret: smsConfig.accessSecret,
        sign_name: smsConfig.signName,
        template_code: smsConfig.templateCode,
        template_content: smsConfig.templateContent,
        endpoint: smsConfig.endpoint,
        is_active: true
      };

      const response = await adminAPI.updateSMSConfig(configToSend);

      if (response.data.code === 0) {
        showToast('短信配置已成功保存', 'success');
        setIsEditingSMS(false);
        loadSMSConfig(); // Reload saved config
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSMS = async (e) => {
    e.preventDefault();

    if (!testPhone || !/^1[3-9]\d{9}$/.test(testPhone)) {
      showToast('请输入有效的手机号码', 'error');
      return;
    }

    setTestingSMS(true);

    try {
      let testConfig;

      if (isEditingSMS) {
        // Editing mode: send the config being edited
        if (!smsConfig.accessKeyId || !smsConfig.accessSecret || !smsConfig.signName || !smsConfig.templateCode || !smsConfig.templateContent) {
          showToast('请先完整填写短信配置', 'error');
          setTestingSMS(false);
          return;
        }

        testConfig = {
          access_key_id: smsConfig.accessKeyId,
          access_secret: smsConfig.accessSecret,
          sign_name: smsConfig.signName,
          template_code: smsConfig.templateCode,
          template_content: smsConfig.templateContent,
          endpoint: smsConfig.endpoint,
          phone_number: testPhone,
          use_saved_config: false
        };
      } else {
        // Using saved config: just send phone number, backend will load config from DB
        if (!savedSMSConfig) {
          showToast('未找到已保存的短信配置', 'error');
          setTestingSMS(false);
          return;
        }

        testConfig = {
          phone_number: testPhone,
          use_saved_config: true
        };
      }

      const response = await adminAPI.testSMSConfig(testConfig);

      if (response.data.code === 0) {
        showToast('测试短信已发送成功，请检查手机', 'success');
        setTestPhone('');
      } else {
        showToast(response.data.message || '发送测试短信失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '发送测试短信失败，请检查配置', 'error');
    } finally {
      setTestingSMS(false);
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
          className={`tab-button ${activeTab === 'sms' ? 'active' : ''}`}
          onClick={() => setActiveTab('sms')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          短信服务
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

            {loadingConfig ? (
              <div className="loading-state">
                <span className="spinner"></span>
                <span>加载配置中...</span>
              </div>
            ) : !isEditingEmail && savedEmailConfig ? (
              /* Saved Config Display */
              <div className="saved-config-container">
                <div className="saved-config-header">
                  <div className="saved-config-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span>已保存的配置</span>
                  </div>
                  <button
                    className="btn btn-outline"
                    onClick={handleStartEditing}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                    </svg>
                    编辑配置
                  </button>
                </div>

                <div className="saved-config-grid">
                  <div className="config-item">
                    <label>SMTP服务器地址</label>
                    <div className="config-value">{savedEmailConfig.smtp_host}</div>
                  </div>

                  <div className="config-item">
                    <label>SMTP端口</label>
                    <div className="config-value">{savedEmailConfig.smtp_port}</div>
                  </div>

                  <div className="config-item">
                    <label>SMTP用户名</label>
                    <div className="config-value">{savedEmailConfig.smtp_user}</div>
                  </div>

                  <div className="config-item">
                    <label>SMTP密码</label>
                    <div className="config-value">••••••••</div>
                  </div>

                  <div className="config-item">
                    <label>发件人邮箱</label>
                    <div className="config-value">{savedEmailConfig.from_email}</div>
                  </div>

                  <div className="config-item">
                    <label>发件人名称</label>
                    <div className="config-value">{savedEmailConfig.from_name}</div>
                  </div>
                </div>
              </div>
            ) : !isEditingEmail && !savedEmailConfig ? (
              /* No Config State */
              <div className="no-config-state">
                <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                <p>尚未配置邮箱服务器</p>
                <button
                  className="btn btn-primary"
                  onClick={() => setIsEditingEmail(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                  </svg>
                  开始配置
                </button>
              </div>
            ) : (
              /* Editing Form */
              <>
                <div className="editing-header">
                  <div className="editing-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                    </svg>
                    <span>{savedEmailConfig ? '编辑配置' : '新建配置'}</span>
                  </div>
                </div>

                <form onSubmit={handleEmailConfigSubmit} className="settings-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="smtpHost">SMTP服务器地址 *</label>
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
                      <label htmlFor="smtpPort">SMTP端口 *</label>
                      <input
                        type="number"
                        id="smtpPort"
                        name="smtpPort"
                        className="input"
                        value={emailConfig.smtpPort}
                        onChange={handleEmailConfigChange}
                        placeholder="587 (STARTTLS) 或 465 (SSL)"
                        required
                      />
                      <small className="form-hint">587端口使用STARTTLS，465端口使用SSL</small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="smtpUser">SMTP用户名 *</label>
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
                      <label htmlFor="smtpPassword">SMTP密码 *</label>
                      <input
                        type="password"
                        id="smtpPassword"
                        name="smtpPassword"
                        className="input"
                        value={emailConfig.smtpPassword}
                        onChange={handleEmailConfigChange}
                        placeholder={savedEmailConfig ? "留空则不修改密码" : "输入SMTP密码"}
                        required={!savedEmailConfig}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="fromEmail">发件人邮箱 *</label>
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
                      <label htmlFor="fromName">发件人名称 *</label>
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
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleCancelEditing}
                      disabled={loading}
                    >
                      取消
                    </button>
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
              </>
            )}

            {/* Test Email Section - Always visible */}
            <div className="test-email-section">
              <div className="section-header">
                <h3>测试邮件发送</h3>
                <p>验证邮箱配置是否正确</p>
              </div>

              {!savedEmailConfig && !isEditingEmail ? (
                <div className="test-email-disabled">
                  <p>请先配置邮箱服务器后再测试</p>
                </div>
              ) : (
                <form onSubmit={handleTestEmail} className="test-email-form">
                  <div className="form-group">
                    <label htmlFor="testEmail">收件邮箱</label>
                    <input
                      type="email"
                      id="testEmail"
                      className="input"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="输入接收测试邮件的邮箱地址"
                      disabled={testingEmail}
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={testingEmail || !testEmail}
                    >
                      {testingEmail ? (
                        <>
                          <span className="spinner"></span>
                          <span style={{ marginLeft: '0.5rem' }}>发送中...</span>
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                          </svg>
                          发送测试邮件
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>短信服务配置</h2>
              <p>配置阿里云短信服务用于发送验证码</p>
            </div>

            {loadingConfig ? (
              <div className="loading-state">
                <span className="spinner"></span>
                <span>加载配置中...</span>
              </div>
            ) : !isEditingSMS && savedSMSConfig ? (
              /* Saved Config Display */
              <div className="saved-config-container">
                <div className="saved-config-header">
                  <div className="saved-config-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span>已保存的配置</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleStartEditingSMS}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                    </svg>
                    编辑配置
                  </button>
                </div>

                <div className="saved-config-grid">
                  <div className="config-item">
                    <label className="config-label">Access Key ID</label>
                    <div className="config-value">{savedSMSConfig.access_key_id}</div>
                  </div>

                  <div className="config-item">
                    <label className="config-label">Access Secret</label>
                    <div className="config-value">********</div>
                  </div>

                  <div className="config-item">
                    <label className="config-label">签名名称</label>
                    <div className="config-value">{savedSMSConfig.sign_name}</div>
                  </div>

                  <div className="config-item">
                    <label className="config-label">模板代码</label>
                    <div className="config-value">{savedSMSConfig.template_code}</div>
                  </div>

                  <div className="config-item" style={{ gridColumn: '1 / -1' }}>
                    <label className="config-label">模板内容</label>
                    <div className="config-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{savedSMSConfig.template_content}</div>
                  </div>

                  <div className="config-item">
                    <label className="config-label">接入点</label>
                    <div className="config-value">{savedSMSConfig.endpoint}</div>
                  </div>
                </div>
              </div>
            ) : !isEditingSMS && !savedSMSConfig ? (
              /* Empty State */
              <div className="no-config-state">
                <svg className="empty-icon" width="64" height="64" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                </svg>
                <p>尚未配置短信服务</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsEditingSMS(true)}
                >
                  开始配置
                </button>
              </div>
            ) : (
              /* Editing Mode */
              <div>
                <div className="editing-header">
                  <div className="editing-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                    </svg>
                    <span>{savedSMSConfig ? '编辑配置' : '新建配置'}</span>
                  </div>
                </div>

                <form onSubmit={handleSMSConfigSubmit} className="settings-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="accessKeyId">Access Key ID *</label>
                      <input
                        type="text"
                        id="accessKeyId"
                        name="accessKeyId"
                        className="input"
                        value={smsConfig.accessKeyId}
                        onChange={(e) => setSMSConfig({ ...smsConfig, accessKeyId: e.target.value })}
                        placeholder="请输入 Access Key ID"
                        required
                      />
                      <small className="form-hint">阿里云账号的 Access Key ID</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="accessSecret">Access Secret *</label>
                      <input
                        type="password"
                        id="accessSecret"
                        name="accessSecret"
                        className="input"
                        value={smsConfig.accessSecret}
                        onChange={(e) => setSMSConfig({ ...smsConfig, accessSecret: e.target.value })}
                        placeholder="请输入 Access Secret"
                        required
                      />
                      <small className="form-hint">阿里云账号的 Access Secret</small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="signName">签名名称 *</label>
                      <input
                        type="text"
                        id="signName"
                        name="signName"
                        className="input"
                        value={smsConfig.signName}
                        onChange={(e) => setSMSConfig({ ...smsConfig, signName: e.target.value })}
                        placeholder="请输入短信签名"
                        required
                      />
                      <small className="form-hint">在阿里云短信服务中创建的签名名称</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="templateCode">模板代码 *</label>
                      <input
                        type="text"
                        id="templateCode"
                        name="templateCode"
                        className="input"
                        value={smsConfig.templateCode}
                        onChange={(e) => setSMSConfig({ ...smsConfig, templateCode: e.target.value })}
                        placeholder="请输入模板代码"
                        required
                      />
                      <small className="form-hint">在阿里云短信服务中创建的模板代码</small>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="templateContent">模板内容 *</label>
                    <textarea
                      id="templateContent"
                      name="templateContent"
                      className="input"
                      rows="3"
                      value={smsConfig.templateContent}
                      onChange={(e) => setSMSConfig({ ...smsConfig, templateContent: e.target.value })}
                      placeholder="请输入模板内容，例如：您的验证码是${code},有效期为5分钟,请勿泄露给他人。"
                      required
                      style={{ resize: 'vertical' }}
                    />
                    <small className="form-hint">
                      模板内容需要与阿里云模板一致，使用 $&#123;变量名&#125; 表示变量，如: $&#123;code&#125;、$&#123;min&#125; 等
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="endpoint">接入点</label>
                    <input
                      type="text"
                      id="endpoint"
                      name="endpoint"
                      className="input"
                      value={smsConfig.endpoint}
                      onChange={(e) => setSMSConfig({ ...smsConfig, endpoint: e.target.value })}
                      placeholder="dypnsapi.aliyuncs.com"
                    />
                    <small className="form-hint">阿里云号码认证服务接入点，默认为 dypnsapi.aliyuncs.com (用于验证码短信)</small>
                  </div>

                  <div className="form-actions">
                    {savedSMSConfig && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleCancelEditingSMS}
                        disabled={loading}
                      >
                        取消
                      </button>
                    )}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
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

            <div className="divider"></div>

            {/* Test SMS Section */}
            {(savedSMSConfig || isEditingSMS) && (
              <div className="test-section">
                <h3>测试短信发送</h3>
                <p className="test-description">
                  发送测试短信验证配置是否正确。测试验证码为 123456，有效期10分钟。
                </p>
                <form onSubmit={handleTestSMS} className="test-form">
                  <div className="test-input-group">
                    <input
                      type="tel"
                      className="input"
                      placeholder="请输入手机号码（如：13800138000）"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      disabled={testingSMS}
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={testingSMS || !testPhone}
                    >
                      {testingSMS ? (
                        <>
                          <span className="spinner"></span>
                          <span style={{ marginLeft: '0.5rem' }}>发送中...</span>
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                          </svg>
                          发送测试短信
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
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

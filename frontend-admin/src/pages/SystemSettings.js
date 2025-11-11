import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import VerifyPasswordModal from '../components/VerifyPasswordModal';
import SensitiveField from '../components/SensitiveField';
import './SystemSettings.css';

const SystemSettings = () => {
  const location = useLocation();

  // Read initial tab from URL query parameter
  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    return tab || 'email'; // Default to email tab
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // 支付宝配置
  const [alipayConfigs, setAlipayConfigs] = useState([]);
  const [showAlipayModal, setShowAlipayModal] = useState(false);
  const [editingAlipay, setEditingAlipay] = useState(null);
  const [alipayForm, setAlipayForm] = useState({
    app_id: '',
    private_key: '',
    alipay_public_key: '',
    notify_url: '',
    return_url: '',
    is_sandbox: false,
    is_active: false,
  });

  // 微信配置
  const [wechatConfigs, setWechatConfigs] = useState([]);
  const [showWechatModal, setShowWechatModal] = useState(false);
  const [editingWechat, setEditingWechat] = useState(null);
  const [wechatForm, setWechatForm] = useState({
    app_id: '',
    app_secret: '',
    redirect_uri: '',
    scope: 'snsapi_login',
    is_active: false,
  });

  // 邮件配置
  const [savedEmailConfig, setSavedEmailConfig] = useState(null);
  const [realEmailPassword, setRealEmailPassword] = useState(null); // 存储真实密码
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailConfig, setEmailConfig] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
  });
  const [testEmail, setTestEmail] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // 短信配置
  const [savedSMSConfig, setSavedSMSConfig] = useState(null);
  const [realSMSSecret, setRealSMSSecret] = useState(null); // 存储真实密钥
  const [isEditingSMS, setIsEditingSMS] = useState(false);
  const [smsConfig, setSMSConfig] = useState({
    accessKeyId: '',
    accessSecret: '',
    signName: '',
    templateCode: '',
    templateContent: '',
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const [testPhone, setTestPhone] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);

  // 隐私政策
  const [privacyPolicy, setPrivacyPolicy] = useState({
    content: '',
    version: '',
  });

  // 服务条款
  const [termsOfService, setTermsOfService] = useState({
    content: '',
    version: '',
  });

  // 系统配置
  const [systemConfig, setSystemConfig] = useState({
    requireEmailVerification: true,
    enableTurnstile: false,
    turnstileSiteKey: '',
    turnstileSecretKey: '',
  });

  // 微信公众号配置
  const [savedWechatOfficialConfig, setSavedWechatOfficialConfig] = useState(null);
  const [realWechatOfficialConfig, setRealWechatOfficialConfig] = useState(null); // 存储真实敏感数据
  const [isEditingWechatOfficial, setIsEditingWechatOfficial] = useState(false);
  const [wechatOfficialConfig, setWechatOfficialConfig] = useState({
    app_id: '',
    app_secret: '',
    token: '',
    encoding_aes_key: '',
    encryption_mode: 'plaintext',
    auto_reply_enabled: false,
    ai_model_level: 'low',
    system_prompt: '',
  });

  // Update tab when URL changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location.search, activeTab]);

  useEffect(() => {
    loadTabData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadTabData = () => {
    switch (activeTab) {
      case 'alipay':
        loadAlipayConfigs();
        break;
      case 'wechat':
        loadWechatConfigs();
        break;
      case 'wechat-official':
        loadWechatOfficialConfig();
        break;
      case 'email':
        loadEmailConfig();
        break;
      case 'sms':
        loadSMSConfig();
        break;
      case 'privacy':
        loadPrivacyPolicy();
        break;
      case 'terms':
        loadTermsOfService();
        break;
      case 'system':
        loadSystemConfig();
        break;
      default:
        break;
    }
  };

  // Password verification handlers
  const handleVerified = async () => {
    setIsVerified(true);
    setShowVerifyModal(false);

    // Load real email password if we're on email tab and config exists
    if (activeTab === 'email' && savedEmailConfig && !realEmailPassword) {
      try {
        const response = await adminAPI.getEmailConfig(true); // true = show_password
        if (response.data.code === 0 && response.data.data) {
          setRealEmailPassword(response.data.data.smtp_password);
        }
      } catch (err) {
        console.error('Failed to load real password:', err);
      }
    }

    // Load real SMS secret if we're on sms tab and config exists
    if (activeTab === 'sms' && savedSMSConfig && !realSMSSecret) {
      try {
        const response = await adminAPI.getSMSConfig(true); // true = show_secret
        if (response.data.code === 0 && response.data.data) {
          setRealSMSSecret(response.data.data.access_secret);
        }
      } catch (err) {
        console.error('Failed to load real secret:', err);
      }
    }

    // Load real Alipay keys if we're on alipay tab
    if (activeTab === 'alipay') {
      try {
        const response = await adminAPI.getAlipayConfigs(true); // true = show_keys
        if (response.data.code === 0 && response.data.data) {
          setAlipayConfigs(response.data.data);
        }
      } catch (err) {
        console.error('Failed to load real alipay keys:', err);
      }
    }

    // Load real WeChat Official config if we're on wechat-official tab and config exists
    if (activeTab === 'wechat-official' && savedWechatOfficialConfig && !realWechatOfficialConfig) {
      try {
        const response = await adminAPI.getWeChatOfficialConfig(true); // true = show_sensitive
        if (response.data.code === 0 && response.data.data) {
          setRealWechatOfficialConfig(response.data.data);
        }
      } catch (err) {
        console.error('Failed to load real wechat official config:', err);
      }
    }

    // Load real WeChat secret if we're on wechat tab
    if (activeTab === 'wechat') {
      try {
        const response = await adminAPI.getWeChatConfigs(true); // true = show_secret
        if (response.data.code === 0 && response.data.data) {
          setWechatConfigs(response.data.data);
        }
      } catch (err) {
        console.error('Failed to load real wechat secret:', err);
      }
    }

    // Auto-expire verification after 5 minutes
    setTimeout(() => {
      setIsVerified(false);
      setRealEmailPassword(null); // Clear real password when verification expires
      setRealSMSSecret(null); // Clear real SMS secret when verification expires
      // Reload configs to reset masked values
      loadTabData();
    }, 5 * 60 * 1000);
  };

  const handleRequestVerify = () => {
    setShowVerifyModal(true);
  };

  // === 支付宝配置管理 ===
  const loadAlipayConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAlipayConfigs();
      if (response.data.code === 0 && response.data.data) {
        setAlipayConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载支付宝配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlipay = () => {
    setEditingAlipay(null);
    setAlipayForm({
      app_id: '',
      private_key: '',
      alipay_public_key: '',
      notify_url: `${window.location.origin}/api/v1/payment/alipay/notify`,
      return_url: `${window.location.origin}/orders`,
      is_sandbox: false,
      is_active: false,
    });
    setShowAlipayModal(true);
  };

  const handleEditAlipay = (config) => {
    setEditingAlipay(config);
    setAlipayForm({
      app_id: config.app_id,
      private_key: config.private_key === '********' ? '' : config.private_key,
      alipay_public_key: config.alipay_public_key === '********' ? '' : config.alipay_public_key,
      notify_url: config.notify_url,
      return_url: config.return_url || '',
      is_sandbox: config.is_sandbox,
      is_active: config.is_active,
    });
    setShowAlipayModal(true);
  };

  const handleSubmitAlipay = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      if (editingAlipay) {
        const updateData = { ...alipayForm };
        if (!updateData.private_key) delete updateData.private_key;
        if (!updateData.alipay_public_key) delete updateData.alipay_public_key;
        response = await adminAPI.updateAlipayConfig(editingAlipay.id, updateData);
      } else {
        response = await adminAPI.createAlipayConfig(alipayForm);
      }

      if (response.data.code === 0) {
        showToast(editingAlipay ? '更新成功' : '创建成功', 'success');
        setShowAlipayModal(false);
        loadAlipayConfigs();
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlipay = async (id) => {
    if (!window.confirm('确认删除此配置？')) return;

    try {
      const response = await adminAPI.deleteAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadAlipayConfigs();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivateAlipay = async (id) => {
    try {
      const response = await adminAPI.activateAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadAlipayConfigs();
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  // === 微信配置管理 ===
  const loadWechatConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getWeChatConfigs();
      if (response.data.code === 0 && response.data.data) {
        setWechatConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载微信配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWechat = () => {
    setEditingWechat(null);
    setWechatForm({
      app_id: '',
      app_secret: '',
      redirect_uri: `${window.location.origin}/wechat/callback`,
      scope: 'snsapi_login',
      is_active: false,
    });
    setShowWechatModal(true);
  };

  const handleEditWechat = (config) => {
    setEditingWechat(config);
    setWechatForm({
      app_id: config.app_id,
      app_secret: config.app_secret === '********' ? '' : config.app_secret,
      redirect_uri: config.redirect_uri,
      scope: config.scope,
      is_active: config.is_active,
    });
    setShowWechatModal(true);
  };

  const handleSubmitWechat = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      if (editingWechat) {
        const updateData = { ...wechatForm };
        if (!updateData.app_secret) delete updateData.app_secret;
        response = await adminAPI.updateWeChatConfig(editingWechat.id, updateData);
      } else {
        response = await adminAPI.createWeChatConfig(wechatForm);
      }

      if (response.data.code === 0) {
        showToast(editingWechat ? '更新成功' : '创建成功', 'success');
        setShowWechatModal(false);
        loadWechatConfigs();
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWechat = async (id) => {
    if (!window.confirm('确认删除此配置？')) return;

    try {
      const response = await adminAPI.deleteWeChatConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadWechatConfigs();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivateWechat = async (id) => {
    try {
      const response = await adminAPI.activateWeChatConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadWechatConfigs();
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  // === 邮件配置管理 ===
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

  const handleStartEditing = () => {
    if (savedEmailConfig) {
      setEmailConfig({
        smtpHost: savedEmailConfig.smtp_host || '',
        smtpPort: savedEmailConfig.smtp_port || '',
        smtpUser: savedEmailConfig.smtp_user || '',
        smtpPassword: '',
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
      [name]: name === 'smtpPort' ? (value === '' ? '' : parseInt(value, 10)) : value,
    });
  };

  const handleEmailConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const configToSend = {
        ...emailConfig,
        smtpPort: typeof emailConfig.smtpPort === 'string' ? parseInt(emailConfig.smtpPort, 10) : emailConfig.smtpPort
      };

      const response = await adminAPI.updateEmailConfig(configToSend);

      if (response.data.code === 0) {
        showToast('邮箱配置已成功保存', 'success');
        setIsEditingEmail(false);
        loadEmailConfig();
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

    if (!savedEmailConfig) {
      showToast('请先保存邮箱配置后再进行测试', 'error');
      return;
    }

    setTestingEmail(true);

    try {
      const testConfig = {
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

  // === 短信配置管理 ===
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
        accessSecret: '',
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
        loadSMSConfig();
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

  // === 微信公众号配置管理 ===
  const loadWechatOfficialConfig = async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getWeChatOfficialConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedWechatOfficialConfig(response.data.data);
        setIsEditingWechatOfficial(false);
      } else {
        setSavedWechatOfficialConfig(null);
      }
    } catch (err) {
      console.error('Failed to load WeChat official config:', err);
      setSavedWechatOfficialConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleStartEditingWechatOfficial = () => {
    if (savedWechatOfficialConfig) {
      setWechatOfficialConfig({
        app_id: savedWechatOfficialConfig.app_id || '',
        app_secret: '',
        token: '',
        encoding_aes_key: '',
        encryption_mode: savedWechatOfficialConfig.encryption_mode || 'plaintext',
        auto_reply_enabled: savedWechatOfficialConfig.auto_reply_enabled || false,
        ai_model_level: savedWechatOfficialConfig.ai_model_level || 'low',
        system_prompt: savedWechatOfficialConfig.system_prompt || '',
      });
    }
    setIsEditingWechatOfficial(true);
  };

  const handleCancelEditingWechatOfficial = () => {
    setIsEditingWechatOfficial(false);
    setWechatOfficialConfig({
      app_id: '',
      app_secret: '',
      token: '',
      encoding_aes_key: '',
      encryption_mode: 'plaintext',
      auto_reply_enabled: false,
      ai_model_level: 'low',
      system_prompt: '',
    });
  };

  const handleWechatOfficialConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setWechatOfficialConfig({
      ...wechatOfficialConfig,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleGenerateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setWechatOfficialConfig({ ...wechatOfficialConfig, token });
    showToast('Token已生成', 'success');
  };

  const handleGenerateEncodingAESKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 43; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setWechatOfficialConfig({ ...wechatOfficialConfig, encoding_aes_key: key });
    showToast('EncodingAESKey已生成', 'success');
  };

  const handleWechatOfficialConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updateWeChatOfficialConfig(wechatOfficialConfig);

      if (response.data.code === 0) {
        showToast('微信公众号配置已成功保存', 'success');
        setIsEditingWechatOfficial(false);
        loadWechatOfficialConfig();
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getWebhookUrl = () => {
    const domain = window.location.origin;
    return `${domain}/api/v1/wechat-official/webhook`;
  };

  // === 隐私政策管理 ===
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

  const handlePrivacyPolicyChange = (e) => {
    setPrivacyPolicy({
      ...privacyPolicy,
      [e.target.name]: e.target.value,
    });
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

  // === 服务条款管理 ===
  const loadTermsOfService = async () => {
    try {
      const response = await fetch('/api/v1/config/terms-of-service');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        setTermsOfService({
          content: data.data.content || '',
          version: data.data.version || '',
        });
      }
    } catch (err) {
      console.error('Failed to load terms of service:', err);
    }
  };

  const handleTermsOfServiceChange = (e) => {
    setTermsOfService({
      ...termsOfService,
      [e.target.name]: e.target.value,
    });
  };

  const handleTermsOfServiceSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updateTermsOfService(
        termsOfService.content,
        termsOfService.version
      );

      if (response.data.code === 0) {
        showToast('用户协议已成功更新', 'success');
      } else {
        showToast(response.data.message || '更新失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '更新失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // === 系统配置管理 ===
  const loadSystemConfig = async () => {
    try {
      const response = await fetch('/api/v1/config/system');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        setSystemConfig({
          requireEmailVerification: data.data.require_email_verification ?? true,
          enableTurnstile: data.data.enable_turnstile ?? false,
          turnstileSiteKey: data.data.turnstile_site_key ?? '',
          turnstileSecretKey: data.data.turnstile_secret_key ?? '',
        });
      }
    } catch (err) {
      console.error('Failed to load system config:', err);
    }
  };

  const handleSystemConfigSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminAPI.updateSystemConfig({
        require_email_verification: systemConfig.requireEmailVerification,
        enable_turnstile: systemConfig.enableTurnstile,
        turnstile_site_key: systemConfig.turnstileSiteKey,
        turnstile_secret_key: systemConfig.turnstileSecretKey,
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
          className={`tab-button ${activeTab === 'alipay' ? 'active' : ''}`}
          onClick={() => setActiveTab('alipay')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
          </svg>
          支付宝配置
        </button>
        <button
          className={`tab-button ${activeTab === 'wechat' ? 'active' : ''}`}
          onClick={() => setActiveTab('wechat')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
          </svg>
          微信配置
        </button>
        <button
          className={`tab-button ${activeTab === 'wechat-official' ? 'active' : ''}`}
          onClick={() => setActiveTab('wechat-official')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
          </svg>
          微信公众号
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
          className={`tab-button ${activeTab === 'terms' ? 'active' : ''}`}
          onClick={() => setActiveTab('terms')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
          </svg>
          用户协议
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
        {/* Email Configuration Tab */}
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
              <div className="saved-config-container">
                <div className="saved-config-header">
                  <div className="saved-config-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span>已保存的配置</span>
                  </div>
                  <button className="btn btn-outline" onClick={handleStartEditing}>
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
                    <SensitiveField
                      value={realEmailPassword || savedEmailConfig.smtp_password}
                      isVerified={isVerified}
                      onRequestVerify={handleRequestVerify}
                    />
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
              <div className="no-config-state">
                <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                <p>尚未配置邮箱服务器</p>
                <button className="btn btn-primary" onClick={() => setIsEditingEmail(true)}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                  </svg>
                  开始配置
                </button>
              </div>
            ) : (
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
                      <label htmlFor="smtpPassword">
                        SMTP密码 {!savedEmailConfig && '*'}
                      </label>
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
                      {savedEmailConfig && (
                        <small className="form-hint">留空则不修改密码</small>
                      )}
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
                    <button type="button" className="btn btn-outline" onClick={handleCancelEditing} disabled={loading}>
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
                    <button type="submit" className="btn btn-secondary" disabled={testingEmail || !testEmail}>
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

        {/* SMS Configuration Tab */}
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
              <div className="saved-config-container">
                <div className="saved-config-header">
                  <div className="saved-config-badge">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span>已保存的配置</span>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={handleStartEditingSMS}>
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
                    <SensitiveField
                      value={realSMSSecret || savedSMSConfig.access_secret}
                      isVerified={isVerified}
                      onRequestVerify={handleRequestVerify}
                    />
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
              <div className="no-config-state">
                <svg className="empty-icon" width="64" height="64" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                </svg>
                <p>尚未配置短信服务</p>
                <button type="button" className="btn btn-primary" onClick={() => setIsEditingSMS(true)}>
                  开始配置
                </button>
              </div>
            ) : (
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
                      <label htmlFor="accessSecret">
                        Access Secret {!savedSMSConfig && '*'}
                      </label>
                      <input
                        type="password"
                        id="accessSecret"
                        name="accessSecret"
                        className="input"
                        value={smsConfig.accessSecret}
                        onChange={(e) => setSMSConfig({ ...smsConfig, accessSecret: e.target.value })}
                        placeholder={savedSMSConfig ? "留空则不修改密钥" : "请输入 Access Secret"}
                        required={!savedSMSConfig}
                      />
                      {savedSMSConfig ? (
                        <small className="form-hint">留空则不修改密钥</small>
                      ) : (
                        <small className="form-hint">阿里云账号的 Access Secret</small>
                      )}
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
                      // eslint-disable-next-line no-template-curly-in-string
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
                      <button type="button" className="btn btn-secondary" onClick={handleCancelEditingSMS} disabled={loading}>
                        取消
                      </button>
                    )}
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

            <div className="divider"></div>

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
                    <button type="submit" className="btn btn-secondary" disabled={testingSMS || !testPhone}>
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

        {/* Alipay Configuration Tab */}
        {activeTab === 'alipay' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>支付宝配置</h2>
              <p>管理支付宝支付配置</p>
              <button className="btn btn-primary" onClick={handleCreateAlipay}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                添加配置
              </button>
            </div>

            {loading ? (
              <div className="loading-state">
                <span className="spinner"></span>
                <span>加载中...</span>
              </div>
            ) : alipayConfigs.length === 0 ? (
              <div className="no-config-state">
                <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
                </svg>
                <p>暂无支付宝配置</p>
              </div>
            ) : (
              <div className="config-cards">
                {alipayConfigs.map((config) => (
                  <div key={config.id} className={`config-card ${config.is_active ? 'active' : ''}`}>
                    <div className="card-header">
                      <h3>支付宝配置 #{config.id}</h3>
                      {config.is_active && <span className="badge badge-success">已激活</span>}
                      {config.is_sandbox && <span className="badge badge-warning">沙箱环境</span>}
                    </div>
                    <div className="card-body">
                      <div className="config-row">
                        <label>应用 ID:</label>
                        <span>{config.app_id}</span>
                      </div>
                      <div className="config-row">
                        <label>应用私钥:</label>
                        <SensitiveField
                          value={config.private_key}
                          isVerified={isVerified}
                          onRequestVerify={handleRequestVerify}
                        />
                      </div>
                      <div className="config-row">
                        <label>支付宝公钥:</label>
                        <SensitiveField
                          value={config.alipay_public_key}
                          isVerified={isVerified}
                          onRequestVerify={handleRequestVerify}
                        />
                      </div>
                      <div className="config-row">
                        <label>回调地址:</label>
                        <span>{config.notify_url}</span>
                      </div>
                      {config.return_url && (
                        <div className="config-row">
                          <label>返回地址:</label>
                          <span>{config.return_url}</span>
                        </div>
                      )}
                    </div>
                    <div className="card-actions">
                      {!config.is_active && (
                        <button className="btn btn-success btn-sm" onClick={() => handleActivateAlipay(config.id)}>
                          激活
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => handleEditAlipay(config)}>
                        编辑
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAlipay(config.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alipay Modal */}
            {showAlipayModal && (
              <div className="modal-overlay" onClick={() => setShowAlipayModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{editingAlipay ? '编辑支付宝配置' : '添加支付宝配置'}</h3>
                    <button className="modal-close" onClick={() => setShowAlipayModal(false)}>×</button>
                  </div>
                  <form onSubmit={handleSubmitAlipay}>
                    <div className="form-group">
                      <label htmlFor="app_id">应用 ID *</label>
                      <input
                        type="text"
                        id="app_id"
                        className="input"
                        value={alipayForm.app_id}
                        onChange={(e) => setAlipayForm({ ...alipayForm, app_id: e.target.value })}
                        placeholder="输入支付宝应用 ID"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="private_key">应用私钥 {editingAlipay && '(留空不修改)'}</label>
                      <textarea
                        id="private_key"
                        className="input"
                        rows="4"
                        value={alipayForm.private_key}
                        onChange={(e) => setAlipayForm({ ...alipayForm, private_key: e.target.value })}
                        placeholder="输入应用私钥"
                        required={!editingAlipay}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="alipay_public_key">支付宝公钥 {editingAlipay && '(留空不修改)'}</label>
                      <textarea
                        id="alipay_public_key"
                        className="input"
                        rows="4"
                        value={alipayForm.alipay_public_key}
                        onChange={(e) => setAlipayForm({ ...alipayForm, alipay_public_key: e.target.value })}
                        placeholder="输入支付宝公钥"
                        required={!editingAlipay}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="notify_url">回调地址 *</label>
                      <input
                        type="text"
                        id="notify_url"
                        className="input"
                        value={alipayForm.notify_url}
                        onChange={(e) => setAlipayForm({ ...alipayForm, notify_url: e.target.value })}
                        placeholder="支付回调地址"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="return_url">返回地址</label>
                      <input
                        type="text"
                        id="return_url"
                        className="input"
                        value={alipayForm.return_url}
                        onChange={(e) => setAlipayForm({ ...alipayForm, return_url: e.target.value })}
                        placeholder="支付完成后的返回地址"
                      />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={alipayForm.is_sandbox}
                          onChange={(e) => setAlipayForm({ ...alipayForm, is_sandbox: e.target.checked })}
                        />
                        <span>沙箱环境</span>
                      </label>
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-outline" onClick={() => setShowAlipayModal(false)}>
                        取消
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WeChat Configuration Tab */}
        {activeTab === 'wechat' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>微信配置</h2>
              <p>管理微信登录配置</p>
              <button className="btn btn-primary" onClick={handleCreateWechat}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                添加配置
              </button>
            </div>

            {loading ? (
              <div className="loading-state">
                <span className="spinner"></span>
                <span>加载中...</span>
              </div>
            ) : wechatConfigs.length === 0 ? (
              <div className="no-config-state">
                <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
                </svg>
                <p>暂无微信配置</p>
              </div>
            ) : (
              <div className="config-cards">
                {wechatConfigs.map((config) => (
                  <div key={config.id} className={`config-card ${config.is_active ? 'active' : ''}`}>
                    <div className="card-header">
                      <h3>微信配置 #{config.id}</h3>
                      {config.is_active && <span className="badge badge-success">已激活</span>}
                    </div>
                    <div className="card-body">
                      <div className="config-row">
                        <label>应用 ID:</label>
                        <span>{config.app_id}</span>
                      </div>
                      <div className="config-row">
                        <label>应用密钥:</label>
                        <SensitiveField
                          value={config.app_secret}
                          isVerified={isVerified}
                          onRequestVerify={handleRequestVerify}
                        />
                      </div>
                      <div className="config-row">
                        <label>回调地址:</label>
                        <span>{config.redirect_uri}</span>
                      </div>
                      <div className="config-row">
                        <label>授权范围:</label>
                        <span>{config.scope}</span>
                      </div>
                    </div>
                    <div className="card-actions">
                      {!config.is_active && (
                        <button className="btn btn-success btn-sm" onClick={() => handleActivateWechat(config.id)}>
                          激活
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => handleEditWechat(config)}>
                        编辑
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteWechat(config.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* WeChat Modal */}
            {showWechatModal && (
              <div className="modal-overlay" onClick={() => setShowWechatModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{editingWechat ? '编辑微信配置' : '添加微信配置'}</h3>
                    <button className="modal-close" onClick={() => setShowWechatModal(false)}>×</button>
                  </div>
                  <form onSubmit={handleSubmitWechat}>
                    <div className="form-group">
                      <label htmlFor="wechat_app_id">应用 ID *</label>
                      <input
                        type="text"
                        id="wechat_app_id"
                        className="input"
                        value={wechatForm.app_id}
                        onChange={(e) => setWechatForm({ ...wechatForm, app_id: e.target.value })}
                        placeholder="输入微信应用 ID"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="app_secret">应用密钥 {editingWechat && '(留空不修改)'}</label>
                      <input
                        type="password"
                        id="app_secret"
                        className="input"
                        value={wechatForm.app_secret}
                        onChange={(e) => setWechatForm({ ...wechatForm, app_secret: e.target.value })}
                        placeholder="输入应用密钥"
                        required={!editingWechat}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="redirect_uri">回调地址 *</label>
                      <input
                        type="text"
                        id="redirect_uri"
                        className="input"
                        value={wechatForm.redirect_uri}
                        onChange={(e) => setWechatForm({ ...wechatForm, redirect_uri: e.target.value })}
                        placeholder="授权回调地址"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scope">授权范围</label>
                      <select
                        id="scope"
                        className="input"
                        value={wechatForm.scope}
                        onChange={(e) => setWechatForm({ ...wechatForm, scope: e.target.value })}
                      >
                        <option value="snsapi_login">网页授权(snsapi_login)</option>
                        <option value="snsapi_base">静默授权(snsapi_base)</option>
                        <option value="snsapi_userinfo">用户信息(snsapi_userinfo)</option>
                      </select>
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-outline" onClick={() => setShowWechatModal(false)}>
                        取消
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WeChat Official Account Tab */}
        {activeTab === 'wechat-official' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>微信公众号自动回复配置</h2>
              <p>配置微信公众号服务器信息和AI自动回复功能</p>
            </div>

            {loadingConfig ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>加载中...</p>
              </div>
            ) : (
              <>
                {/* Webhook URL 展示 */}
                <div className="info-box" style={{ marginBottom: '2rem' }}>
                  <h3>服务器地址(URL)</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <code style={{ flex: 1, padding: '0.75rem', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                      {getWebhookUrl()}
                    </code>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(getWebhookUrl());
                        showToast('已复制到剪贴板', 'success');
                      }}
                    >
                      复制
                    </button>
                  </div>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    此URL需要配置在微信公众号后台
                  </small>
                </div>

                {!savedWechatOfficialConfig && !isEditingWechatOfficial ? (
                  // 无配置且未编辑状态 - 显示创建提示
                  <div className="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ opacity: 0.3, marginBottom: '1rem' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <p style={{ marginBottom: '1.5rem', color: '#666' }}>尚未配置微信公众号</p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleStartEditingWechatOfficial}
                    >
                      开始配置
                    </button>
                  </div>
                ) : !isEditingWechatOfficial ? (
                  // 已有配置且未编辑状态 - 显示当前配置
                  <div className="config-display">
                    <div className="config-item">
                      <label>AppID</label>
                      <div className="config-value">{savedWechatOfficialConfig.app_id || '-'}</div>
                    </div>
                    <div className="config-item">
                      <SensitiveField
                        label="AppSecret"
                        value={realWechatOfficialConfig?.app_secret || savedWechatOfficialConfig.app_secret}
                        isVerified={isVerified}
                        onRequestVerify={() => setShowVerifyModal(true)}
                      />
                    </div>
                    <div className="config-item">
                      <SensitiveField
                        label="Token"
                        value={realWechatOfficialConfig?.token || savedWechatOfficialConfig.token}
                        isVerified={isVerified}
                        onRequestVerify={() => setShowVerifyModal(true)}
                      />
                    </div>
                    <div className="config-item">
                      <SensitiveField
                        label="EncodingAESKey"
                        value={realWechatOfficialConfig?.encoding_aes_key || savedWechatOfficialConfig.encoding_aes_key}
                        isVerified={isVerified}
                        onRequestVerify={() => setShowVerifyModal(true)}
                      />
                    </div>
                    <div className="config-item">
                      <label>消息加密方式</label>
                      <div className="config-value">
                        {savedWechatOfficialConfig.encryption_mode === 'plaintext' && '明文模式'}
                        {savedWechatOfficialConfig.encryption_mode === 'compatible' && '兼容模式'}
                        {savedWechatOfficialConfig.encryption_mode === 'secure' && '安全模式（加密）'}
                      </div>
                    </div>
                    <div className="config-item">
                      <label>AI自动回复</label>
                      <div className="config-value">
                        {savedWechatOfficialConfig.auto_reply_enabled ? (
                          <span style={{ color: '#10b981' }}>✓ 已启用</span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>未启用</span>
                        )}
                      </div>
                    </div>
                    {savedWechatOfficialConfig.auto_reply_enabled && (
                      <>
                        <div className="config-item">
                          <label>AI模型等级</label>
                          <div className="config-value">
                            {savedWechatOfficialConfig.ai_model_level === 'low' && 'Low - 低成本模型'}
                            {savedWechatOfficialConfig.ai_model_level === 'medium' && 'Medium - 中等模型'}
                            {savedWechatOfficialConfig.ai_model_level === 'high' && 'High - 高级模型'}
                          </div>
                        </div>
                        <div className="config-item">
                          <label>系统提示词</label>
                          <div className="config-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {savedWechatOfficialConfig.system_prompt || '使用默认提示词'}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="form-actions" style={{ marginTop: '2rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleStartEditingWechatOfficial}
                      >
                        修改配置
                      </button>
                    </div>
                  </div>
                ) : (
                  // 编辑状态 - 显示表单
                  <form onSubmit={handleWechatOfficialConfigSubmit} className="settings-form">
                    <div className="form-group">
                      <label htmlFor="app_id">AppID</label>
                      <input
                        type="text"
                        id="app_id"
                        name="app_id"
                        className="input"
                        value={wechatOfficialConfig.app_id}
                        onChange={handleWechatOfficialConfigChange}
                        placeholder="wx1234567890abcdef"
                      />
                      <small className="form-hint">从微信公众号后台获取</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="app_secret">AppSecret</label>
                      <input
                        type="password"
                        id="app_secret"
                        name="app_secret"
                        className="input"
                        value={wechatOfficialConfig.app_secret}
                        onChange={handleWechatOfficialConfigChange}
                        placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "请输入AppSecret"}
                      />
                      <small className="form-hint">
                        {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "从微信公众号后台获取，请妥善保管"}
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="token">Token</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          id="token"
                          name="token"
                          className="input"
                          value={wechatOfficialConfig.token}
                          onChange={handleWechatOfficialConfigChange}
                          placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "必须为英文或数字，长度为3-32字符"}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleGenerateToken}
                        >
                          随机生成
                        </button>
                      </div>
                      <small className="form-hint">
                        {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "消息加密密钥，由开发者任意填写"}
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="encoding_aes_key">EncodingAESKey</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          id="encoding_aes_key"
                          name="encoding_aes_key"
                          className="input"
                          value={wechatOfficialConfig.encoding_aes_key}
                          onChange={handleWechatOfficialConfigChange}
                          placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "消息加密密钥由43位字符组成"}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleGenerateEncodingAESKey}
                        >
                          随机生成
                        </button>
                      </div>
                      <small className="form-hint">
                        {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "消息体加解密密钥，由43位字符组成"}
                      </small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="encryption_mode">消息加密方式</label>
                      <select
                        id="encryption_mode"
                        name="encryption_mode"
                        className="input"
                        value={wechatOfficialConfig.encryption_mode}
                        onChange={handleWechatOfficialConfigChange}
                      >
                        <option value="plaintext">明文模式</option>
                        <option value="compatible">兼容模式</option>
                        <option value="secure">安全模式（加密）</option>
                      </select>
                      <small className="form-hint">
                        {wechatOfficialConfig.encryption_mode === 'plaintext' && '明文模式下，不使用消息体加解密功能，安全系数较低'}
                        {wechatOfficialConfig.encryption_mode === 'compatible' && '兼容模式下，明文、密文将共存，方便开发者调试和维护'}
                        {wechatOfficialConfig.encryption_mode === 'secure' && '安全模式下，消息包为纯密文，需要开发者加密和解密，安全系数高'}
                      </small>
                    </div>

                    <div className="section-divider" style={{ margin: '2rem 0', borderTop: '1px solid #e5e7eb' }}></div>

                    <div className="section-header">
                      <h3>AI自动回复配置</h3>
                      <p style={{ fontSize: '0.875rem', color: '#666' }}>配置AI模型自动回复用户消息</p>
                    </div>

                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="auto_reply_enabled"
                          checked={wechatOfficialConfig.auto_reply_enabled}
                          onChange={handleWechatOfficialConfigChange}
                        />
                        <span>启用AI自动回复</span>
                      </label>
                      <small className="form-hint">开启后，用户发送文本消息时将自动调用AI生成回复</small>
                    </div>

                    {wechatOfficialConfig.auto_reply_enabled && (
                      <>
                        <div className="form-group">
                          <label htmlFor="ai_model_level">AI模型等级</label>
                          <select
                            id="ai_model_level"
                            name="ai_model_level"
                            className="input"
                            value={wechatOfficialConfig.ai_model_level}
                            onChange={handleWechatOfficialConfigChange}
                          >
                            <option value="low">Low - 低成本模型（适合简单对话）</option>
                            <option value="medium">Medium - 中等模型（平衡性能和成本）</option>
                            <option value="high">High - 高级模型（最佳回复质量）</option>
                          </select>
                          <small className="form-hint">选择用于自动回复的AI模型等级，需要在"第三方账号管理"中配置对应的AI模型</small>
                        </div>

                        <div className="form-group">
                          <label htmlFor="system_prompt">系统提示词</label>
                          <textarea
                            id="system_prompt"
                            name="system_prompt"
                            className="input"
                            value={wechatOfficialConfig.system_prompt}
                            onChange={handleWechatOfficialConfigChange}
                            placeholder="你是一个友好的助手，请简洁准确地回答用户的问题。回复不要超过200字。"
                            rows="4"
                            style={{ resize: 'vertical', minHeight: '100px' }}
                          />
                          <small className="form-hint">配置AI回复用户消息时使用的系统提示词，留空将使用默认提示词</small>
                        </div>
                      </>
                    )}

                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleCancelEditingWechatOfficial}
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
                )}

                {/* 配置步骤说明 */}
                <div className="info-box" style={{ marginTop: '2rem', background: '#fff3cd', border: '1px solid #ffc107' }}>
                  <h3>配置步骤</h3>
                  <ol style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
                    <li>登录微信公众平台，进入"开发" - "基本配置"</li>
                    <li>填写上方的"服务器地址(URL)"</li>
                    <li>填写Token和EncodingAESKey（可使用"随机生成"按钮）</li>
                    <li>选择消息加密方式</li>
                    <li>点击"保存配置"按钮保存设置</li>
                    <li>在微信公众平台点击"提交"进行服务器验证</li>
                    <li>启用"AI自动回复"功能，选择合适的AI模型等级</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        )}

        {/* Privacy Policy Tab */}
        {activeTab === 'privacy' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>隐私协议配置</h2>
              <p>编辑用户注册和登录时显示的隐私协议内容,支持Markdown格式</p>
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
                  placeholder="请输入隐私协议的详细内容...支持Markdown格式"
                  required
                />
                <small className="form-hint">支持Markdown格式,用户端会以美化的格式展示</small>
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

        {/* Terms of Service Tab */}
        {activeTab === 'terms' && (
          <div className="settings-section fade-in">
            <div className="section-header">
              <h2>用户协议配置</h2>
              <p>编辑用户注册和登录时显示的用户协议内容,支持Markdown格式</p>
            </div>

            <form onSubmit={handleTermsOfServiceSubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="terms-version">版本号</label>
                <input
                  type="text"
                  id="terms-version"
                  name="version"
                  className="input"
                  value={termsOfService.version}
                  onChange={handleTermsOfServiceChange}
                  placeholder="1.0"
                  required
                />
                <small className="form-hint">更新版本号以标识新版本的用户协议</small>
              </div>

              <div className="form-group">
                <label htmlFor="terms-content">用户协议内容</label>
                <textarea
                  id="terms-content"
                  name="content"
                  className="textarea"
                  value={termsOfService.content}
                  onChange={handleTermsOfServiceChange}
                  rows={15}
                  placeholder="请输入用户协议的详细内容...支持Markdown格式"
                  required
                />
                <small className="form-hint">支持Markdown格式,用户端会以美化的格式展示</small>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      <span style={{ marginLeft: '0.5rem' }}>更新中...</span>
                    </>
                  ) : (
                    '更新用户协议'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* System Configuration Tab */}
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

              <div className="divider"></div>

              <div className="form-group">
                <label className="toggle-label">
                  <span className="toggle-label-text">
                    <span className="toggle-title">Cloudflare Turnstile 人机验证</span>
                    <small className="form-hint">启用后，用户登录和注册时需要通过 Turnstile 人机验证</small>
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={systemConfig.enableTurnstile}
                      onChange={(e) => setSystemConfig({
                        ...systemConfig,
                        enableTurnstile: e.target.checked
                      })}
                    />
                    <span className="slider"></span>
                  </label>
                </label>
              </div>

              {systemConfig.enableTurnstile && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="turnstileSiteKey">Turnstile Site Key (公钥)</label>
                      <input
                        type="text"
                        id="turnstileSiteKey"
                        className="input"
                        value={systemConfig.turnstileSiteKey}
                        onChange={(e) => setSystemConfig({
                          ...systemConfig,
                          turnstileSiteKey: e.target.value
                        })}
                        placeholder="1x00000000000000000000AA (测试密钥)"
                      />
                      <small className="form-hint">从 Cloudflare Turnstile 控制台获取</small>
                    </div>
                    <div className="form-group">
                      <label htmlFor="turnstileSecretKey">Turnstile Secret Key (私钥)</label>
                      <input
                        type="password"
                        id="turnstileSecretKey"
                        className="input"
                        value={systemConfig.turnstileSecretKey}
                        onChange={(e) => setSystemConfig({
                          ...systemConfig,
                          turnstileSecretKey: e.target.value
                        })}
                        placeholder="1x0000000000000000000000000000000AA (测试密钥)"
                      />
                      <small className="form-hint">从 Cloudflare Turnstile 控制台获取</small>
                    </div>
                  </div>
                </>
              )}

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

      {/* Verify Password Modal */}
      <VerifyPasswordModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerified={handleVerified}
      />
    </div>
  );
};

export default SystemSettings;

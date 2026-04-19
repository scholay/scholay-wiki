/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import SensitiveField from '../../components/SensitiveField';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';

// any usage:
//   - axios catch (err: any)
//   - config rows returned by backend (wechat pay / wechat oauth / wechat official)
//     have open shapes; declared as Record<string, any> aliases.
type WechatPayConfig = Record<string, any>; // [any]
type WechatConfig = Record<string, any>; // [any]
type WechatOfficialConfig = Record<string, any>; // [any]

interface WechatPayForm {
  mch_id: string;
  app_id: string;
  api_v3_key: string;
  serial_no: string;
  private_key: string;
  notify_url: string;
  is_sandbox: boolean;
  is_active: boolean;
}

interface WechatForm {
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  scope: string;
  is_active: boolean;
}

interface WechatOfficialForm {
  app_id: string;
  app_secret: string;
  token: string;
  encoding_aes_key: string;
  encryption_mode: string;
  auto_reply_enabled: boolean;
  ai_model_level: string;
  system_prompt: string;
}

type WechatSubTab = 'pay' | 'oauth' | 'official';

interface WechatTabProps {
  wechatSubTab: WechatSubTab;
  setWechatSubTab: (tab: WechatSubTab) => void;
}

const WechatTab = React.memo<WechatTabProps>(({ wechatSubTab, setWechatSubTab }) => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  // Common loading
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // === 微信支付 state ===
  const [wechatPayConfigs, setWechatPayConfigs] = useState<WechatPayConfig[]>([]);
  const [showWechatPayModal, setShowWechatPayModal] = useState(false);
  const [editingWechatPay, setEditingWechatPay] = useState<WechatPayConfig | null>(null);
  const [wechatPayForm, setWechatPayForm] = useState<WechatPayForm>({
    mch_id: '', app_id: '', api_v3_key: '', serial_no: '', private_key: '',
    notify_url: '', is_sandbox: false, is_active: false,
  });

  // === 微信扫码登录 state ===
  const [wechatConfigs, setWechatConfigs] = useState<WechatConfig[]>([]);
  const [showWechatModal, setShowWechatModal] = useState(false);
  const [editingWechat, setEditingWechat] = useState<WechatConfig | null>(null);
  const [wechatForm, setWechatForm] = useState<WechatForm>({
    app_id: '', app_secret: '', redirect_uri: '', scope: 'snsapi_login', is_active: false,
  });

  // === 微信公众号 state ===
  const [savedWechatOfficialConfig, setSavedWechatOfficialConfig] = useState<WechatOfficialConfig | null>(null);
  const [realWechatOfficialConfig, setRealWechatOfficialConfig] = useState<WechatOfficialConfig | null>(null);
  const [isEditingWechatOfficial, setIsEditingWechatOfficial] = useState(false);
  const [wechatOfficialConfig, setWechatOfficialConfig] = useState<WechatOfficialForm>({
    app_id: '', app_secret: '', token: '', encoding_aes_key: '',
    encryption_mode: 'plaintext', auto_reply_enabled: false,
    ai_model_level: 'low', system_prompt: '',
  });

  // Loaders
  const loadWechatPayConfigs = useCallback(async (showSensitive: boolean) => {
    setLoading(true);
    try {
      const response = await adminAPI.getWeChatPayConfigs(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setWechatPayConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载微信支付配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWechatConfigs = useCallback(async (showSensitive: boolean) => {
    setLoading(true);
    try {
      const response = await adminAPI.getWeChatConfigs(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setWechatConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载微信配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWechatOfficialConfig = useCallback(async (showSensitive: boolean) => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getWeChatOfficialConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setSavedWechatOfficialConfig(response.data.data);
        if (showSensitive) {
          setRealWechatOfficialConfig(response.data.data);
        } else {
          setRealWechatOfficialConfig(null);
        }
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
  }, []);

  // Load based on subTab + verifyEpoch
  useEffect(() => {
    if (wechatSubTab === 'pay') {
      loadWechatPayConfigs(isVerified);
    } else if (wechatSubTab === 'oauth') {
      loadWechatConfigs(isVerified);
    } else if (wechatSubTab === 'official') {
      loadWechatOfficialConfig(isVerified);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wechatSubTab, verifyEpoch]);

  // === 微信支付 handlers ===
  const handleCreateWechatPay = () => {
    setEditingWechatPay(null);
    setWechatPayForm({
      mch_id: '', app_id: '', api_v3_key: '', serial_no: '', private_key: '',
      notify_url: `${window.location.origin}/api/v1/payment/wechat/notify`,
      is_sandbox: false, is_active: false,
    });
    setShowWechatPayModal(true);
  };

  const handleEditWechatPay = (config: WechatPayConfig) => {
    setEditingWechatPay(config);
    setWechatPayForm({
      mch_id: config.mch_id,
      app_id: config.app_id,
      api_v3_key: config.api_v3_key?.includes('****') ? '' : config.api_v3_key,
      serial_no: config.serial_no,
      private_key: config.private_key?.includes('****') ? '' : config.private_key,
      notify_url: config.notify_url,
      is_sandbox: config.is_sandbox,
      is_active: config.is_active,
    });
    setShowWechatPayModal(true);
  };

  const handleSubmitWechatPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let response;
      if (editingWechatPay) {
        const updateData: Record<string, unknown> = { ...wechatPayForm };
        if (!updateData.api_v3_key) delete updateData.api_v3_key;
        if (!updateData.private_key) delete updateData.private_key;
        response = await adminAPI.updateWeChatPayConfig(editingWechatPay.id, updateData);
      } else {
        response = await adminAPI.createWeChatPayConfig(wechatPayForm);
      }
      if (response.data.code === 0) {
        showToast(editingWechatPay ? '更新成功' : '创建成功', 'success');
        setShowWechatPayModal(false);
        loadWechatPayConfigs(isVerified);
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err: any) {
      // any: axios error
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWechatPay = async (id: number | string) => {
    if (!window.confirm('确认删除此配置？')) return;
    try {
      const response = await adminAPI.deleteWeChatPayConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadWechatPayConfigs(isVerified);
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivateWechatPay = async (id: number | string) => {
    try {
      const response = await adminAPI.activateWeChatPayConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadWechatPayConfigs(isVerified);
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  // === 微信扫码登录 handlers ===
  const handleCreateWechat = () => {
    setEditingWechat(null);
    setWechatForm({
      app_id: '', app_secret: '',
      redirect_uri: `${window.location.origin}/wechat/callback`,
      scope: 'snsapi_login', is_active: false,
    });
    setShowWechatModal(true);
  };

  const handleEditWechat = (config: WechatConfig) => {
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

  const handleSubmitWechat = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let response;
      if (editingWechat) {
        const updateData: Record<string, unknown> = { ...wechatForm };
        if (!updateData.app_secret) delete updateData.app_secret;
        response = await adminAPI.updateWeChatConfig(editingWechat.id, updateData);
      } else {
        response = await adminAPI.createWeChatConfig(wechatForm);
      }
      if (response.data.code === 0) {
        showToast(editingWechat ? '更新成功' : '创建成功', 'success');
        setShowWechatModal(false);
        loadWechatConfigs(isVerified);
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err: any) {
      // any: axios error
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWechat = async (id: number | string) => {
    if (!window.confirm('确认删除此配置？')) return;
    try {
      const response = await adminAPI.deleteWeChatConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadWechatConfigs(isVerified);
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivateWechat = async (id: number | string) => {
    try {
      const response = await adminAPI.activateWeChatConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadWechatConfigs(isVerified);
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  // === 微信公众号 handlers ===
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
      app_id: '', app_secret: '', token: '', encoding_aes_key: '',
      encryption_mode: 'plaintext', auto_reply_enabled: false,
      ai_model_level: 'low', system_prompt: '',
    });
  };

  const handleWechatOfficialConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const checked = target.checked;
    setWechatOfficialConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleGenerateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setWechatOfficialConfig(prev => ({ ...prev, token }));
    showToast('Token已生成', 'success');
  };

  const handleGenerateEncodingAESKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 43; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setWechatOfficialConfig(prev => ({ ...prev, encoding_aes_key: key }));
    showToast('EncodingAESKey已生成', 'success');
  };

  const handleWechatOfficialConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await adminAPI.updateWeChatOfficialConfig(wechatOfficialConfig);
      if (response.data.code === 0) {
        showToast('微信公众号配置已成功保存', 'success');
        setIsEditingWechatOfficial(false);
        loadWechatOfficialConfig(isVerified);
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err: any) {
      // any: axios error
      showToast(err.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getWebhookUrl = () => `${window.location.origin}/api/v1/wechat-official/webhook`;

  return (
    <div className="settings-section fade-in">
      <div className="wechat-sub-nav">
        <button className={`sub-nav-button ${wechatSubTab === 'pay' ? 'active' : ''}`} onClick={() => setWechatSubTab('pay')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
          </svg>
          微信支付
        </button>
        <button className={`sub-nav-button ${wechatSubTab === 'oauth' ? 'active' : ''}`} onClick={() => setWechatSubTab('oauth')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
          </svg>
          扫码登录
        </button>
        <button className={`sub-nav-button ${wechatSubTab === 'official' ? 'active' : ''}`} onClick={() => setWechatSubTab('official')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
          </svg>
          公众号
        </button>
      </div>

      {wechatSubTab === 'pay' && (
        <>
          <div className="section-header">
            <h2>微信支付配置</h2>
            <p>管理微信支付配置</p>
            <button className="btn btn-primary" onClick={handleCreateWechatPay}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              添加配置
            </button>
          </div>

          {loading ? (
            <div className="loading-state"><span className="spinner"></span><span>加载中...</span></div>
          ) : wechatPayConfigs.length === 0 ? (
            <div className="no-config-state">
              <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
              </svg>
              <p>暂无微信支付配置</p>
            </div>
          ) : (
            <div className="config-cards">
              {wechatPayConfigs.map((config) => (
                <div key={config.id} className={`config-card ${config.is_active ? 'active' : ''}`}>
                  <div className="card-header">
                    <h3>微信支付配置 #{config.id}</h3>
                    {config.is_active && <span className="badge badge-success">已激活</span>}
                    {config.is_sandbox && <span className="badge badge-warning">沙箱环境</span>}
                  </div>
                  <div className="card-body">
                    <div className="config-row"><label>商户号:</label><span>{config.mch_id}</span></div>
                    <div className="config-row"><label>应用 ID:</label><span>{config.app_id}</span></div>
                    <div className="config-row"><label>证书序列号:</label><span>{config.serial_no}</span></div>
                    <div className="config-row">
                      <label>APIv3密钥:</label>
                      <SensitiveField value={config.api_v3_key} isVerified={isVerified} onRequestVerify={onRequestVerify} />
                    </div>
                    <div className="config-row">
                      <label>商户私钥:</label>
                      <SensitiveField value={config.private_key} isVerified={isVerified} onRequestVerify={onRequestVerify} />
                    </div>
                    <div className="config-row"><label>回调地址:</label><span>{config.notify_url}</span></div>
                  </div>
                  <div className="card-actions">
                    {!config.is_active && (
                      <button className="btn btn-success btn-sm" onClick={() => handleActivateWechatPay(config.id)}>激活</button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => handleEditWechatPay(config)}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteWechatPay(config.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showWechatPayModal && (
            <div className="modal-overlay" onClick={() => setShowWechatPayModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{editingWechatPay ? '编辑微信支付配置' : '添加微信支付配置'}</h3>
                  <button className="modal-close" onClick={() => setShowWechatPayModal(false)}>×</button>
                </div>
                <form onSubmit={handleSubmitWechatPay}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label htmlFor="mch_id">商户号 *</label>
                      <input type="text" id="mch_id" className="input" value={wechatPayForm.mch_id}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, mch_id: e.target.value })}
                        placeholder="输入微信支付商户号" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="wechat_app_id">应用 ID *</label>
                      <input type="text" id="wechat_app_id" className="input" value={wechatPayForm.app_id}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, app_id: e.target.value })}
                        placeholder="输入微信 App ID" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="serial_no">证书序列号 *</label>
                      <input type="text" id="serial_no" className="input" value={wechatPayForm.serial_no}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, serial_no: e.target.value })}
                        placeholder="输入商户API证书序列号" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="api_v3_key">APIv3密钥 {editingWechatPay && '(留空不修改)'}</label>
                      <input type="password" id="api_v3_key" className="input" value={wechatPayForm.api_v3_key}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, api_v3_key: e.target.value })}
                        placeholder="输入APIv3密钥(32位)" required={!editingWechatPay} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="wechat_private_key">商户私钥 {editingWechatPay && '(留空不修改)'}</label>
                      <textarea id="wechat_private_key" className="input" rows={6} value={wechatPayForm.private_key}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, private_key: e.target.value })}
                        placeholder="输入商户私钥(PEM格式)" required={!editingWechatPay} />
                      <small className="form-hint">请粘贴完整的PEM格式私钥，包括 BEGIN/END 标记</small>
                    </div>
                    <div className="form-group">
                      <label htmlFor="wechat_notify_url">回调地址 *</label>
                      <input type="text" id="wechat_notify_url" className="input" value={wechatPayForm.notify_url}
                        onChange={(e) => setWechatPayForm({ ...wechatPayForm, notify_url: e.target.value })}
                        placeholder="支付回调地址" required />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={wechatPayForm.is_sandbox}
                          onChange={(e) => setWechatPayForm({ ...wechatPayForm, is_sandbox: e.target.checked })} />
                        <span>沙箱环境</span>
                      </label>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={() => setShowWechatPayModal(false)}>取消</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? '保存中...' : editingWechatPay ? '更新' : '创建'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {wechatSubTab === 'oauth' && (
        <>
          <div className="section-header">
            <h2>微信扫码登录配置</h2>
            <p>管理微信扫码登录配置</p>
            <button className="btn btn-primary" onClick={handleCreateWechat}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              添加配置
            </button>
          </div>

          {loading ? (
            <div className="loading-state"><span className="spinner"></span><span>加载中...</span></div>
          ) : wechatConfigs.length === 0 ? (
            <div className="no-config-state">
              <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
              </svg>
              <p>暂无微信扫码登录配置</p>
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
                    <div className="config-row"><label>应用 ID:</label><span>{config.app_id}</span></div>
                    <div className="config-row">
                      <label>应用密钥:</label>
                      <SensitiveField value={config.app_secret} isVerified={isVerified} onRequestVerify={onRequestVerify} />
                    </div>
                    <div className="config-row"><label>回调地址:</label><span>{config.redirect_uri}</span></div>
                    <div className="config-row"><label>授权范围:</label><span>{config.scope}</span></div>
                  </div>
                  <div className="card-actions">
                    {!config.is_active && (
                      <button className="btn btn-success btn-sm" onClick={() => handleActivateWechat(config.id)}>激活</button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => handleEditWechat(config)}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteWechat(config.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showWechatModal && (
            <div className="modal-overlay" onClick={() => setShowWechatModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{editingWechat ? '编辑微信配置' : '添加微信配置'}</h3>
                  <button className="modal-close" onClick={() => setShowWechatModal(false)}>×</button>
                </div>
                <form onSubmit={handleSubmitWechat}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label htmlFor="wechat_app_id">应用 ID *</label>
                      <input type="text" id="wechat_app_id" className="input" value={wechatForm.app_id}
                        onChange={(e) => setWechatForm({ ...wechatForm, app_id: e.target.value })}
                        placeholder="输入微信应用 ID" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="app_secret">应用密钥 {editingWechat && '(留空不修改)'}</label>
                      <input type="password" id="app_secret" className="input" value={wechatForm.app_secret}
                        onChange={(e) => setWechatForm({ ...wechatForm, app_secret: e.target.value })}
                        placeholder="输入应用密钥" required={!editingWechat} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="redirect_uri">回调地址 *</label>
                      <input type="text" id="redirect_uri" className="input" value={wechatForm.redirect_uri}
                        onChange={(e) => setWechatForm({ ...wechatForm, redirect_uri: e.target.value })}
                        placeholder="授权回调地址" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scope">授权范围</label>
                      <select id="scope" className="input" value={wechatForm.scope}
                        onChange={(e) => setWechatForm({ ...wechatForm, scope: e.target.value })}>
                        <option value="snsapi_login">网页授权(snsapi_login)</option>
                        <option value="snsapi_base">静默授权(snsapi_base)</option>
                        <option value="snsapi_userinfo">用户信息(snsapi_userinfo)</option>
                      </select>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={() => setShowWechatModal(false)}>取消</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? '保存中...' : '保存'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {wechatSubTab === 'official' && (
        <>
          <div className="section-header">
            <h2>微信公众号自动回复配置</h2>
            <p>配置微信公众号服务器信息和AI自动回复功能</p>
          </div>

          {loadingConfig ? (
            <div className="loading-container"><div className="spinner"></div><p>加载中...</p></div>
          ) : (
            <>
              <div className="info-box mb-4">
                <h3>服务器地址(URL)</h3>
                <div className="flex-row-gap mt-sm">
                  <code className="inline-code-block flex-1">{getWebhookUrl()}</code>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(getWebhookUrl());
                      showToast('已复制到剪贴板', 'success');
                    }}>复制</button>
                </div>
                <small>此URL需要配置在微信公众号后台</small>
              </div>

              {!savedWechatOfficialConfig && !isEditingWechatOfficial ? (
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="empty-icon subtle-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-secondary-sm mb-3">尚未配置微信公众号</p>
                  <button type="button" className="btn btn-primary" onClick={handleStartEditingWechatOfficial}>
                    开始配置
                  </button>
                </div>
              ) : !isEditingWechatOfficial ? (
                <div className="config-display">
                  <div className="config-item">
                    <label>AppID</label>
                    <div className="config-value">{savedWechatOfficialConfig.app_id || '-'}</div>
                  </div>
                  <div className="config-item">
                    <SensitiveField label="AppSecret"
                      value={realWechatOfficialConfig?.app_secret || savedWechatOfficialConfig.app_secret}
                      isVerified={isVerified} onRequestVerify={onRequestVerify} />
                  </div>
                  <div className="config-item">
                    <SensitiveField label="Token"
                      value={realWechatOfficialConfig?.token || savedWechatOfficialConfig.token}
                      isVerified={isVerified} onRequestVerify={onRequestVerify} />
                  </div>
                  <div className="config-item">
                    <SensitiveField label="EncodingAESKey"
                      value={realWechatOfficialConfig?.encoding_aes_key || savedWechatOfficialConfig.encoding_aes_key}
                      isVerified={isVerified} onRequestVerify={onRequestVerify} />
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
                        <span className="text-success">✓ 已启用</span>
                      ) : (
                        <span className="text-muted">未启用</span>
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
                        <div className="config-value text-pre-wrap">
                          {savedWechatOfficialConfig.system_prompt || '使用默认提示词'}
                        </div>
                      </div>
                    </>
                  )}
                  <div className="form-actions mt-4">
                    <button type="button" className="btn btn-primary" onClick={handleStartEditingWechatOfficial}>
                      修改配置
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWechatOfficialConfigSubmit} className="settings-form">
                  <div className="form-group">
                    <label htmlFor="app_id">AppID</label>
                    <input type="text" id="app_id" name="app_id" className="input"
                      value={wechatOfficialConfig.app_id} onChange={handleWechatOfficialConfigChange}
                      placeholder="wx1234567890abcdef" />
                    <small className="form-hint">从微信公众号后台获取</small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="app_secret">AppSecret</label>
                    <input type="password" id="app_secret" name="app_secret" className="input"
                      value={wechatOfficialConfig.app_secret} onChange={handleWechatOfficialConfigChange}
                      placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "请输入AppSecret"} />
                    <small className="form-hint">
                      {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "从微信公众号后台获取，请妥善保管"}
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="token">Token</label>
                    <div className="flex-gap-sm">
                      <input type="text" id="token" name="token" className="input flex-1"
                        value={wechatOfficialConfig.token} onChange={handleWechatOfficialConfigChange}
                        placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "必须为英文或数字，长度为3-32字符"} />
                      <button type="button" className="btn btn-secondary" onClick={handleGenerateToken}>随机生成</button>
                    </div>
                    <small className="form-hint">
                      {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "消息加密密钥，由开发者任意填写"}
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="encoding_aes_key">EncodingAESKey</label>
                    <div className="flex-gap-sm">
                      <input type="text" id="encoding_aes_key" name="encoding_aes_key" className="input flex-1"
                        value={wechatOfficialConfig.encoding_aes_key} onChange={handleWechatOfficialConfigChange}
                        placeholder={savedWechatOfficialConfig ? "留空表示不修改" : "消息加密密钥由43位字符组成"} />
                      <button type="button" className="btn btn-secondary" onClick={handleGenerateEncodingAESKey}>随机生成</button>
                    </div>
                    <small className="form-hint">
                      {savedWechatOfficialConfig ? "留空表示不修改当前配置" : "消息体加解密密钥，由43位字符组成"}
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="encryption_mode">消息加密方式</label>
                    <select id="encryption_mode" name="encryption_mode" className="input"
                      value={wechatOfficialConfig.encryption_mode} onChange={handleWechatOfficialConfigChange}>
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

                  <div className="section-divider"></div>

                  <div className="section-header">
                    <h3>AI自动回复配置</h3>
                    <p className="text-secondary-sm">配置AI模型自动回复用户消息</p>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input type="checkbox" name="auto_reply_enabled"
                        checked={wechatOfficialConfig.auto_reply_enabled}
                        onChange={handleWechatOfficialConfigChange} />
                      <span>启用AI自动回复</span>
                    </label>
                    <small className="form-hint">开启后，用户发送文本消息时将自动调用AI生成回复</small>
                  </div>

                  {wechatOfficialConfig.auto_reply_enabled && (
                    <>
                      <div className="form-group">
                        <label htmlFor="ai_model_level">AI模型等级</label>
                        <select id="ai_model_level" name="ai_model_level" className="input"
                          value={wechatOfficialConfig.ai_model_level} onChange={handleWechatOfficialConfigChange}>
                          <option value="low">Low - 低成本模型（适合简单对话）</option>
                          <option value="medium">Medium - 中等模型（平衡性能和成本）</option>
                          <option value="high">High - 高级模型（最佳回复质量）</option>
                        </select>
                        <small className="form-hint">选择用于自动回复的AI模型等级，需要在"第三方账号管理"中配置对应的AI模型</small>
                      </div>

                      <div className="form-group">
                        <label htmlFor="system_prompt">系统提示词</label>
                        <textarea id="system_prompt" name="system_prompt" className="input resize-vertical min-h-100"
                          value={wechatOfficialConfig.system_prompt} onChange={handleWechatOfficialConfigChange}
                          placeholder="你是一个友好的助手，请简洁准确地回答用户的问题。回复不要超过200字。" rows={4} />
                        <small className="form-hint">配置AI回复用户消息时使用的系统提示词，留空将使用默认提示词</small>
                      </div>
                    </>
                  )}

                  <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={handleCancelEditingWechatOfficial}>取消</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (<><span className="spinner"></span><span className="text-gap-left">保存中...</span></>) : '保存配置'}
                    </button>
                  </div>
                </form>
              )}

              <div className="info-box warning mt-4">
                <h3>配置步骤</h3>
                <ol className="tip-list">
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
        </>
      )}
    </div>
  );
});

WechatTab.displayName = 'WechatTab';

export default WechatTab;

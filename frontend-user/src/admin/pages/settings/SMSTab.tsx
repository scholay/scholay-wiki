/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import SensitiveField from '../../components/SensitiveField';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';

interface SavedSMSConfig {
  access_key_id: string;
  access_secret: string;
  sign_name: string;
  template_code: string;
  template_content: string;
  endpoint: string;
}

interface SMSConfigForm {
  accessKeyId: string;
  accessSecret: string;
  signName: string;
  templateCode: string;
  templateContent: string;
  endpoint: string;
}

const SMSTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);
  const [savedSMSConfig, setSavedSMSConfig] = useState<SavedSMSConfig | null>(null);
  const [realSMSSecret, setRealSMSSecret] = useState<string | null>(null);
  const [isEditingSMS, setIsEditingSMS] = useState<boolean>(false);
  const [smsConfig, setSMSConfig] = useState<SMSConfigForm>({
    accessKeyId: '',
    accessSecret: '',
    signName: '',
    templateCode: '',
    templateContent: '',
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const [testPhone, setTestPhone] = useState<string>('');
  const [testingSMS, setTestingSMS] = useState<boolean>(false);

  const loadSMSConfig = useCallback(async (showSensitive: boolean) => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getSMSConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setSavedSMSConfig(response.data.data);
        setIsEditingSMS(false);
        if (showSensitive) {
          setRealSMSSecret(response.data.data.access_secret);
        } else {
          setRealSMSSecret(null);
        }
      } else {
        setSavedSMSConfig(null);
      }
    } catch (err) {
      console.error('Failed to load SMS config:', err);
      setSavedSMSConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadSMSConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

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

  const handleSMSConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
        is_active: true,
      };
      const response = await adminAPI.updateSMSConfig(configToSend);
      if (response.data.code === 0) {
        showToast('短信配置已成功保存', 'success');
        setIsEditingSMS(false);
        loadSMSConfig(isVerified);
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSMS = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!testPhone || !/^1[3-9]\d{9}$/.test(testPhone)) {
      showToast('请输入有效的手机号码', 'error');
      return;
    }
    setTestingSMS(true);
    try {
      let testConfig: Record<string, unknown>;
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
          use_saved_config: false,
        };
      } else {
        if (!savedSMSConfig) {
          showToast('未找到已保存的短信配置', 'error');
          setTestingSMS(false);
          return;
        }
        testConfig = { phone_number: testPhone, use_saved_config: true };
      }
      const response = await adminAPI.testSMSConfig(testConfig);
      if (response.data.code === 0) {
        showToast('测试短信已发送成功，请检查手机', 'success');
        setTestPhone('');
      } else {
        showToast(response.data.message || '发送测试短信失败', 'error');
      }
    } catch (err: any) { // [any#2] axios error shape
      showToast(err?.response?.data?.message || '发送测试短信失败，请检查配置', 'error');
    } finally {
      setTestingSMS(false);
    }
  };

  return (
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
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
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
                onRequestVerify={onRequestVerify}
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
            <div className="config-item full-width-grid">
              <label className="config-label">模板内容</label>
              <div className="config-value text-pre-wrap">{savedSMSConfig.template_content}</div>
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
                <input type="text" id="accessKeyId" name="accessKeyId" className="input"
                  value={smsConfig.accessKeyId}
                  onChange={(e) => setSMSConfig({ ...smsConfig, accessKeyId: e.target.value })}
                  placeholder="请输入 Access Key ID" required />
                <small className="form-hint">阿里云账号的 Access Key ID</small>
              </div>
              <div className="form-group">
                <label htmlFor="accessSecret">Access Secret {!savedSMSConfig && '*'}</label>
                <input type="password" id="accessSecret" name="accessSecret" className="input"
                  value={smsConfig.accessSecret}
                  onChange={(e) => setSMSConfig({ ...smsConfig, accessSecret: e.target.value })}
                  placeholder={savedSMSConfig ? "留空则不修改密钥" : "请输入 Access Secret"}
                  required={!savedSMSConfig} />
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
                <input type="text" id="signName" name="signName" className="input"
                  value={smsConfig.signName}
                  onChange={(e) => setSMSConfig({ ...smsConfig, signName: e.target.value })}
                  placeholder="请输入短信签名" required />
                <small className="form-hint">在阿里云短信服务中创建的签名名称</small>
              </div>
              <div className="form-group">
                <label htmlFor="templateCode">模板代码 *</label>
                <input type="text" id="templateCode" name="templateCode" className="input"
                  value={smsConfig.templateCode}
                  onChange={(e) => setSMSConfig({ ...smsConfig, templateCode: e.target.value })}
                  placeholder="请输入模板代码" required />
                <small className="form-hint">在阿里云短信服务中创建的模板代码</small>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="templateContent">模板内容 *</label>
              <textarea id="templateContent" name="templateContent" className="input resize-vertical" rows={3}
                value={smsConfig.templateContent}
                onChange={(e) => setSMSConfig({ ...smsConfig, templateContent: e.target.value })}
                // eslint-disable-next-line no-template-curly-in-string
                placeholder="请输入模板内容，例如：您的验证码是${code},有效期为5分钟,请勿泄露给他人。" required />
              <small className="form-hint">
                模板内容需要与阿里云模板一致，使用 $&#123;变量名&#125; 表示变量，如: $&#123;code&#125;、$&#123;min&#125; 等
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="endpoint">接入点</label>
              <input type="text" id="endpoint" name="endpoint" className="input"
                value={smsConfig.endpoint}
                onChange={(e) => setSMSConfig({ ...smsConfig, endpoint: e.target.value })}
                placeholder="dypnsapi.aliyuncs.com" />
              <small className="form-hint">阿里云号码认证服务接入点，默认为 dypnsapi.aliyuncs.com (用于验证码短信)</small>
            </div>

            <div className="form-actions">
              {savedSMSConfig && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEditingSMS} disabled={loading}>
                  取消
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (<><span className="spinner"></span><span className="text-gap-left">保存中...</span></>) : '保存配置'}
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
              <input type="tel" className="input" placeholder="请输入手机号码（如：13800138000）"
                value={testPhone} onChange={(e) => setTestPhone(e.target.value)} disabled={testingSMS} />
              <button type="submit" className="btn btn-secondary" disabled={testingSMS || !testPhone}>
                {testingSMS ? (
                  <><span className="spinner"></span><span className="text-gap-left">发送中...</span></>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
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
  );
});

SMSTab.displayName = 'SMSTab';

export default SMSTab;

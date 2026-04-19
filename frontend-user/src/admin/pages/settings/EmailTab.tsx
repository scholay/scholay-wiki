/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import SensitiveField from '../../components/SensitiveField';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';

interface SavedEmailConfig {
  smtp_host: string;
  smtp_port: number | string;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
}

interface EmailConfigForm {
  smtpHost: string;
  smtpPort: number | string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
}

const EmailTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);
  const [savedEmailConfig, setSavedEmailConfig] = useState<SavedEmailConfig | null>(null);
  const [realEmailPassword, setRealEmailPassword] = useState<string | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState<boolean>(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfigForm>({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
  });
  const [testEmail, setTestEmail] = useState<string>('');
  const [testingEmail, setTestingEmail] = useState<boolean>(false);

  const loadEmailConfig = useCallback(async (showSensitive: boolean) => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getEmailConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setSavedEmailConfig(response.data.data);
        if (showSensitive) {
          setRealEmailPassword(response.data.data.smtp_password);
        } else {
          setRealEmailPassword(null);
        }
      } else {
        setSavedEmailConfig(null);
      }
    } catch (err) {
      console.error('Failed to load email config:', err);
      setSavedEmailConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadEmailConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

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

  const handleEmailConfigChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEmailConfig(prev => ({
      ...prev,
      [name]: name === 'smtpPort' ? (value === '' ? '' : parseInt(value, 10)) : value,
    }));
  };

  const handleEmailConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const configToSend = {
        ...emailConfig,
        smtpPort: typeof emailConfig.smtpPort === 'string' ? parseInt(emailConfig.smtpPort, 10) : emailConfig.smtpPort,
      };
      const response = await adminAPI.updateEmailConfig(configToSend);
      if (response.data.code === 0) {
        showToast('邮箱配置已成功保存', 'success');
        setIsEditingEmail(false);
        loadEmailConfig(isVerified);
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async (e: FormEvent<HTMLFormElement>) => {
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
      const response = await adminAPI.testEmailConfig({ testEmail });
      if (response.data.code === 0) {
        showToast('测试邮件已发送成功，请检查收件箱', 'success');
        setTestEmail('');
      } else {
        showToast(response.data.message || '发送测试邮件失败', 'error');
      }
    } catch (err: any) { // [any#2] axios error shape
      showToast(err?.response?.data?.message || '发送测试邮件失败，请检查配置', 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  return (
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
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
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
                onRequestVerify={onRequestVerify}
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
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
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
                <input type="text" id="smtpHost" name="smtpHost" className="input"
                  value={emailConfig.smtpHost} onChange={handleEmailConfigChange}
                  placeholder="smtp.example.com" required />
              </div>
              <div className="form-group">
                <label htmlFor="smtpPort">SMTP端口 *</label>
                <input type="number" id="smtpPort" name="smtpPort" className="input"
                  value={emailConfig.smtpPort} onChange={handleEmailConfigChange}
                  placeholder="587 (STARTTLS) 或 465 (SSL)" required />
                <small className="form-hint">587端口使用STARTTLS，465端口使用SSL</small>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="smtpUser">SMTP用户名 *</label>
                <input type="text" id="smtpUser" name="smtpUser" className="input"
                  value={emailConfig.smtpUser} onChange={handleEmailConfigChange}
                  placeholder="user@example.com" required />
              </div>
              <div className="form-group">
                <label htmlFor="smtpPassword">SMTP密码 {!savedEmailConfig && '*'}</label>
                <input type="password" id="smtpPassword" name="smtpPassword" className="input"
                  value={emailConfig.smtpPassword} onChange={handleEmailConfigChange}
                  placeholder={savedEmailConfig ? "留空则不修改密码" : "输入SMTP密码"}
                  required={!savedEmailConfig} />
                {savedEmailConfig && <small className="form-hint">留空则不修改密码</small>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fromEmail">发件人邮箱 *</label>
                <input type="email" id="fromEmail" name="fromEmail" className="input"
                  value={emailConfig.fromEmail} onChange={handleEmailConfigChange}
                  placeholder="noreply@example.com" required />
              </div>
              <div className="form-group">
                <label htmlFor="fromName">发件人名称 *</label>
                <input type="text" id="fromName" name="fromName" className="input"
                  value={emailConfig.fromName} onChange={handleEmailConfigChange}
                  placeholder="Scholar" required />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={handleCancelEditing} disabled={loading}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (<><span className="spinner"></span><span className="text-gap-left">保存中...</span></>) : '保存配置'}
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
              <input type="email" id="testEmail" className="input"
                value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                placeholder="输入接收测试邮件的邮箱地址" disabled={testingEmail} />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-secondary" disabled={testingEmail || !testEmail}>
                {testingEmail ? (
                  <><span className="spinner"></span><span className="text-gap-left">发送中...</span></>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
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
  );
});

EmailTab.displayName = 'EmailTab';

export default EmailTab;

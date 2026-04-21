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
import { MicrosoftIcon } from '../../../components/icons/providers';

interface MicrosoftConfigState {
  msClientId: string;
  msClientSecret: string;
  msRedirectUri: string;
  msTenant: string;
  msEnabled: boolean;
  msHasSecret?: boolean;
}

const MicrosoftTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [microsoftConfig, setMicrosoftConfig] = useState<MicrosoftConfigState>({
    msClientId: '',
    msClientSecret: '',
    msRedirectUri: '',
    msTenant: 'common',
    msEnabled: false,
  });

  const loadMicrosoftConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getMicrosoftConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setMicrosoftConfig(prev => ({
          ...prev,
          msClientId: d.client_id ?? '',
          ...(showSensitive ? { msClientSecret: d.client_secret ?? '' } : { msClientSecret: '' }),
          msRedirectUri: d.redirect_uri ?? '',
          msTenant: d.tenant ?? 'common',
          msEnabled: d.enabled ?? false,
          msHasSecret: !!(d.client_secret && d.client_secret !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load Microsoft config:', err);
    }
  }, []);

  useEffect(() => {
    loadMicrosoftConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleMicrosoftConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const domain = microsoftConfig.msRedirectUri.replace(/\/$/, '');
      const updateData: Record<string, unknown> = {
        client_id: microsoftConfig.msClientId,
        redirect_uri: domain,
        tenant: microsoftConfig.msTenant,
        enabled: microsoftConfig.msEnabled,
      };
      if (microsoftConfig.msClientSecret) {
        updateData.client_secret = microsoftConfig.msClientSecret;
      }
      const response = await adminAPI.updateMicrosoftConfig(updateData);
      if (response.data.code === 0) {
        showToast('Microsoft 配置已成功保存', 'success');
        loadMicrosoftConfig(isVerified);
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section fade-in">
      <form onSubmit={handleMicrosoftConfigSubmit} className="settings-form">
        <div className="section-header">
          <h2 className="with-icon"><MicrosoftIcon size={24} />Microsoft 登录配置</h2>
          <p>配置 Microsoft OAuth 以支持用户通过 Microsoft/Office 365 账号登录</p>
        </div>
        <div className="form-group">
          <label>Application (Client) ID</label>
          <input type="text" className="input" value={microsoftConfig.msClientId}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, msClientId: e.target.value })}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <small className="form-hint">从 Azure Portal → App registrations 获取</small>
        </div>
        <div className="form-group">
          <label>Client Secret</label>
          {microsoftConfig.msHasSecret && (
            <SensitiveField
              value={isVerified ? microsoftConfig.msClientSecret : '********'}
              isVerified={isVerified} onRequestVerify={onRequestVerify} />
          )}
          <input type="password" className="input" value={microsoftConfig.msClientSecret}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, msClientSecret: e.target.value })}
            placeholder={microsoftConfig.msHasSecret ? '留空则不修改现有密钥' : '输入 Client Secret'} />
        </div>
        <div className="form-group">
          <label>网站域名</label>
          <input type="text" className="input" value={microsoftConfig.msRedirectUri}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, msRedirectUri: e.target.value })}
            placeholder="https://yourdomain.com" />
          <small className="form-hint">系统会自动在域名后拼接 /microsoft/callback 作为回调地址</small>
        </div>
        <div className="form-group">
          <label>Tenant</label>
          <select className="input" value={microsoftConfig.msTenant}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, msTenant: e.target.value })}>
            <option value="common">common（所有 Microsoft 账号）</option>
            <option value="organizations">organizations（仅组织账号）</option>
            <option value="consumers">consumers（仅个人账号）</option>
          </select>
          <small className="form-hint">选择 common 支持所有类型的 Microsoft 账号（包括高校 .edu 账号）</small>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={microsoftConfig.msEnabled}
              onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, msEnabled: e.target.checked })} />
            <span>启用 Microsoft 登录</span>
          </label>
        </div>
        <div className="form-group">
          <div className="info-box">
            <h4>配置说明</h4>
            <ol>
              <li>访问 <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">Azure Portal → App registrations</a></li>
              <li>点击 "New registration" 创建应用</li>
              <li>Supported account types 选择 "Accounts in any organizational directory and personal Microsoft accounts"</li>
              <li>Redirect URI 选 Web，填入上方自动生成的回调地址</li>
              <li>在 Certificates & secrets 中创建 Client Secret</li>
              <li>API permissions 中添加 User.Read 权限</li>
            </ol>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '保存中...' : '保存配置'}
        </button>
      </form>
    </div>
  );
});

MicrosoftTab.displayName = 'MicrosoftTab';

export default MicrosoftTab;

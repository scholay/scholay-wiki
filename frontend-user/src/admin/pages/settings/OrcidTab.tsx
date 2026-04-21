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
import { OrcidIcon } from '../../../components/icons/providers';

interface OrcidConfigState {
  orcidClientId: string;
  orcidClientSecret: string;
  orcidRedirectUri: string;
  orcidUseSandbox: boolean;
  orcidEnabled: boolean;
  orcidHasSecret?: boolean;
}

const OrcidTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [orcidConfig, setOrcidConfig] = useState<OrcidConfigState>({
    orcidClientId: '',
    orcidClientSecret: '',
    orcidRedirectUri: '',
    orcidUseSandbox: false,
    orcidEnabled: false,
  });

  const loadOrcidConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getOrcidConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setOrcidConfig(prev => ({
          ...prev,
          orcidClientId: d.client_id ?? '',
          ...(showSensitive ? { orcidClientSecret: d.client_secret ?? '' } : { orcidClientSecret: '' }),
          orcidRedirectUri: d.redirect_uri ?? '',
          orcidUseSandbox: d.use_sandbox ?? false,
          orcidEnabled: d.enabled ?? false,
          orcidHasSecret: !!(d.client_secret && d.client_secret !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load ORCID config:', err);
    }
  }, []);

  useEffect(() => {
    loadOrcidConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleOrcidConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const domain = orcidConfig.orcidRedirectUri.replace(/\/$/, '');
      const updateData: Record<string, unknown> = {
        client_id: orcidConfig.orcidClientId,
        redirect_uri: domain,
        use_sandbox: orcidConfig.orcidUseSandbox,
        enabled: orcidConfig.orcidEnabled,
      };
      if (orcidConfig.orcidClientSecret) {
        updateData.client_secret = orcidConfig.orcidClientSecret;
      }
      const response = await adminAPI.updateOrcidConfig(updateData);
      if (response.data.code === 0) {
        showToast('ORCID 配置已成功保存', 'success');
        loadOrcidConfig(isVerified);
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
      <form onSubmit={handleOrcidConfigSubmit} className="settings-form">
        <div className="section-header">
          <h2 className="with-icon"><OrcidIcon size={24} />ORCID 登录配置</h2>
          <p>配置 ORCID OAuth 以支持研究者通过 ORCID iD 登录</p>
        </div>
        <div className="form-group">
          <label>Client ID</label>
          <input type="text" className="input" value={orcidConfig.orcidClientId}
            onChange={(e) => setOrcidConfig({ ...orcidConfig, orcidClientId: e.target.value })}
            placeholder="APP-XXXXXXXXXXXXXXXX" />
          <small className="form-hint">从 ORCID Developer Tools 获取</small>
        </div>
        <div className="form-group">
          <label>Client Secret</label>
          {orcidConfig.orcidHasSecret && (
            <SensitiveField
              value={isVerified ? orcidConfig.orcidClientSecret : '********'}
              isVerified={isVerified} onRequestVerify={onRequestVerify} />
          )}
          <input type="password" className="input" value={orcidConfig.orcidClientSecret}
            onChange={(e) => setOrcidConfig({ ...orcidConfig, orcidClientSecret: e.target.value })}
            placeholder={orcidConfig.orcidHasSecret ? '留空则不修改现有密钥' : '输入 Client Secret'} />
        </div>
        <div className="form-group">
          <label>网站域名</label>
          <input type="text" className="input" value={orcidConfig.orcidRedirectUri}
            onChange={(e) => setOrcidConfig({ ...orcidConfig, orcidRedirectUri: e.target.value })}
            placeholder="https://yourdomain.com" />
          <small className="form-hint">系统会自动在域名后拼接 /orcid/callback 作为回调地址</small>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={orcidConfig.orcidUseSandbox}
              onChange={(e) => setOrcidConfig({ ...orcidConfig, orcidUseSandbox: e.target.checked })} />
            <span>使用 Sandbox 环境（开发测试用）</span>
          </label>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={orcidConfig.orcidEnabled}
              onChange={(e) => setOrcidConfig({ ...orcidConfig, orcidEnabled: e.target.checked })} />
            <span>启用 ORCID 登录</span>
          </label>
        </div>
        <div className="form-group">
          <div className="info-box">
            <h4>配置说明</h4>
            <ol>
              <li>访问 <a href="https://orcid.org/developer-tools" target="_blank" rel="noopener noreferrer">orcid.org/developer-tools</a> 注册应用</li>
              <li>设置 Redirect URI 为上方自动生成的回调地址</li>
              <li>复制 Client ID 和 Client Secret</li>
              <li>开发阶段可使用 Sandbox 环境 (sandbox.orcid.org)</li>
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

OrcidTab.displayName = 'OrcidTab';

export default OrcidTab;

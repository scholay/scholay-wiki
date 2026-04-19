/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';

interface AppleConfigState {
  appleServiceId: string;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
  appleRedirectUri: string;
  appleHasKey: boolean;
  appleEnabled: boolean;
}

const AppleTab = React.memo(() => {
  const { verifyEpoch } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [appleConfig, setAppleConfig] = useState<AppleConfigState>({
    appleServiceId: '',
    appleTeamId: '',
    appleKeyId: '',
    applePrivateKey: '',
    appleRedirectUri: '',
    appleHasKey: false,
    appleEnabled: false,
  });

  const loadAppleConfig = useCallback(async () => {
    try {
      const response = await adminAPI.getAppleConfig();
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setAppleConfig({
          appleServiceId: d.service_id ?? '',
          appleTeamId: d.team_id ?? '',
          appleKeyId: d.key_id ?? '',
          applePrivateKey: '',
          appleRedirectUri: d.redirect_uri ?? '',
          appleHasKey: d.has_key ?? false,
          appleEnabled: d.enabled ?? false,
        });
      }
    } catch (err) {
      console.error('Failed to load Apple config:', err);
    }
  }, []);

  useEffect(() => {
    loadAppleConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleAppleConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const domain = appleConfig.appleRedirectUri.replace(/\/$/, '');
      const response = await adminAPI.updateAppleConfig({
        service_id: appleConfig.appleServiceId,
        team_id: appleConfig.appleTeamId,
        key_id: appleConfig.appleKeyId,
        private_key: appleConfig.applePrivateKey,
        redirect_uri: domain,
        enabled: appleConfig.appleEnabled,
      });
      if (response.data.code === 0) {
        showToast('Apple 配置已成功保存', 'success');
        loadAppleConfig();
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
      <form onSubmit={handleAppleConfigSubmit} className="settings-form">
        <div className="section-header">
          <h2>Apple 登录配置</h2>
          <p>配置 Sign in with Apple 以支持 Apple 用户登录</p>
        </div>
        <div className="form-group">
          <label>Service ID (Identifier)</label>
          <input type="text" className="input" value={appleConfig.appleServiceId}
            onChange={(e) => setAppleConfig({ ...appleConfig, appleServiceId: e.target.value })}
            placeholder="com.example.app.signin" />
          <small className="form-hint">Apple Developer → Certificates, Identifiers & Profiles → Identifiers → Services IDs</small>
        </div>
        <div className="form-group">
          <label>Team ID</label>
          <input type="text" className="input" value={appleConfig.appleTeamId}
            onChange={(e) => setAppleConfig({ ...appleConfig, appleTeamId: e.target.value })}
            placeholder="XXXXXXXXXX" />
          <small className="form-hint">Apple Developer 右上角 → Membership → Team ID</small>
        </div>
        <div className="form-group">
          <label>Key ID</label>
          <input type="text" className="input" value={appleConfig.appleKeyId}
            onChange={(e) => setAppleConfig({ ...appleConfig, appleKeyId: e.target.value })}
            placeholder="XXXXXXXXXX" />
          <small className="form-hint">Apple Developer → Keys → 创建 Sign in with Apple Key 后获取</small>
        </div>
        <div className="form-group">
          <label>Private Key (.p8 文件内容) {appleConfig.appleHasKey && <span style={{color:'#22c55e'}}>(已配置)</span>}</label>
          <textarea className="input" rows={4}
            value={appleConfig.applePrivateKey}
            onChange={(e) => setAppleConfig({ ...appleConfig, applePrivateKey: e.target.value })}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <small className="form-hint">粘贴 .p8 文件的完整内容。留空则保留现有密钥。</small>
        </div>
        <div className="form-group">
          <label>网站域名</label>
          <input type="text" className="input" value={appleConfig.appleRedirectUri}
            onChange={(e) => setAppleConfig({ ...appleConfig, appleRedirectUri: e.target.value })}
            placeholder="https://yourdomain.com" />
          <small className="form-hint">系统会自动在域名后拼接 /apple/callback 作为回调地址（需要 HTTPS）</small>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={appleConfig.appleEnabled}
              onChange={(e) => setAppleConfig({ ...appleConfig, appleEnabled: e.target.checked })} />
            <span>启用 Apple 登录</span>
          </label>
        </div>
        <div className="form-group">
          <div className="info-box">
            <h4>配置说明</h4>
            <ol>
              <li>访问 <a href="https://developer.apple.com/account/resources" target="_blank" rel="noopener noreferrer">Apple Developer Portal</a></li>
              <li>创建 App ID（需勾选 Sign in with Apple）</li>
              <li>创建 Services ID（关联到 App ID，配置域名和回调地址）</li>
              <li>创建 Key（勾选 Sign in with Apple，下载 .p8 文件）</li>
              <li>回调地址必须使用 HTTPS</li>
            </ol>
            <h4>注意事项</h4>
            <ul>
              <li>Apple 只在用户<strong>首次授权</strong>时返回姓名和邮箱</li>
              <li>用户可以选择隐藏真实邮箱（Apple 会提供一个中转邮箱）</li>
              <li>需要 Apple Developer Program 会员资格（$99/年）</li>
            </ul>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '保存中...' : '保存配置'}
        </button>
      </form>
    </div>
  );
});

AppleTab.displayName = 'AppleTab';

export default AppleTab;

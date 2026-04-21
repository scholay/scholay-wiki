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
import { GoogleIcon } from '../../../components/icons/providers';

interface GoogleConfigState {
  googleClientId: string;
  googleClientSecret: string;
  googleEnabled: boolean;
  googleHasSecret?: boolean;
}

const GoogleTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [googleConfig, setGoogleConfig] = useState<GoogleConfigState>({
    googleClientId: '',
    googleClientSecret: '',
    googleEnabled: false,
  });

  const loadGoogleConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getGoogleConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setGoogleConfig(prev => ({
          ...prev,
          googleClientId: d.client_id ?? '',
          ...(showSensitive ? { googleClientSecret: d.client_secret ?? '' } : { googleClientSecret: '' }),
          googleEnabled: d.enabled ?? false,
          googleHasSecret: !!(d.client_secret && d.client_secret !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load Google config:', err);
    }
  }, []);

  useEffect(() => {
    loadGoogleConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleGoogleConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        client_id: googleConfig.googleClientId,
        enabled: googleConfig.googleEnabled,
      };
      if (googleConfig.googleClientSecret) {
        updateData.client_secret = googleConfig.googleClientSecret;
      }
      const response = await adminAPI.updateGoogleConfig(updateData);
      if (response.data.code === 0) {
        showToast('Google 配置已成功保存', 'success');
        loadGoogleConfig(isVerified);
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
      <form onSubmit={handleGoogleConfigSubmit} className="settings-form">
        <div className="section-header">
          <h2 className="with-icon"><GoogleIcon size={24} />Google 登录配置</h2>
          <p>配置 Google OAuth 以支持用户通过 Google 账号登录（支持 One Tap 快捷登录）</p>
        </div>

        <div className="form-group">
          <label htmlFor="googleClientId">Client ID</label>
          <input type="text" id="googleClientId" className="input"
            value={googleConfig.googleClientId}
            onChange={(e) => setGoogleConfig({ ...googleConfig, googleClientId: e.target.value })}
            placeholder="xxxxxxxx.apps.googleusercontent.com" />
          <small className="form-hint">从 Google Cloud Console → APIs & Services → Credentials 获取</small>
        </div>

        <div className="form-group">
          <label htmlFor="googleClientSecret">Client Secret（可选）</label>
          {googleConfig.googleHasSecret && (
            <SensitiveField
              value={isVerified ? googleConfig.googleClientSecret : '********'}
              isVerified={isVerified} onRequestVerify={onRequestVerify} />
          )}
          <input type="password" id="googleClientSecret" className="input"
            value={googleConfig.googleClientSecret}
            onChange={(e) => setGoogleConfig({ ...googleConfig, googleClientSecret: e.target.value })}
            placeholder={googleConfig.googleHasSecret ? '留空则不修改现有密钥' : 'ID Token 模式不需要 Client Secret'} />
          <small className="form-hint">当前使用 ID Token 模式，Client Secret 为可选项</small>
        </div>

        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={googleConfig.googleEnabled}
              onChange={(e) => setGoogleConfig({ ...googleConfig, googleEnabled: e.target.checked })} />
            <span>启用 Google 登录</span>
          </label>
        </div>

        <div className="form-group">
          <div className="info-box">
            <h4>配置说明</h4>
            <ol>
              <li>访问 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
              <li>创建 OAuth 2.0 Client ID（Web application 类型）</li>
              <li>在「Authorized JavaScript origins」中添加您的网站域名</li>
              <li>复制 Client ID 填入上方</li>
              <li>在 OAuth consent screen 中配置应用名称和范围（openid, email, profile）</li>
            </ol>
            <h4>登录方式</h4>
            <ul>
              <li><strong>One Tap</strong>：已登录 Google 的用户会在页面右上角看到快捷登录弹窗</li>
              <li><strong>按钮登录</strong>：点击 Google 登录按钮进行标准 OAuth 流程</li>
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

GoogleTab.displayName = 'GoogleTab';

export default GoogleTab;

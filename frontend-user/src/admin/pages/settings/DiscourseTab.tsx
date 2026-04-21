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
import { DiscourseIcon } from '../../../components/icons/providers';

interface DiscourseConfigState {
  siteUrl: string;
  ssoSecret: string;
  redirectUri: string;
  enabled: boolean;
  hasSecret?: boolean;
}

const DiscourseTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [discourseConfig, setDiscourseConfig] = useState<DiscourseConfigState>({
    siteUrl: '',
    ssoSecret: '',
    redirectUri: '',
    enabled: false,
  });

  const loadDiscourseConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getDiscourseConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setDiscourseConfig(prev => ({
          ...prev,
          siteUrl: d.site_url ?? '',
          ...(showSensitive ? { ssoSecret: d.sso_secret ?? '' } : { ssoSecret: '' }),
          redirectUri: d.redirect_uri ?? '',
          enabled: d.enabled ?? false,
          hasSecret: !!(d.sso_secret && d.sso_secret !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load Discourse config:', err);
    }
  }, []);

  useEffect(() => {
    loadDiscourseConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleDiscourseConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        site_url: discourseConfig.siteUrl.replace(/\/$/, ''),
        redirect_uri: discourseConfig.redirectUri.replace(/\/$/, ''),
        enabled: discourseConfig.enabled,
      };
      if (discourseConfig.ssoSecret) {
        updateData.sso_secret = discourseConfig.ssoSecret;
      }
      const response = await adminAPI.updateDiscourseConfig(updateData);
      if (response.data.code === 0) {
        showToast('恩特学术登录配置已保存', 'success');
        loadDiscourseConfig(isVerified);
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
      <div className="section-header">
        <h2 className="with-icon"><DiscourseIcon size={24} />恩特学术登录配置</h2>
        <p>配置恩特学术（enterscholar.com）DiscourseConnect SSO，让用户通过恩特学术账号登录 Scholay</p>
      </div>

      <form onSubmit={handleDiscourseConfigSubmit} className="settings-form">
        <div className="form-group">
          <label htmlFor="discourseSiteUrl">恩特学术站点地址</label>
          <input type="text" id="discourseSiteUrl" className="input"
            value={discourseConfig.siteUrl}
            onChange={(e) => setDiscourseConfig(prev => ({ ...prev, siteUrl: e.target.value }))}
            placeholder="https://enterscholar.com" />
          <span className="form-hint">恩特学术论坛的完整地址，不要包含末尾斜杠</span>
        </div>

        <div className="form-group">
          <label htmlFor="discourseSsoSecret">SSO 共享密钥</label>
          {discourseConfig.hasSecret && (
            <SensitiveField
              value={isVerified ? discourseConfig.ssoSecret : '********'}
              isVerified={isVerified} onRequestVerify={onRequestVerify} />
          )}
          <input type="password" id="discourseSsoSecret" className="input"
            value={discourseConfig.ssoSecret}
            onChange={(e) => setDiscourseConfig(prev => ({ ...prev, ssoSecret: e.target.value }))}
            placeholder={discourseConfig.hasSecret ? '留空则不修改现有密钥' : '至少 10 个字符的随机密钥'} />
          <span className="form-hint">必须与恩特学术后台 discourse connect provider secrets 中填写的密钥完全一致</span>
        </div>

        <div className="form-group">
          <label htmlFor="discourseRedirectUri">回调地址</label>
          <input type="text" id="discourseRedirectUri" className="input"
            value={discourseConfig.redirectUri}
            onChange={(e) => setDiscourseConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
            placeholder="http://localhost:5411/discourse/callback" />
          <span className="form-hint">Scholay 站点的 Discourse 回调地址，格式：你的域名/discourse/callback</span>
        </div>

        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={discourseConfig.enabled}
              onChange={(e) => setDiscourseConfig(prev => ({ ...prev, enabled: e.target.checked }))} />
            <span>启用恩特学术登录</span>
          </label>
          <span className="form-hint">启用后，登录弹窗中会显示「恩特学术登录」按钮</span>
        </div>

        <div className="info-box" style={{ marginTop: '24px', marginBottom: '24px' }}>
          <h4>📋 恩特学术端配置步骤</h4>
          <ol style={{ margin: '12px 0', paddingLeft: '20px', lineHeight: '2' }}>
            <li>登录 <strong>enterscholar.com</strong> 管理后台</li>
            <li>进入 <strong>设置 → 登录与身份验证 → Discourse Connect</strong></li>
            <li>搜索 <strong>provider</strong>，找到以下设置项：</li>
            <li>勾选 <strong>enable discourse connect provider</strong></li>
            <li>在 <strong>discourse connect provider secrets</strong> 中填写：
              <br />
              <code style={{
                display: 'inline-block',
                marginTop: '4px',
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '4px',
                fontSize: '13px',
                wordBreak: 'break-all',
              }}>
                {discourseConfig.redirectUri || 'http://你的域名/discourse/callback'}|{(isVerified && discourseConfig.ssoSecret) ? discourseConfig.ssoSecret : '你的密钥'}
              </code>
            </li>
            <li>左边填回调地址的域名（如 <code>localhost</code> 或 <code>scholay.com</code>），右边填密钥</li>
          </ol>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '保存中...' : '保存配置'}
        </button>
      </form>
    </div>
  );
});

DiscourseTab.displayName = 'DiscourseTab';

export default DiscourseTab;

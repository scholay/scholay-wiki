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

interface GithubConfigState {
  githubClientId: string;
  githubClientSecret: string;
  githubRedirectUri: string;
  githubHasSecret?: boolean;
}

const GithubTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [githubConfig, setGithubConfig] = useState<GithubConfigState>({
    githubClientId: '',
    githubClientSecret: '',
    githubRedirectUri: '',
  });

  const loadGithubConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getGithubConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setGithubConfig(prev => ({
          ...prev,
          githubClientId: d.client_id ?? '',
          ...(showSensitive ? { githubClientSecret: d.client_secret ?? '' } : { githubClientSecret: '' }),
          githubRedirectUri: d.redirect_uri ?? '',
          githubHasSecret: !!(d.client_secret && d.client_secret !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load GitHub config:', err);
    }
  }, []);

  useEffect(() => {
    loadGithubConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleGithubConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const domain = githubConfig.githubRedirectUri.replace(/\/$/, '');
      const updateData: Record<string, unknown> = {
        client_id: githubConfig.githubClientId,
        redirect_uri: domain,
        enabled: true,
      };
      if (githubConfig.githubClientSecret) {
        updateData.client_secret = githubConfig.githubClientSecret;
      }
      const response = await adminAPI.updateGithubConfig(updateData);
      if (response.data.code === 0) {
        showToast('GitHub 配置已成功保存', 'success');
        loadGithubConfig(isVerified);
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
        <h2>GitHub 登录配置</h2>
        <p>配置 GitHub App 或 OAuth App 以支持用户通过 GitHub 账号登录</p>
      </div>

      <form onSubmit={handleGithubConfigSubmit} className="settings-form">
        <div className="form-group">
          <label htmlFor="githubClientId">Client ID</label>
          <input type="text" id="githubClientId" className="input"
            value={githubConfig.githubClientId}
            onChange={(e) => setGithubConfig({ ...githubConfig, githubClientId: e.target.value })}
            placeholder="Iv1.1234567890abcdef" required />
          <small className="form-hint">从 GitHub App 或 OAuth App 设置中获取</small>
        </div>

        <div className="form-group">
          <label htmlFor="githubClientSecret">Client Secret</label>
          {githubConfig.githubHasSecret && (
            <SensitiveField
              value={isVerified ? githubConfig.githubClientSecret : '********'}
              isVerified={isVerified} onRequestVerify={onRequestVerify} />
          )}
          <input type="password" id="githubClientSecret" className="input"
            value={githubConfig.githubClientSecret}
            onChange={(e) => setGithubConfig({ ...githubConfig, githubClientSecret: e.target.value })}
            placeholder={githubConfig.githubHasSecret ? '留空则不修改现有密钥' : '输入 Client Secret'} />
          <small className="form-hint">从 GitHub App 或 OAuth App 设置中获取（请妥善保管，不要泄露）</small>
        </div>

        <div className="form-group">
          <label htmlFor="githubDomain">网站域名</label>
          <input type="url" id="githubDomain" className="input"
            value={githubConfig.githubRedirectUri}
            onChange={(e) => setGithubConfig({ ...githubConfig, githubRedirectUri: e.target.value })}
            placeholder="https://scholar.example.com" required />
          <small className="form-hint">填写您的网站域名（包含 http:// 或 https://，不要以 / 结尾）</small>
        </div>

        <div className="form-group">
          <label htmlFor="githubCallbackUrl">完整回调地址（自动生成）</label>
          <div className="relative">
            <input type="text" id="githubCallbackUrl" className="input readonly-input"
              value={githubConfig.githubRedirectUri ? `${githubConfig.githubRedirectUri.replace(/\/$/, '')}/github/callback` : '请先填写网站域名'}
              readOnly />
            <button type="button" className="copy-button"
              onClick={() => {
                if (githubConfig.githubRedirectUri) {
                  const url = `${githubConfig.githubRedirectUri.replace(/\/$/, '')}/github/callback`;
                  navigator.clipboard.writeText(url);
                  showToast('回调地址已复制到剪贴板', 'success');
                }
              }}
              disabled={!githubConfig.githubRedirectUri}>复制</button>
          </div>
          <small className="form-hint">
            根据您的域名自动生成，复制此地址到 GitHub App 或 OAuth App 的 Callback URL 配置中
          </small>
        </div>

        <div className="divider"></div>

        <div className="info-box">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="icon-inline-lg">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
          </svg>
          <div>
            <strong>如何创建 GitHub App（推荐方式）：</strong>
            <ol className="tip-list">
              <li>访问 GitHub Settings → Developer settings → GitHub Apps</li>
              <li>点击 "New GitHub App" 创建新应用</li>
              <li>填写基本信息（App name, Homepage URL, Description）</li>
              <li><strong>Callback URL</strong>：填写上面配置的回调地址</li>
              <li><strong>权限设置</strong>：在 "Account permissions" 中选择：
                <ul className="tip-list">
                  <li>Email addresses: Read-only（必需，用于获取用户邮箱）</li>
                </ul>
              </li>
              <li>取消勾选 "Webhook" 相关选项（不需要接收 webhook）</li>
              <li><strong>Where can this GitHub App be installed?</strong> 选择 "Any account"</li>
              <li>创建后，进入 App 设置页面：
                <ul className="tip-list">
                  <li>复制 <strong>Client ID</strong></li>
                  <li>点击 "Generate a new client secret" 生成并复制 <strong>Client Secret</strong></li>
                </ul>
              </li>
              <li>将获取的信息填入上方表单并保存</li>
            </ol>
            <div className="hint-box">
              <strong className="text-brand">💡 提示：</strong>
              <ul className="tip-list">
                <li>GitHub App 是 GitHub 官方推荐的方式，比传统 OAuth App 更安全、权限控制更细</li>
                <li>如果已有 OAuth App，也可以继续使用（向下兼容）</li>
                <li>Client Secret 只显示一次，请妥善保存</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (<><span className="spinner"></span><span className="text-gap-left">保存中...</span></>) : '保存配置'}
          </button>
        </div>
      </form>
    </div>
  );
});

GithubTab.displayName = 'GithubTab';

export default GithubTab;

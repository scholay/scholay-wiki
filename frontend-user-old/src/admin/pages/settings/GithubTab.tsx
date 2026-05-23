import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { GithubIcon } from '../../../components/icons/providers';
import { OAuthProviderForm } from '../../components/v2/OAuthProviderForm';

interface GithubConfigState {
  githubClientId: string;
  githubClientSecret: string;
  githubRedirectUri: string;
  githubHasSecret?: boolean;
}

const GithubTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [cfg, setCfg] = useState<GithubConfigState>({
    githubClientId: '',
    githubClientSecret: '',
    githubRedirectUri: '',
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getGithubConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          githubClientId: d.client_id ?? '',
          githubClientSecret: showSensitive ? (d.client_secret ?? '') : '',
          githubRedirectUri: d.redirect_uri ?? '',
          githubHasSecret: !!(d.client_secret && d.client_secret !== ''),
        });
        setEnabled(d.enabled !== false);
      }
    } catch (err) {
      console.error('Failed to load GitHub config:', err);
    }
  }, []);

  useEffect(() => {
    load(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const domain = cfg.githubRedirectUri.replace(/\/$/, '');
      const data: Record<string, unknown> = {
        client_id: cfg.githubClientId,
        redirect_uri: domain,
        enabled,
      };
      if (cfg.githubClientSecret) data.client_secret = cfg.githubClientSecret;
      const r = await adminAPI.updateGithubConfig(data);
      if (r.data.code === 0) {
        showToast('GitHub 配置已保存', 'success');
        load(isVerified);
      } else {
        showToast(r.data.message || '保存失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '保存失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OAuthProviderForm
      icon={<GithubIcon size={22} />}
      title="GitHub 登录配置"
      description="配置 GitHub App 或 OAuth App,支持用户通过 GitHub 账号登录"
      enabled={enabled}
      onEnabledChange={setEnabled}
      clientId={cfg.githubClientId}
      onClientIdChange={(v) => setCfg({ ...cfg, githubClientId: v })}
      clientIdPlaceholder="Iv1.1234567890abcdef"
      clientIdHint="从 GitHub App 或 OAuth App 设置中获取"
      clientSecret={cfg.githubClientSecret}
      onClientSecretChange={(v) => setCfg({ ...cfg, githubClientSecret: v })}
      hasSecret={cfg.githubHasSecret}
      callbackBaseUrl={cfg.githubRedirectUri}
      onCallbackBaseUrlChange={(v) => setCfg({ ...cfg, githubRedirectUri: v })}
      callbackPath="github/callback"
      callbackBaseUrlHint="网站根域名,含 http:// 或 https://,不要以 / 结尾"
      loading={loading}
      onSubmit={handleSubmit}
      instructions={
        <ol className="list-decimal space-y-1.5 pl-5 text-xs">
          <li>访问 GitHub Settings → Developer settings → GitHub Apps</li>
          <li>点击 "New GitHub App" 创建新应用</li>
          <li>填写基本信息(App name / Homepage URL / Description)</li>
          <li>Callback URL 填写上方"回调地址"</li>
          <li>权限设置 Account permissions → Email addresses: Read-only</li>
          <li>取消勾选 Webhook 相关选项</li>
          <li>"Where can this GitHub App be installed?" 选 Any account</li>
          <li>创建后到 App 设置页复制 Client ID,点击 "Generate a new client secret" 生成 Secret</li>
        </ol>
      }
    />
  );
});

GithubTab.displayName = 'GithubTab';
export default GithubTab;

import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { DiscourseIcon } from '../../../components/icons/providers';
import { OAuthProviderForm } from '../../components/v2/OAuthProviderForm';

interface DiscourseConfigState {
  siteUrl: string;
  ssoSecret: string;
  redirectUri: string;
  enabled: boolean;
  hasSecret?: boolean;
}

const DiscourseTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<DiscourseConfigState>({
    siteUrl: '',
    ssoSecret: '',
    redirectUri: '',
    enabled: false,
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getDiscourseConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          siteUrl: d.site_url ?? '',
          ssoSecret: showSensitive ? (d.sso_secret ?? '') : '',
          redirectUri: d.redirect_uri ?? '',
          enabled: d.enabled ?? false,
          hasSecret: !!(d.sso_secret && d.sso_secret !== ''),
        });
      }
    } catch (err) {
      console.error('Failed to load Discourse config:', err);
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
      const data: Record<string, unknown> = {
        site_url: cfg.siteUrl.replace(/\/$/, ''),
        redirect_uri: cfg.redirectUri.replace(/\/$/, ''),
        enabled: cfg.enabled,
      };
      if (cfg.ssoSecret) data.sso_secret = cfg.ssoSecret;
      const r = await adminAPI.updateDiscourseConfig(data);
      if (r.data.code === 0) {
        showToast('恩特学术登录配置已保存', 'success');
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
      icon={<DiscourseIcon size={22} />}
      title="恩特学术登录配置"
      description="配置 enterscholar.com 的 DiscourseConnect SSO,让用户通过恩特学术账号登录"
      enabled={cfg.enabled}
      onEnabledChange={(v) => setCfg({ ...cfg, enabled: v })}
      // 复用 client_id 字段位放 site_url
      clientIdLabel="Discourse 站点地址"
      clientId={cfg.siteUrl}
      onClientIdChange={(v) => setCfg({ ...cfg, siteUrl: v })}
      clientIdPlaceholder="https://enterscholar.com"
      clientIdHint="完整 URL,含 https:// ,不要以 / 结尾"
      // 复用 client_secret 字段位放 sso_secret
      clientSecretLabel="SSO Secret"
      clientSecret={cfg.ssoSecret}
      onClientSecretChange={(v) => setCfg({ ...cfg, ssoSecret: v })}
      hasSecret={cfg.hasSecret}
      callbackBaseUrl={cfg.redirectUri}
      onCallbackBaseUrlChange={(v) => setCfg({ ...cfg, redirectUri: v })}
      callbackPath="discourse/callback"
      callbackBaseUrlHint="本平台域名(回调地址),需要在 Discourse 后台 SSO 设置中配置"
      loading={loading}
      onSubmit={handleSubmit}
      instructions={
        <ol className="list-decimal space-y-1.5 pl-5 text-xs">
          <li>登录 enterscholar.com 后台 → Settings → Login → DiscourseConnect</li>
          <li>启用 enable discourse connect provider</li>
          <li>SSO Secret 自定义一段随机字符串(同时填入此处)</li>
          <li>SSO Provider URL 填本平台 callback 地址</li>
        </ol>
      }
    />
  );
});

DiscourseTab.displayName = 'DiscourseTab';
export default DiscourseTab;

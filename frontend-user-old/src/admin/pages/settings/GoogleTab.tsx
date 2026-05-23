import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { GoogleIcon } from '../../../components/icons/providers';
import { OAuthProviderForm } from '../../components/v2/OAuthProviderForm';

interface GoogleConfigState {
  googleClientId: string;
  googleClientSecret: string;
  googleEnabled: boolean;
  googleHasSecret?: boolean;
}

const GoogleTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<GoogleConfigState>({
    googleClientId: '',
    googleClientSecret: '',
    googleEnabled: false,
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getGoogleConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          googleClientId: d.client_id ?? '',
          googleClientSecret: showSensitive ? (d.client_secret ?? '') : '',
          googleEnabled: d.enabled ?? false,
          googleHasSecret: !!(d.client_secret && d.client_secret !== ''),
        });
      }
    } catch (err) {
      console.error('Failed to load Google config:', err);
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
        client_id: cfg.googleClientId,
        enabled: cfg.googleEnabled,
      };
      if (cfg.googleClientSecret) data.client_secret = cfg.googleClientSecret;
      const r = await adminAPI.updateGoogleConfig(data);
      if (r.data.code === 0) {
        showToast('Google 配置已保存', 'success');
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
      icon={<GoogleIcon size={22} />}
      title="Google 登录配置"
      description="配置 Google OAuth 2.0 客户端,支持用户通过 Google 账号登录"
      enabled={cfg.googleEnabled}
      onEnabledChange={(v) => setCfg({ ...cfg, googleEnabled: v })}
      clientId={cfg.googleClientId}
      onClientIdChange={(v) => setCfg({ ...cfg, googleClientId: v })}
      clientIdPlaceholder="xxxxx.apps.googleusercontent.com"
      clientIdHint="Google Cloud Console → API & Services → Credentials"
      clientSecret={cfg.googleClientSecret}
      onClientSecretChange={(v) => setCfg({ ...cfg, googleClientSecret: v })}
      hasSecret={cfg.googleHasSecret}
      loading={loading}
      onSubmit={handleSubmit}
      instructions={
        <ol className="list-decimal space-y-1.5 pl-5 text-xs">
          <li>访问 <code>console.cloud.google.com</code>,创建/选择项目</li>
          <li>API & Services → Credentials → Create credentials → OAuth client ID</li>
          <li>Application type 选 Web application</li>
          <li>Authorized redirect URIs 添加 <code>https://your-domain/google/callback</code></li>
          <li>创建后复制 Client ID 与 Client Secret</li>
        </ol>
      }
    />
  );
});

GoogleTab.displayName = 'GoogleTab';
export default GoogleTab;

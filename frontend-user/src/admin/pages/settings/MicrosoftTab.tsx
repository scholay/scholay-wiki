import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { MicrosoftIcon } from '../../../components/icons/providers';
import { OAuthProviderForm } from '../../components/v2/OAuthProviderForm';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

interface MicrosoftConfigState {
  msClientId: string;
  msClientSecret: string;
  msRedirectUri: string;
  msTenant: string;
  msEnabled: boolean;
  msHasSecret?: boolean;
}

const MicrosoftTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<MicrosoftConfigState>({
    msClientId: '',
    msClientSecret: '',
    msRedirectUri: '',
    msTenant: 'common',
    msEnabled: false,
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getMicrosoftConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          msClientId: d.client_id ?? '',
          msClientSecret: showSensitive ? (d.client_secret ?? '') : '',
          msRedirectUri: d.redirect_uri ?? '',
          msTenant: d.tenant ?? 'common',
          msEnabled: d.enabled ?? false,
          msHasSecret: !!(d.client_secret && d.client_secret !== ''),
        });
      }
    } catch (err) {
      console.error('Failed to load Microsoft config:', err);
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
        client_id: cfg.msClientId,
        redirect_uri: cfg.msRedirectUri.replace(/\/$/, ''),
        tenant: cfg.msTenant,
        enabled: cfg.msEnabled,
      };
      if (cfg.msClientSecret) data.client_secret = cfg.msClientSecret;
      const r = await adminAPI.updateMicrosoftConfig(data);
      if (r.data.code === 0) {
        showToast('Microsoft 配置已保存', 'success');
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
      icon={<MicrosoftIcon size={22} />}
      title="Microsoft 登录配置"
      description="配置 Azure AD 应用,支持 Microsoft 账号 / 工作账号登录"
      enabled={cfg.msEnabled}
      onEnabledChange={(v) => setCfg({ ...cfg, msEnabled: v })}
      clientId={cfg.msClientId}
      onClientIdChange={(v) => setCfg({ ...cfg, msClientId: v })}
      clientIdPlaceholder="00000000-0000-0000-0000-000000000000"
      clientIdHint="Azure Portal → App registrations → Application (client) ID"
      clientSecret={cfg.msClientSecret}
      onClientSecretChange={(v) => setCfg({ ...cfg, msClientSecret: v })}
      hasSecret={cfg.msHasSecret}
      callbackBaseUrl={cfg.msRedirectUri}
      onCallbackBaseUrlChange={(v) => setCfg({ ...cfg, msRedirectUri: v })}
      callbackPath="microsoft/callback"
      callbackBaseUrlHint="网站根域名,含协议,不要以 / 结尾"
      extras={
        <div className="space-y-1.5">
          <Label>Tenant</Label>
          <Input
            value={cfg.msTenant}
            onChange={(e) => setCfg({ ...cfg, msTenant: e.target.value })}
            placeholder="common / organizations / consumers / 或具体租户 ID"
          />
          <p className="text-xs text-muted-foreground">
            common = 任意账号 · organizations = 工作账号 · consumers = 个人账号
          </p>
        </div>
      }
      loading={loading}
      onSubmit={handleSubmit}
      instructions={
        <ol className="list-decimal space-y-1.5 pl-5 text-xs">
          <li>访问 <code>portal.azure.com</code> → Azure Active Directory → App registrations → New registration</li>
          <li>Redirect URI 选 Web,填入上方"回调地址"</li>
          <li>注册后在 Overview 拿到 Application (client) ID 与 Directory (tenant) ID</li>
          <li>Certificates & secrets → New client secret 生成 Secret(只显示一次)</li>
        </ol>
      }
    />
  );
});

MicrosoftTab.displayName = 'MicrosoftTab';
export default MicrosoftTab;

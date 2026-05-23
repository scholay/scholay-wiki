import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { OrcidIcon } from '../../../components/icons/providers';
import { OAuthProviderForm } from '../../components/v2/OAuthProviderForm';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';

interface OrcidConfigState {
  orcidClientId: string;
  orcidClientSecret: string;
  orcidRedirectUri: string;
  orcidUseSandbox: boolean;
  orcidEnabled: boolean;
  orcidHasSecret?: boolean;
}

const OrcidTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<OrcidConfigState>({
    orcidClientId: '',
    orcidClientSecret: '',
    orcidRedirectUri: '',
    orcidUseSandbox: false,
    orcidEnabled: false,
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getOrcidConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          orcidClientId: d.client_id ?? '',
          orcidClientSecret: showSensitive ? (d.client_secret ?? '') : '',
          orcidRedirectUri: d.redirect_uri ?? '',
          orcidUseSandbox: d.use_sandbox ?? false,
          orcidEnabled: d.enabled ?? false,
          orcidHasSecret: !!(d.client_secret && d.client_secret !== ''),
        });
      }
    } catch (err) {
      console.error('Failed to load ORCID config:', err);
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
        client_id: cfg.orcidClientId,
        redirect_uri: cfg.orcidRedirectUri.replace(/\/$/, ''),
        use_sandbox: cfg.orcidUseSandbox,
        enabled: cfg.orcidEnabled,
      };
      if (cfg.orcidClientSecret) data.client_secret = cfg.orcidClientSecret;
      const r = await adminAPI.updateOrcidConfig(data);
      if (r.data.code === 0) {
        showToast('ORCID 配置已保存', 'success');
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
      icon={<OrcidIcon size={22} />}
      title="ORCID 登录配置"
      description="配置 ORCID OAuth,支持研究者通过 ORCID iD 登录"
      enabled={cfg.orcidEnabled}
      onEnabledChange={(v) => setCfg({ ...cfg, orcidEnabled: v })}
      clientId={cfg.orcidClientId}
      onClientIdChange={(v) => setCfg({ ...cfg, orcidClientId: v })}
      clientIdPlaceholder="APP-XXXXXXXXXXXX"
      clientIdHint="ORCID Developer Tools 中创建的应用 Client ID"
      clientSecret={cfg.orcidClientSecret}
      onClientSecretChange={(v) => setCfg({ ...cfg, orcidClientSecret: v })}
      hasSecret={cfg.orcidHasSecret}
      callbackBaseUrl={cfg.orcidRedirectUri}
      onCallbackBaseUrlChange={(v) => setCfg({ ...cfg, orcidRedirectUri: v })}
      callbackPath="orcid/callback"
      callbackBaseUrlHint="网站根域名,含协议"
      extras={
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-4 py-3">
          <div>
            <Label>使用 Sandbox 环境</Label>
            <p className="text-xs text-muted-foreground">
              开启后走 <code>sandbox.orcid.org</code>,用于测试
            </p>
          </div>
          <Switch
            checked={cfg.orcidUseSandbox}
            onCheckedChange={(v) => setCfg({ ...cfg, orcidUseSandbox: v })}
          />
        </div>
      }
      loading={loading}
      onSubmit={handleSubmit}
      instructions={
        <ol className="list-decimal space-y-1.5 pl-5 text-xs">
          <li>访问 <code>orcid.org/developer-tools</code>(沙盒在 sandbox.orcid.org)</li>
          <li>注册新应用,填写名称、网站、描述</li>
          <li>Redirect URI 添加上方"回调地址"</li>
          <li>创建后获取 Client ID 与 Client Secret</li>
        </ol>
      }
    />
  );
});

OrcidTab.displayName = 'OrcidTab';
export default OrcidTab;

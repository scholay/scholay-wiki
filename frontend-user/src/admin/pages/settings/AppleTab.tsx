import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { AppleIcon } from '../../../components/icons/providers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';

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
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<AppleConfigState>({
    appleServiceId: '',
    appleTeamId: '',
    appleKeyId: '',
    applePrivateKey: '',
    appleRedirectUri: '',
    appleHasKey: false,
    appleEnabled: false,
  });

  const load = useCallback(async () => {
    try {
      const r = await adminAPI.getAppleConfig();
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await adminAPI.updateAppleConfig({
        service_id: cfg.appleServiceId,
        team_id: cfg.appleTeamId,
        key_id: cfg.appleKeyId,
        private_key: cfg.applePrivateKey,
        redirect_uri: cfg.appleRedirectUri.replace(/\/$/, ''),
        enabled: cfg.appleEnabled,
      });
      if (r.data.code === 0) {
        showToast('Apple 配置已保存', 'success');
        load();
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
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-muted/50 p-2">
              <AppleIcon size={22} />
            </div>
            <div>
              <CardTitle className="text-lg">Apple 登录配置</CardTitle>
              <CardDescription className="mt-1">
                配置 Sign in with Apple,需要在 Apple Developer 创建 Service ID 和 Sign in with Apple Key
              </CardDescription>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{cfg.appleEnabled ? '已启用' : '未启用'}</span>
            <Switch
              checked={cfg.appleEnabled}
              onCheckedChange={(v) => setCfg({ ...cfg, appleEnabled: v })}
            />
          </label>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Service ID (Identifier)</Label>
              <Input
                value={cfg.appleServiceId}
                onChange={(e) => setCfg({ ...cfg, appleServiceId: e.target.value })}
                placeholder="com.example.app.signin"
                required
              />
              <p className="text-xs text-muted-foreground">
                Apple Developer → Identifiers → Services IDs
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Team ID</Label>
              <Input
                value={cfg.appleTeamId}
                onChange={(e) => setCfg({ ...cfg, appleTeamId: e.target.value })}
                placeholder="XXXXXXXXXX"
                required
              />
              <p className="text-xs text-muted-foreground">
                Membership → Team ID(右上角)
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Key ID</Label>
            <Input
              value={cfg.appleKeyId}
              onChange={(e) => setCfg({ ...cfg, appleKeyId: e.target.value })}
              placeholder="ABCDEFGHIJ"
              required
            />
            <p className="text-xs text-muted-foreground">
              Keys → 创建的 Sign in with Apple Key 的 Key ID
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>
              Private Key (.p8 文件内容){' '}
              {cfg.appleHasKey && <span className="text-emerald-600">已配置</span>}
            </Label>
            <textarea
              className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={cfg.applePrivateKey}
              onChange={(e) => setCfg({ ...cfg, applePrivateKey: e.target.value })}
              placeholder={
                cfg.appleHasKey
                  ? '已有 Private Key,留空表示不修改'
                  : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Redirect URI</Label>
            <Input
              type="url"
              value={cfg.appleRedirectUri}
              onChange={(e) => setCfg({ ...cfg, appleRedirectUri: e.target.value })}
              placeholder="https://your-domain.com/apple/callback"
              required
            />
            <p className="text-xs text-muted-foreground">
              需要在 Service ID 的 Return URLs 中也配置同一地址
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
});

AppleTab.displayName = 'AppleTab';
export default AppleTab;

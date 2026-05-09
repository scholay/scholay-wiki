import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';

interface SystemConfigState {
  requireEmailVerification: boolean;
  enableTurnstile: boolean;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  turnstileHasSecret?: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

const SystemTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<SystemConfigState>({
    requireEmailVerification: true,
    enableTurnstile: false,
    turnstileSiteKey: '',
    turnstileSecretKey: '',
    maintenanceMode: false,
    maintenanceMessage: '',
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getSystemConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setCfg({
          requireEmailVerification: d.require_email_verification ?? true,
          enableTurnstile: d.enable_turnstile ?? false,
          turnstileSiteKey: d.turnstile_site_key ?? '',
          turnstileSecretKey: showSensitive ? (d.turnstile_secret_key ?? '') : '',
          turnstileHasSecret: !!(d.turnstile_secret_key && d.turnstile_secret_key !== ''),
          maintenanceMode: !!d.maintenance_mode,
          maintenanceMessage: d.maintenance_message ?? '系统维护中,请稍后访问',
        });
      }
    } catch (err) {
      console.error('Failed to load system config:', err);
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
        require_email_verification: cfg.requireEmailVerification,
        enable_turnstile: cfg.enableTurnstile,
        turnstile_site_key: cfg.turnstileSiteKey,
        maintenance_mode: cfg.maintenanceMode ? 1 : 0,
        maintenance_message: cfg.maintenanceMessage,
      };
      if (cfg.turnstileSecretKey) data.turnstile_secret_key = cfg.turnstileSecretKey;
      const r = await adminAPI.updateSystemConfig(data);
      if (r.data.code === 0) {
        showToast('系统配置已保存', 'success');
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
    <Card>
      <CardHeader className="border-b">
        <CardTitle>系统配置</CardTitle>
        <CardDescription>注册校验、人机验证等系统级开关</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 维护模式 — 影响最大,放最顶部 */}
          <div
            className={`rounded-md border p-4 ${
              cfg.maintenanceMode ? 'border-amber-300 bg-amber-50/70' : 'bg-background'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className={cfg.maintenanceMode ? 'text-amber-900' : ''}>
                  🛠 维护模式
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  开启后,普通用户访问 API 返回 503;管理员仍可登录后台
                </p>
              </div>
              <Switch
                checked={cfg.maintenanceMode}
                onCheckedChange={(v) => setCfg({ ...cfg, maintenanceMode: v })}
              />
            </div>
            {cfg.maintenanceMode && (
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs">维护文案(展示给用户)</Label>
                <Input
                  value={cfg.maintenanceMessage}
                  onChange={(e) => setCfg({ ...cfg, maintenanceMessage: e.target.value })}
                  placeholder="系统升级中,预计 30 分钟后恢复"
                />
              </div>
            )}
          </div>

          <SwitchRow
            title="邮箱验证码验证"
            desc="启用后,用户登录/注册时需要输入邮箱验证码"
            checked={cfg.requireEmailVerification}
            onChange={(v) => setCfg({ ...cfg, requireEmailVerification: v })}
          />

          <SwitchRow
            title="Cloudflare Turnstile 人机验证"
            desc="启用后,登录/注册时需要通过 Turnstile 验证"
            checked={cfg.enableTurnstile}
            onChange={(v) => setCfg({ ...cfg, enableTurnstile: v })}
          />

          {cfg.enableTurnstile && (
            <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Site Key (公钥)</Label>
                <Input
                  value={cfg.turnstileSiteKey}
                  onChange={(e) => setCfg({ ...cfg, turnstileSiteKey: e.target.value })}
                  placeholder="1x00000000000000000000AA"
                />
                <p className="text-xs text-muted-foreground">从 Cloudflare Turnstile 控制台获取</p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Secret Key (私钥){' '}
                  {cfg.turnstileHasSecret && (
                    <span className="font-medium text-emerald-600">已设置</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={cfg.turnstileSecretKey}
                  onChange={(e) => setCfg({ ...cfg, turnstileSecretKey: e.target.value })}
                  placeholder={cfg.turnstileHasSecret ? '••••••••' : '1x000000000000000000000000000000AA'}
                />
                <p className="text-xs text-muted-foreground">留空表示不修改</p>
              </div>
            </div>
          )}

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

function SwitchRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-4 py-3">
      <div>
        <Label>{title}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

SystemTab.displayName = 'SystemTab';
export default SystemTab;

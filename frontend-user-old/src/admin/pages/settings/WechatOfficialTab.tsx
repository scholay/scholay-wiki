import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Copy, RefreshCw, MessageSquare } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

interface OfficialForm {
  app_id: string;
  app_secret: string;
  token: string;
  encoding_aes_key: string;
  encryption_mode: string;
  auto_reply_enabled: boolean;
  ai_model_level: string;
  system_prompt: string;
}

const WechatOfficialTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [cfg, setCfg] = useState<OfficialForm>({
    app_id: '',
    app_secret: '',
    token: '',
    encoding_aes_key: '',
    encryption_mode: 'plaintext',
    auto_reply_enabled: false,
    ai_model_level: 'low',
    system_prompt: '',
  });

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getWeChatOfficialConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setHasSaved(true);
        setHasSecret(!!d.app_secret);
        setCfg({
          app_id: d.app_id || '',
          app_secret: showSensitive ? (d.app_secret || '') : '',
          token: d.token || '',
          encoding_aes_key: d.encoding_aes_key || '',
          encryption_mode: d.encryption_mode || 'plaintext',
          auto_reply_enabled: !!d.auto_reply_enabled,
          ai_model_level: d.ai_model_level || 'low',
          system_prompt: d.system_prompt || '',
        });
      }
    } catch (err) {
      console.error('Failed to load WeChat official config:', err);
    }
  }, []);

  useEffect(() => {
    load(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const generateAesKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 43; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    setCfg({ ...cfg, encoding_aes_key: key });
    showToast('已生成新 AES Key', 'success');
  };

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/wechat-official/webhook`
      : '';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data: any = { ...cfg };
      if (!cfg.app_secret) delete data.app_secret;
      const r = await adminAPI.updateWeChatOfficialConfig(data);
      if (r.data.code === 0) {
        showToast('微信公众号配置已保存', 'success');
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
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted/50 p-2">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>微信公众号</CardTitle>
            <CardDescription>对接微信公众号 API,支持 AI 自动回复</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>公众号 App ID</Label>
              <Input value={cfg.app_id} onChange={(e) => setCfg({ ...cfg, app_id: e.target.value })} placeholder="wx00000000000000" required />
            </div>
            <div className="space-y-1.5">
              <Label>App Secret {hasSecret && <span className="text-emerald-600">已设置</span>}</Label>
              <Input
                type="password"
                value={cfg.app_secret}
                onChange={(e) => setCfg({ ...cfg, app_secret: e.target.value })}
                placeholder={hasSecret ? '••••••••' : '公众号 App Secret'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Token</Label>
              <Input value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder="跟微信后台一致" required />
            </div>
            <div className="space-y-1.5">
              <Label>消息加解密方式</Label>
              <Select value={cfg.encryption_mode} onValueChange={(v) => setCfg({ ...cfg, encryption_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plaintext">明文模式</SelectItem>
                  <SelectItem value="compatible">兼容模式</SelectItem>
                  <SelectItem value="safe">安全模式</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {cfg.encryption_mode !== 'plaintext' && (
            <div className="space-y-1.5">
              <Label>EncodingAESKey (43 位)</Label>
              <div className="flex gap-2">
                <Input
                  value={cfg.encoding_aes_key}
                  onChange={(e) => setCfg({ ...cfg, encoding_aes_key: e.target.value })}
                  maxLength={43}
                  className="font-mono"
                />
                <Button type="button" variant="outline" onClick={generateAesKey}>
                  <RefreshCw className="h-4 w-4" />
                  生成
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Webhook URL (粘贴到微信公众号后台 → 服务器配置)</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="bg-muted/50" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  showToast('已复制', 'success');
                }}
              >
                <Copy className="h-4 w-4" />
                复制
              </Button>
            </div>
          </div>

          {/* AI 自动回复 */}
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>启用 AI 自动回复</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  关注用户发消息时,自动用 AI 生成回复
                </p>
              </div>
              <Switch
                checked={cfg.auto_reply_enabled}
                onCheckedChange={(v) => setCfg({ ...cfg, auto_reply_enabled: v })}
              />
            </div>

            {cfg.auto_reply_enabled && (
              <>
                <div className="space-y-1.5">
                  <Label>模型档位</Label>
                  <Select value={cfg.ai_model_level} onValueChange={(v) => setCfg({ ...cfg, ai_model_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">低档(快/便宜)</SelectItem>
                      <SelectItem value="mid">中档</SelectItem>
                      <SelectItem value="high">高档(慢/贵)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    对应第三方账号配置中的 model_low / model_mid / model_high
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>系统 Prompt</Label>
                  <textarea
                    className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cfg.system_prompt}
                    onChange={(e) => setCfg({ ...cfg, system_prompt: e.target.value })}
                    placeholder="你是一个友好的学术助手,回复要简洁、礼貌,不超过 200 字"
                  />
                </div>
              </>
            )}
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

WechatOfficialTab.displayName = 'WechatOfficialTab';
export default WechatOfficialTab;

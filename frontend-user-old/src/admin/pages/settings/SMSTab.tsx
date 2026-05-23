import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Send, MessageSquare } from 'lucide-react';

interface SMSConfigForm {
  accessKeyId: string;
  accessSecret: string;
  signName: string;
  templateCode: string;
  templateContent: string;
  endpoint: string;
}

const SMSTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [cfg, setCfg] = useState<SMSConfigForm>({
    accessKeyId: '',
    accessSecret: '',
    signName: '',
    templateCode: '',
    templateContent: '',
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getSMSConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setHasSaved(true);
        setHasSecret(!!d.access_secret);
        setCfg({
          accessKeyId: d.access_key_id || '',
          accessSecret: showSensitive ? (d.access_secret || '') : '',
          signName: d.sign_name || '',
          templateCode: d.template_code || '',
          templateContent: d.template_content || '',
          endpoint: d.endpoint || 'dypnsapi.aliyuncs.com',
        });
      }
    } catch (err) {
      console.error('Failed to load SMS config:', err);
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
      const data: any = { ...cfg };
      if (!cfg.accessSecret) delete data.accessSecret;
      const r = await adminAPI.updateSMSConfig(data);
      if (r.data.code === 0) {
        showToast('短信配置已保存', 'success');
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

  const handleTest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!testPhone || !/^1[3-9]\d{9}$/.test(testPhone)) {
      showToast('请输入有效的手机号', 'error');
      return;
    }
    if (!hasSaved) {
      showToast('请先保存配置后再测试', 'error');
      return;
    }
    setTesting(true);
    try {
      const r = await adminAPI.testSMSConfig({ phone_number: testPhone, use_saved_config: true });
      if (r.data.code === 0) {
        showToast('测试短信已发送', 'success');
        setTestPhone('');
      } else {
        showToast(r.data.message || '发送失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '发送失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted/50 p-2">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>短信服务配置</CardTitle>
              <CardDescription>阿里云短信服务,用于发送手机验证码</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Access Key ID</Label>
                <Input
                  value={cfg.accessKeyId}
                  onChange={(e) => setCfg({ ...cfg, accessKeyId: e.target.value })}
                  placeholder="LTAIxxxxxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Access Secret{' '}
                  {hasSecret && <span className="text-emerald-600">已设置</span>}
                </Label>
                <Input
                  type="password"
                  value={cfg.accessSecret}
                  onChange={(e) => setCfg({ ...cfg, accessSecret: e.target.value })}
                  placeholder={hasSecret ? '••••••••' : '阿里云访问密钥'}
                />
                <p className="text-xs text-muted-foreground">留空表示不修改</p>
              </div>
              <div className="space-y-1.5">
                <Label>签名 (sign_name)</Label>
                <Input
                  value={cfg.signName}
                  onChange={(e) => setCfg({ ...cfg, signName: e.target.value })}
                  placeholder="例:Scholay 学术"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>模板 Code</Label>
                <Input
                  value={cfg.templateCode}
                  onChange={(e) => setCfg({ ...cfg, templateCode: e.target.value })}
                  placeholder="SMS_xxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>模板内容</Label>
                <Input
                  value={cfg.templateContent}
                  onChange={(e) => setCfg({ ...cfg, templateContent: e.target.value })}
                  placeholder="您的验证码是 ${code},5 分钟内有效"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  仅用于本地展示,实际发送以阿里云模板为准
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Endpoint</Label>
                <Input
                  value={cfg.endpoint}
                  onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })}
                  placeholder="dypnsapi.aliyuncs.com"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? '保存中…' : '保存配置'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {hasSaved && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">发送测试短信</CardTitle>
            <CardDescription>验证短信服务是否可用</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleTest} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1 space-y-1.5">
                <Label>手机号</Label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="13800000000"
                  maxLength={11}
                />
              </div>
              <Button type="submit" variant="outline" disabled={testing}>
                <Send className="h-4 w-4" />
                {testing ? '发送中…' : '发送测试'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

SMSTab.displayName = 'SMSTab';
export default SMSTab;

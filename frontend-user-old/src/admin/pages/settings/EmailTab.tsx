import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Send, Mail } from 'lucide-react';

interface EmailConfigForm {
  smtpHost: string;
  smtpPort: number | string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
}

const EmailTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [cfg, setCfg] = useState<EmailConfigForm>({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
  });
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async (showSensitive: boolean) => {
    try {
      const r = await adminAPI.getEmailConfig(showSensitive);
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setHasSaved(true);
        setHasPassword(!!d.smtp_password);
        setCfg({
          smtpHost: d.smtp_host || '',
          smtpPort: d.smtp_port || '',
          smtpUser: d.smtp_user || '',
          smtpPassword: showSensitive ? (d.smtp_password || '') : '',
          fromEmail: d.from_email || '',
          fromName: d.from_name || '',
        });
      }
    } catch (err) {
      console.error('Failed to load email config:', err);
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
      const data: any = { ...cfg, smtpPort: typeof cfg.smtpPort === 'string' ? parseInt(cfg.smtpPort, 10) : cfg.smtpPort };
      if (!cfg.smtpPassword) delete data.smtpPassword;
      const r = await adminAPI.updateEmailConfig(data);
      if (r.data.code === 0) {
        showToast('邮箱配置已保存', 'success');
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
    if (!testEmail || !testEmail.includes('@')) {
      showToast('请输入有效的邮箱地址', 'error');
      return;
    }
    if (!hasSaved) {
      showToast('请先保存配置后再测试', 'error');
      return;
    }
    setTesting(true);
    try {
      const r = await adminAPI.testEmailConfig({ testEmail });
      if (r.data.code === 0) {
        showToast('测试邮件已发送,请检查收件箱', 'success');
        setTestEmail('');
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
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>邮箱服务器配置</CardTitle>
              <CardDescription>SMTP 服务器,用于发送验证邮件 / 通知</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>SMTP 服务器</Label>
                <Input
                  value={cfg.smtpHost}
                  onChange={(e) => setCfg({ ...cfg, smtpHost: e.target.value })}
                  placeholder="smtp.example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>端口</Label>
                <Input
                  type="number"
                  value={cfg.smtpPort}
                  onChange={(e) => setCfg({ ...cfg, smtpPort: e.target.value })}
                  placeholder="587"
                  required
                />
                <p className="text-xs text-muted-foreground">587 用 STARTTLS · 465 用 SSL</p>
              </div>
              <div className="space-y-1.5">
                <Label>SMTP 用户名</Label>
                <Input
                  value={cfg.smtpUser}
                  onChange={(e) => setCfg({ ...cfg, smtpUser: e.target.value })}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  SMTP 密码{' '}
                  {hasPassword && <span className="text-emerald-600">已设置</span>}
                </Label>
                <Input
                  type="password"
                  value={cfg.smtpPassword}
                  onChange={(e) => setCfg({ ...cfg, smtpPassword: e.target.value })}
                  placeholder={hasPassword ? '••••••••' : '应用专用密码'}
                />
                <p className="text-xs text-muted-foreground">留空表示不修改</p>
              </div>
              <div className="space-y-1.5">
                <Label>发件人邮箱</Label>
                <Input
                  type="email"
                  value={cfg.fromEmail}
                  onChange={(e) => setCfg({ ...cfg, fromEmail: e.target.value })}
                  placeholder="noreply@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>发件人名称</Label>
                <Input
                  value={cfg.fromName}
                  onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })}
                  placeholder="Scholay 学术"
                  required
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
            <CardTitle className="text-base">发送测试邮件</CardTitle>
            <CardDescription>验证 SMTP 配置是否可用</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleTest} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[280px] flex-1 space-y-1.5">
                <Label>收件邮箱</Label>
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
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

EmailTab.displayName = 'EmailTab';
export default EmailTab;

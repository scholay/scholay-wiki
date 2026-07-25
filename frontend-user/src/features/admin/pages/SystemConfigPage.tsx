import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Save, Send, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { CodeSnippetsPanel } from './CodeSnippetsPage';
import { useApiToast } from '../hooks/useApiToast';
import {
  useEmailConfig,
  useUpdateEmailConfig,
  useTestEmailConfig,
  useSMSConfig,
  useUpdateSMSConfig,
  useTestSMSConfig,
  useSystemConfig,
  useUpdateSystemConfig,
} from '../api/system-config';

/**
 * 隐私政策 / 服务条款 已经下线为代码常量(见 frontend-v2/src/features/help/legal-content.ts +
 * 0046 迁移),这里不再提供 admin 编辑入口。
 */
export function SystemConfigPage() {
  return (
    <AdminPageLayout title="系统设置" description="平台基础配置 · 通知通道 · 注入脚本">
      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">基础</TabsTrigger>
          <TabsTrigger value="email">邮件</TabsTrigger>
          <TabsTrigger value="sms">短信</TabsTrigger>
          <TabsTrigger value="snippets">代码片段库</TabsTrigger>
        </TabsList>

        <TabsContent value="system"><SystemBasicForm /></TabsContent>
        <TabsContent value="email"><EmailForm /></TabsContent>
        <TabsContent value="sms"><SMSForm /></TabsContent>
        <TabsContent value="snippets" className="mt-4"><CodeSnippetsPanel /></TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}

// ============================================================================
// 共用 panel 容器
// ============================================================================

function Panel({ title, hint, children, onSubmit }: { title: string; hint?: string; children: ReactNode; onSubmit?: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-border bg-background p-4 sm:p-6 space-y-4 max-w-3xl"
    >
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      {children}
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="mt-4 rounded-md border border-border bg-background p-6 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">加载配置…</span>
    </div>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <div className="pt-3 border-t border-border-soft">
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        保存配置
      </Button>
    </div>
  );
}

// ============================================================================
// 基础配置 —— 邮件验证 + Turnstile 人机校验
// (后端 SystemConfig 实际只有这几个字段)
// ============================================================================

function SystemBasicForm() {
  // 默认脱敏; 点 Secret Key 右侧小眼睛 → reveal=true → 重新拉取明文 (show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useSystemConfig({ showSensitive: reveal });
  const update = useUpdateSystemConfig();
  const apiToast = useApiToast();
  const [secretKey, setSecretKey] = useState('');

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setSecretKey(data?.turnstile_secret_key ?? '');
  }, [data?.turnstile_secret_key]);

  if (isLoading) return <LoadingPanel />;

  return (
    <Panel
      title="平台基础配置"
      hint="邮件验证开关 · Cloudflare Turnstile 人机校验"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            require_email_verification: fd.get('require_email_verification') === 'on',
            enable_turnstile: fd.get('enable_turnstile') === 'on',
            turnstile_site_key: String(fd.get('turnstile_site_key') || ''),
            turnstile_secret_key: String(fd.get('turnstile_secret_key') || ''),
            google_analytics_id: String(fd.get('google_analytics_id') || '').trim(),
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="flex items-center gap-2">
        <input id="require_email_verification" name="require_email_verification" type="checkbox" defaultChecked={data?.require_email_verification} className="size-4" />
        <Label htmlFor="require_email_verification" className="text-sm">注册时必须验证邮箱</Label>
      </div>

      <div className="flex items-center gap-2">
        <input id="enable_turnstile" name="enable_turnstile" type="checkbox" defaultChecked={data?.enable_turnstile} className="size-4" />
        <Label htmlFor="enable_turnstile" className="text-sm">启用 Cloudflare Turnstile</Label>
      </div>

      <Field label="Turnstile Site Key">
        <Input name="turnstile_site_key" defaultValue={data?.turnstile_site_key} placeholder="0x4AAAA..." />
      </Field>
      <Field label="Turnstile Secret Key">
        <SecretInput
          name="turnstile_secret_key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          revealed={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          placeholder="留空表示不修改"
        />
      </Field>

      <Field label="Google 分析 ID">
        <Input name="google_analytics_id" defaultValue={data?.google_analytics_id} placeholder="G-XXXXXXXXXX(GA4)或 GTM-XXXXXXX(GTM),留空 = 不接入" />
        <p className="mt-1 text-2xs text-faint">
          GA4 衡量 ID(G- 开头)或 GTM 容器 ID(GTM- 开头),前端自动按前缀加载对应脚本。analytics.google.com → 管理 → 数据流 获取 G-XXXX。
        </p>
      </Field>

      <SaveButton pending={update.isPending} />
    </Panel>
  );
}

// ============================================================================
// 邮件 SMTP
// ============================================================================

function EmailForm() {
  // 默认脱敏; 点 SMTP Password 右侧小眼睛 → reveal=true → 重新拉取明文 (show_password)。
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useEmailConfig({ showSensitive: reveal });
  const update = useUpdateEmailConfig();
  const testApi = useTestEmailConfig();
  const apiToast = useApiToast();
  const [testTo, setTestTo] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setSmtpPassword(data?.smtp_password ?? '');
  }, [data?.smtp_password]);

  if (isLoading) return <LoadingPanel />;

  return (
    <Panel
      title="邮件 SMTP"
      hint="标准 SMTP 服务商配置。修改密码留空表示不变。"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            smtp_host: String(fd.get('smtp_host') || ''),
            smtp_port: Number(fd.get('smtp_port') || 587),
            smtp_user: String(fd.get('smtp_user') || ''),
            smtp_password: String(fd.get('smtp_password') || '') || undefined,
            from_email: String(fd.get('from_email') || ''),
            from_name: String(fd.get('from_name') || ''),
            is_active: fd.get('is_active') === 'on',
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="SMTP Host"><Input name="smtp_host" defaultValue={data?.smtp_host} required /></Field>
        <Field label="SMTP Port"><Input name="smtp_port" type="number" defaultValue={data?.smtp_port || 587} required /></Field>
        <Field label="SMTP User"><Input name="smtp_user" defaultValue={data?.smtp_user} required /></Field>
        <Field label="SMTP Password">
          <SecretInput
            name="smtp_password"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
            revealed={reveal}
            onToggleReveal={() => setReveal((v) => !v)}
            placeholder="留空表示不修改"
          />
        </Field>
        <Field label="From Email"><Input name="from_email" type="email" defaultValue={data?.from_email} required /></Field>
        <Field label="From Name"><Input name="from_name" defaultValue={data?.from_name} placeholder="Scholay" /></Field>
      </div>

      <div className="flex items-center gap-2">
        <input id="email-active" name="is_active" type="checkbox" defaultChecked={data?.is_active} className="size-4" />
        <Label htmlFor="email-active" className="text-sm">启用</Label>
      </div>

      <div className="flex items-end gap-2 pt-3 border-t border-border-soft">
        <Field label="测试邮件接收地址" className="flex-1">
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} type="email" placeholder="test@example.com" />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={!testTo || testApi.isPending}
          onClick={() => apiToast(testApi.mutateAsync(testTo), { success: '测试邮件已发送', failure: '测试失败' })}
        >
          {testApi.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          发送测试
        </Button>
      </div>

      <SaveButton pending={update.isPending} />
    </Panel>
  );
}

// ============================================================================
// SMS
// ============================================================================

function SMSForm() {
  // 默认脱敏; 点 Access Secret 右侧小眼睛 → reveal=true → 重新拉取明文 (show_secret)。
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useSMSConfig({ showSensitive: reveal });
  const update = useUpdateSMSConfig();
  const testApi = useTestSMSConfig();
  const apiToast = useApiToast();
  const [testPhone, setTestPhone] = useState('');
  const [accessSecret, setAccessSecret] = useState('');

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setAccessSecret(data?.access_secret ?? '');
  }, [data?.access_secret]);

  if (isLoading) return <LoadingPanel />;

  return (
    <Panel
      title="短信网关"
      hint="阿里云 SMS 风格。Access Secret 留空表示不修改。"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            access_key_id: String(fd.get('access_key_id') || ''),
            access_secret: String(fd.get('access_secret') || '') || undefined,
            sign_name: String(fd.get('sign_name') || ''),
            template_code: String(fd.get('template_code') || ''),
            template_content: String(fd.get('template_content') || ''),
            endpoint: String(fd.get('endpoint') || ''),
            is_active: fd.get('is_active') === 'on',
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Access Key ID"><Input name="access_key_id" defaultValue={data?.access_key_id} required /></Field>
        <Field label="Access Secret">
          <SecretInput
            name="access_secret"
            value={accessSecret}
            onChange={(e) => setAccessSecret(e.target.value)}
            revealed={reveal}
            onToggleReveal={() => setReveal((v) => !v)}
            placeholder="留空表示不修改"
          />
        </Field>
        <Field label="签名"><Input name="sign_name" defaultValue={data?.sign_name} required /></Field>
        <Field label="模板 Code"><Input name="template_code" defaultValue={data?.template_code} placeholder="SMS_xxxxxxxxx" required /></Field>
        <Field label="Endpoint"><Input name="endpoint" defaultValue={data?.endpoint} placeholder="dysmsapi.aliyuncs.com" /></Field>
      </div>

      <Field label="模板内容(显示给运营核对)">
        <textarea
          name="template_content"
          rows={3}
          defaultValue={data?.template_content}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      <div className="flex items-center gap-2">
        <input id="sms-active" name="is_active" type="checkbox" defaultChecked={data?.is_active} className="size-4" />
        <Label htmlFor="sms-active" className="text-sm">启用</Label>
      </div>

      <div className="flex items-end gap-2 pt-3 border-t border-border-soft">
        <Field label="测试接收手机号" className="flex-1">
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="13800138000" />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={!testPhone || testApi.isPending}
          onClick={() => apiToast(testApi.mutateAsync(testPhone), { success: '测试短信已发送', failure: '测试失败' })}
        >
          {testApi.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          发送测试
        </Button>
      </div>

      <SaveButton pending={update.isPending} />
    </Panel>
  );
}

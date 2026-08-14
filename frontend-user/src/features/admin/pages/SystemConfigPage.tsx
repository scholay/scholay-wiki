import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Save, Send, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/lib/utils';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ConfigPageGuard } from '../components/ConfigPageGuard';
import { TimeCell } from '../components/TimeCell';
import { CodeSnippetsPanel } from './CodeSnippetsPage';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useEmailConfig,
  useUpdateEmailConfig,
  useTestEmailConfig,
  useSMSConfig,
  useUpdateSMSConfig,
  useTestSMSConfig,
  useSystemConfig,
  useUpdateSystemConfig,
  type EmailConfig,
  type SMSConfig,
  type SystemConfig,
} from '../api/system-config';

/**
 * 隐私政策 / 服务条款 已经下线为代码常量(见 frontend-v2/src/features/help/legal-content.ts +
 * 0046 迁移),这里不再提供 admin 编辑入口。
 *
 * 🔴 三个表单一律走 `ConfigPageGuard`:GET 失败时**绝不渲染表单**。
 * 后端这三个 PUT 都是整行覆盖,而 `require_email_verification` / `enable_turnstile`
 * 被写成 false = 全站关掉邮箱验证与人机校验 —— 一次误点就是线上事故。
 */
export function SystemConfigPage() {
  const qc = useQueryClient();

  // 页面级各拉一次(showSensitive=false,与各 panel 未解蔽时同 queryKey → 不产生额外请求),
  // 只为在 tab 上打「通道是否启用」的状态点:Radix Tabs 非激活内容不挂载,
  // 不在这里拉就永远得逐个 tab 点进去才知道短信通道现在开没开。
  const emailStatus = useEmailConfig({ showSensitive: false });
  const smsStatus = useSMSConfig({ showSensitive: false });

  const fetchingConfig = useIsFetching({ queryKey: ['admin', 'config'] });
  const fetchingSnippets = useIsFetching({ queryKey: ['admin', 'code-snippets'] });

  return (
    <AdminPageLayout
      title="系统设置"
      description="平台基础配置 · 通知通道 · 注入脚本"
      onRefresh={() => {
        void qc.invalidateQueries({ queryKey: ['admin', 'config'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'code-snippets'] });
      }}
      refreshing={fetchingConfig + fetchingSnippets > 0}
    >
      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">基础</TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            邮件
            <ChannelDot isError={emailStatus.isError} active={emailStatus.data?.is_active} label="邮件通道" />
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-2">
            短信
            <ChannelDot isError={smsStatus.isError} active={smsStatus.data?.is_active} label="短信通道" />
          </TabsTrigger>
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

/**
 * tab 上的通道状态点 —— 「短信通道现在开着吗」不该需要点进去看。
 * 加载失败时**不显示成"关"**(那是说反话),显示琥珀点 + "状态未知"。
 */
function ChannelDot({ isError, active, label }: { isError: boolean; active?: boolean; label: string }) {
  if (isError) {
    return (
      <span
        title={`${label}状态未知:配置加载失败`}
        aria-label={`${label}状态未知`}
        className="inline-block size-2 rounded-pill bg-brand-amber"
      />
    );
  }
  if (active === undefined) return null;
  return (
    <span
      title={active ? `${label}已启用` : `${label}未启用`}
      aria-label={active ? `${label}已启用` : `${label}未启用`}
      className={cn('inline-block size-2 rounded-pill', active ? 'bg-brand-green' : 'bg-border-strong')}
    />
  );
}

function Panel({
  title,
  hint,
  meta,
  children,
  onSubmit,
}: {
  title: string;
  hint?: string;
  /** 头部右侧的元信息槽 —— 这里放「最后更新」,改动时间此前一处都看不到 */
  meta?: ReactNode;
  children: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-16 border border-border bg-surface-card p-4 sm:p-6 space-y-4 max-w-3xl"
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-border-soft">
        <div>
          <h2 className="text-16 font-medium text-foreground">{title}</h2>
          {hint && <p className="text-12 text-muted-foreground mt-1">{hint}</p>}
        </div>
        {meta}
      </div>
      {children}
    </form>
  );
}

/** 「最后更新 3 天前」—— 悬停看到秒级绝对时刻 */
function UpdatedMeta({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <span className="shrink-0 text-12 text-faint">
      <TimeCell value={value} prefix="最后更新 " />
    </span>
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

/**
 * 全站级闸门开关 —— 这些 boolean 关掉的是「注册要不要验邮箱」「人机校验开不开」
 * 「验证码邮件还发不发」这种整站行为,此前是一个 `<input type="checkbox" class="size-4">`
 * 配一行 text-12 小字,视觉重量比旁边的「From Name」输入框还轻,关掉零阻力。
 *
 * 现在:Switch(受控)+ 开启时的「生效中」徽章 + **关闭时二次确认**。
 * 注意开关只改本地表单态,仍需点保存才落库 —— 描述里写明,免得以为已经生效。
 */
function GateSwitch({
  id,
  label,
  checked,
  onChange,
  hint,
  confirmOffTitle,
  confirmOffDescription,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
  confirmOffTitle: string;
  confirmOffDescription: string;
}) {
  const confirm = useConfirm();

  const handleChange = async (next: boolean) => {
    if (!next) {
      const ok = await confirm({
        title: confirmOffTitle,
        description: confirmOffDescription,
        danger: true,
        confirmText: '仍然关闭',
      });
      if (!ok) return;
    }
    onChange(next);
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-12 border border-border bg-surface-1 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-12">{label}</Label>
          {checked && <Badge variant="success">生效中</Badge>}
        </div>
        {hint && <p className="mt-1 text-12 text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={(v) => void handleChange(v)} />
    </div>
  );
}

function SaveButton({ pending, blocked }: { pending: boolean; blocked?: boolean }) {
  return (
    <div className="pt-3 border-t border-border-soft">
      {/* blocked = 配置没读到(GET 失败 / 空)。ConfigPageGuard 已经挡在外层,
          这里是第二道闸:任何时候都不允许把一份没读到真值的表单 PUT 回去。 */}
      <Button type="submit" disabled={pending || blocked}>
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
  const q = useSystemConfig({ showSensitive: reveal });

  return (
    <ConfigPageGuard query={q} resourceName="平台基础配置">
      {(config) => (
        <SystemBasicFormInner
          config={config}
          reveal={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          blocked={q.isError || !q.data}
        />
      )}
    </ConfigPageGuard>
  );
}

function SystemBasicFormInner({
  config,
  reveal,
  onToggleReveal,
  blocked,
}: {
  config: SystemConfig;
  reveal: boolean;
  onToggleReveal: () => void;
  blocked: boolean;
}) {
  const update = useUpdateSystemConfig();
  const apiToast = useApiToast();
  const [secretKey, setSecretKey] = useState(config.turnstile_secret_key ?? '');
  const [requireEmail, setRequireEmail] = useState(config.require_email_verification);
  const [enableTurnstile, setEnableTurnstile] = useState(config.enable_turnstile);

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setSecretKey(config.turnstile_secret_key ?? '');
  }, [config.turnstile_secret_key]);
  useEffect(() => {
    setRequireEmail(config.require_email_verification);
  }, [config.require_email_verification]);
  useEffect(() => {
    setEnableTurnstile(config.enable_turnstile);
  }, [config.enable_turnstile]);

  return (
    <Panel
      title="平台基础配置"
      hint="邮件验证开关 · Cloudflare Turnstile 人机校验"
      meta={<UpdatedMeta value={config.updated_at} />}
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            require_email_verification: requireEmail,
            enable_turnstile: enableTurnstile,
            turnstile_site_key: String(fd.get('turnstile_site_key') || ''),
            turnstile_secret_key: String(fd.get('turnstile_secret_key') || ''),
            google_analytics_id: String(fd.get('google_analytics_id') || '').trim(),
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <GateSwitch
        id="require_email_verification"
        label="注册时必须验证邮箱"
        checked={requireEmail}
        onChange={setRequireEmail}
        hint="关闭后任何邮箱都能直接注册,不再校验收件能力。保存后生效。"
        confirmOffTitle="关闭注册邮箱验证?"
        confirmOffDescription="关闭后全站注册不再需要邮箱验证码,任意伪造邮箱都能建号(垃圾账号会立刻涌入)。确认要关闭吗?"
      />

      <GateSwitch
        id="enable_turnstile"
        label="启用 Cloudflare Turnstile"
        checked={enableTurnstile}
        onChange={setEnableTurnstile}
        hint="登录 / 注册 / 找回密码的人机校验。保存后生效。"
        confirmOffTitle="关闭全站人机校验?"
        confirmOffDescription="关闭后登录 / 注册 / 找回密码将不再有任何人机校验,脚本可批量撞库与注册。仅建议在 Turnstile 上游故障时临时关闭。"
      />

      <Field label="Turnstile Site Key">
        <Input name="turnstile_site_key" defaultValue={config.turnstile_site_key} placeholder="0x4AAAA..." />
      </Field>
      <Field label="Turnstile Secret Key">
        <SecretInput
          name="turnstile_secret_key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          revealed={reveal}
          onToggleReveal={onToggleReveal}
          placeholder="留空表示不修改"
        />
      </Field>

      <Field label="Google 分析 ID">
        <Input name="google_analytics_id" defaultValue={config.google_analytics_id} placeholder="G-XXXXXXXXXX(GA4)或 GTM-XXXXXXX(GTM),留空 = 不接入" />
        <p className="mt-1 text-12 text-faint">
          GA4 衡量 ID(G- 开头)或 GTM 容器 ID(GTM- 开头),前端自动按前缀加载对应脚本。analytics.google.com → 管理 → 数据流 获取 G-XXXX。
        </p>
      </Field>

      <SaveButton pending={update.isPending} blocked={blocked} />
    </Panel>
  );
}

// ============================================================================
// 邮件 SMTP
// ============================================================================

function EmailForm() {
  // 默认脱敏; 点 SMTP Password 右侧小眼睛 → reveal=true → 重新拉取明文 (show_password)。
  const [reveal, setReveal] = useState(false);
  const q = useEmailConfig({ showSensitive: reveal });

  return (
    <ConfigPageGuard query={q} resourceName="邮件配置">
      {(config) => (
        <EmailFormInner
          config={config}
          reveal={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          blocked={q.isError || !q.data}
        />
      )}
    </ConfigPageGuard>
  );
}

function EmailFormInner({
  config,
  reveal,
  onToggleReveal,
  blocked,
}: {
  config: EmailConfig;
  reveal: boolean;
  onToggleReveal: () => void;
  blocked: boolean;
}) {
  const update = useUpdateEmailConfig();
  const testApi = useTestEmailConfig();
  const apiToast = useApiToast();
  const [testTo, setTestTo] = useState('');
  const [smtpPassword, setSmtpPassword] = useState(config.smtp_password ?? '');
  const [isActive, setIsActive] = useState(config.is_active);

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setSmtpPassword(config.smtp_password ?? '');
  }, [config.smtp_password]);
  useEffect(() => {
    setIsActive(config.is_active);
  }, [config.is_active]);

  return (
    <Panel
      title="邮件 SMTP"
      hint="标准 SMTP 服务商配置。修改密码留空表示不变。"
      meta={<UpdatedMeta value={config.updated_at} />}
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
            is_active: isActive,
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="SMTP Host"><Input name="smtp_host" defaultValue={config.smtp_host} required /></Field>
        <Field label="SMTP Port"><Input name="smtp_port" type="number" defaultValue={config.smtp_port || 587} required /></Field>
        <Field label="SMTP User"><Input name="smtp_user" defaultValue={config.smtp_user} required /></Field>
        <Field label="SMTP Password">
          <SecretInput
            name="smtp_password"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </Field>
        <Field label="From Email"><Input name="from_email" type="email" defaultValue={config.from_email} required /></Field>
        <Field label="From Name"><Input name="from_name" defaultValue={config.from_name} placeholder="Scholay" /></Field>
      </div>

      <GateSwitch
        id="email-active"
        label="启用邮件通道"
        checked={isActive}
        onChange={setIsActive}
        hint="注册验证码 / 找回密码 / 通知邮件都走这个通道。保存后生效。"
        confirmOffTitle="停用邮件通道?"
        confirmOffDescription="停用后全站不再发出任何邮件 —— 注册验证码、找回密码、工单回复通知都会静默失败。确认要停用吗?"
      />

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

      <SaveButton pending={update.isPending} blocked={blocked} />
    </Panel>
  );
}

// ============================================================================
// SMS
// ============================================================================

function SMSForm() {
  // 默认脱敏; 点 Access Secret 右侧小眼睛 → reveal=true → 重新拉取明文 (show_secret)。
  const [reveal, setReveal] = useState(false);
  const q = useSMSConfig({ showSensitive: reveal });

  return (
    <ConfigPageGuard query={q} resourceName="短信配置">
      {(config) => (
        <SMSFormInner
          config={config}
          reveal={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          blocked={q.isError || !q.data}
        />
      )}
    </ConfigPageGuard>
  );
}

function SMSFormInner({
  config,
  reveal,
  onToggleReveal,
  blocked,
}: {
  config: SMSConfig;
  reveal: boolean;
  onToggleReveal: () => void;
  blocked: boolean;
}) {
  const update = useUpdateSMSConfig();
  const testApi = useTestSMSConfig();
  const apiToast = useApiToast();
  const [testPhone, setTestPhone] = useState('');
  const [accessSecret, setAccessSecret] = useState(config.access_secret ?? '');
  const [isActive, setIsActive] = useState(config.is_active);

  // 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按字段值变化触发, 避免无关重拉冲掉编辑中的值。
  useEffect(() => {
    setAccessSecret(config.access_secret ?? '');
  }, [config.access_secret]);
  useEffect(() => {
    setIsActive(config.is_active);
  }, [config.is_active]);

  return (
    <Panel
      title="短信网关"
      hint="阿里云 SMS 风格。Access Secret 留空表示不修改。"
      meta={<UpdatedMeta value={config.updated_at} />}
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
            is_active: isActive,
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Access Key ID"><Input name="access_key_id" defaultValue={config.access_key_id} required /></Field>
        <Field label="Access Secret">
          <SecretInput
            name="access_secret"
            value={accessSecret}
            onChange={(e) => setAccessSecret(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </Field>
        <Field label="签名"><Input name="sign_name" defaultValue={config.sign_name} required /></Field>
        <Field label="模板 Code"><Input name="template_code" defaultValue={config.template_code} placeholder="SMS_xxxxxxxxx" required /></Field>
        <Field label="Endpoint"><Input name="endpoint" defaultValue={config.endpoint} placeholder="dysmsapi.aliyuncs.com" /></Field>
      </div>

      <Field label="模板内容(显示给运营核对)">
        <Textarea
          name="template_content"
          rows={3}
          defaultValue={config.template_content}
        />
      </Field>

      <GateSwitch
        id="sms-active"
        label="启用短信通道"
        checked={isActive}
        onChange={setIsActive}
        hint="手机号验证码登录 / 绑定手机都走这个通道。保存后生效。"
        confirmOffTitle="停用短信通道?"
        confirmOffDescription="停用后全站不再发出任何短信 —— 手机验证码登录与手机绑定会直接失败。确认要停用吗?"
      />

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

      <SaveButton pending={update.isPending} blocked={blocked} />
    </Panel>
  );
}

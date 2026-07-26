import { useEffect, useRef, useState } from 'react';
import { Headset, Inbox, Loader2, MailCheck, Save, Send, Trash2, Upload } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { SecretInput } from '@/shared/ui/secret-input';
import {
  useSupportCenterConfig,
  useUpdateSupportCenterConfig,
  useTestFeishu,
  useTestIMAP,
  useTestSMTP,
  type SupportCenterConfig,
} from '../api/support-center';

/**
 * 客服配置(后台)—— 三块:
 *   1. 联系方式展示:用户端 /contact 页的支持/商务邮箱 + 企微/飞书二维码(data URL 直存)+ 说明
 *   2. 收件箱(IMAP):客服邮箱拉取配置(host/端口/账号/授权码/TLS/间隔)+ 测试连接
 *   3. 飞书通知:群机器人 webhook + 签名 + 分事件开关 + 发送测试
 * 敏感字段(IMAP 密码 / webhook / secret)留空或保持 ******** = 不修改。
 */

const QR_MAX_BYTES = 300 * 1024;

type FormState = Omit<SupportCenterConfig, 'id'>;

const EMPTY: FormState = {
  support_email: '',
  business_email: '',
  contact_note: '',
  wecom_qr: '',
  feishu_qr: '',
  imap_enabled: false,
  imap_host: '',
  imap_port: 993,
  imap_username: '',
  imap_password: '',
  imap_tls: true,
  imap_poll_minutes: 5,
  smtp_host: '',
  smtp_port: 465,
  smtp_username: '',
  smtp_password: '',
  smtp_from_name: '',
  feishu_webhook_url: '',
  feishu_secret: '',
  feishu_notify_feedback: true,
  feishu_notify_email: true,
  feishu_notify_payment: true,
};

export function SupportCenterConfigPage() {
  const [reveal, setReveal] = useState(false);
  const { data: cfg, isLoading } = useSupportCenterConfig(reveal);
  const update = useUpdateSupportCenterConfig();
  const testFeishu = useTestFeishu();
  const testIMAP = useTestIMAP();
  const testSMTP = useTestSMTP();
  const apiToast = useApiToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (cfg) {
      const { id: _id, ...rest } = cfg;
      setForm(rest);
    }
  }, [cfg]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    await apiToast(update.mutateAsync(form), { success: '已保存', failure: '保存失败' });
  };

  const handleTestFeishu = async () => {
    await apiToast(testFeishu.mutateAsync(), {
      success: '已发送,请到飞书群查看',
      failure: '飞书测试失败(先保存配置再测试)',
    });
  };

  const handleTestIMAP = async () => {
    await apiToast(
      testIMAP.mutateAsync().then((r) => (r as { data?: { mailbox_messages?: number } })?.data?.mailbox_messages),
      { success: 'IMAP 连接成功', failure: 'IMAP 连接失败(先保存配置再测试)' },
    );
  };

  const handleTestSMTP = async () => {
    await apiToast(testSMTP.mutateAsync(), {
      success: '测试邮件已发出,请到客服邮箱查收',
      failure: '发信测试失败(先保存配置再测试)',
    });
  };

  return (
    <AdminPageLayout
      title="客服配置"
      description="用户端联系方式展示 · 客服邮箱收件(IMAP) · 飞书通知 —— 测试按钮用「已保存」的配置"
      actions={
        <Button size="sm" onClick={handleSave} disabled={update.isPending || isLoading}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存全部
        </Button>
      }
    >
      <div className="flex flex-col gap-6 max-w-3xl">
        {/* 1. 联系方式展示 */}
        <Section icon={<Headset className="size-4" />} title="联系方式展示(用户端 /contact)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="产品支持邮箱">
              <Input value={form.support_email} onChange={(e) => set('support_email', e.target.value)} placeholder="support@example.com" />
            </Field>
            <Field label="商务合作邮箱">
              <Input value={form.business_email} onChange={(e) => set('business_email', e.target.value)} placeholder="hello@example.com" />
            </Field>
          </div>
          <Field label="联系说明(可空,展示在渠道卡下方)">
            <Input value={form.contact_note} onChange={(e) => set('contact_note', e.target.value)} placeholder="如:工作日 9:00–18:00 在线" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QRUpload label="企业微信二维码" value={form.wecom_qr} onChange={(v) => set('wecom_qr', v)} />
            <QRUpload label="飞书二维码" value={form.feishu_qr} onChange={(v) => set('feishu_qr', v)} />
          </div>
        </Section>

        {/* 2. IMAP 收件 */}
        <Section
          icon={<Inbox className="size-4" />}
          title="客服邮箱收件(IMAP)"
          right={
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">启用拉取</span>
              <Switch checked={form.imap_enabled} onCheckedChange={(v) => set('imap_enabled', v)} />
            </div>
          }
        >
          <p className="text-xs text-muted-foreground">
            填客服邮箱的 IMAP 信息(QQ/网易等邮箱需用「授权码」而非登录密码)。启用后每隔设定分钟自动拉取新邮件到「邮件中心」,并可飞书提醒。回信走「系统设置 → 邮件」里的 SMTP 发信配置。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="IMAP 服务器">
              <Input value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} placeholder="imap.exmail.qq.com" />
            </Field>
            <Field label="端口">
              <Input
                type="number"
                value={form.imap_port}
                onChange={(e) => set('imap_port', Number(e.target.value) || 993)}
              />
            </Field>
            <Field label="邮箱账号">
              <Input value={form.imap_username} onChange={(e) => set('imap_username', e.target.value)} placeholder="support@yourdomain.com" />
            </Field>
            <Field label="密码 / 授权码">
              <SecretInput
                value={form.imap_password}
                onChange={(e) => set('imap_password', e.target.value)}
                revealed={reveal}
                onToggleReveal={() => setReveal((r) => !r)}
                placeholder="留空 = 不修改"
              />
            </Field>
            <Field label="轮询间隔(分钟)">
              <Input
                type="number"
                min={1}
                value={form.imap_poll_minutes}
                onChange={(e) => set('imap_poll_minutes', Number(e.target.value) || 5)}
              />
            </Field>
            <Field label="TLS(993 端口必开)">
              <div className="flex h-9 items-center">
                <Switch checked={form.imap_tls} onCheckedChange={(v) => set('imap_tls', v)} />
              </div>
            </Field>
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={handleTestIMAP} disabled={testIMAP.isPending}>
              {testIMAP.isPending && <Loader2 className="size-3.5 animate-spin" />}
              测试连接
            </Button>
          </div>
        </Section>

        {/* 3. SMTP 发信 */}
        <Section icon={<MailCheck className="size-4" />} title="客服邮箱发信(SMTP)">
          <p className="text-xs text-muted-foreground">
            邮件中心「回信 / 写信」从这个客服邮箱发出(而非全站系统邮件)。通常与上面 IMAP 同一个邮箱账号,但服务器/端口不同(收信 imap. / 发信 smtp.)。
            <span className="text-faint">留空则回落到「系统设置 → 邮件」的全站发信配置。</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SMTP 服务器">
              <Input value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.exmail.qq.com" />
            </Field>
            <Field label="端口(465=SSL / 587=TLS)">
              <Input
                type="number"
                value={form.smtp_port}
                onChange={(e) => set('smtp_port', Number(e.target.value) || 465)}
              />
            </Field>
            <Field label="发信账号">
              <Input value={form.smtp_username} onChange={(e) => set('smtp_username', e.target.value)} placeholder="support@yourdomain.com" />
            </Field>
            <Field label="密码 / 授权码">
              <SecretInput
                value={form.smtp_password}
                onChange={(e) => set('smtp_password', e.target.value)}
                revealed={reveal}
                onToggleReveal={() => setReveal((r) => !r)}
                placeholder="留空 = 不修改"
              />
            </Field>
            <Field label="发信人显示名(可空)">
              <Input value={form.smtp_from_name} onChange={(e) => set('smtp_from_name', e.target.value)} placeholder="如:Scholay 客服" />
            </Field>
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={handleTestSMTP} disabled={testSMTP.isPending}>
              {testSMTP.isPending && <Loader2 className="size-3.5 animate-spin" />}
              测试发信(给自己发一封)
            </Button>
          </div>
        </Section>

        {/* 4. 飞书通知 */}
        <Section icon={<Send className="size-4" />} title="飞书通知(群自定义机器人)">
          <p className="text-xs text-muted-foreground">
            飞书群 → 设置 → 群机器人 → 添加「自定义机器人」,把 webhook 地址填入;若开启了「签名校验」,secret 一并填入。用户提交反馈 / 客服邮箱收到新邮件时,第一时间推送到群。
          </p>
          <Field label="Webhook 地址">
            <SecretInput
              value={form.feishu_webhook_url}
              onChange={(e) => set('feishu_webhook_url', e.target.value)}
              revealed={reveal}
              onToggleReveal={() => setReveal((r) => !r)}
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…(留空 = 不修改)"
            />
          </Field>
          <Field label="签名 Secret(机器人未开签名则留空)">
            <SecretInput
              value={form.feishu_secret}
              onChange={(e) => set('feishu_secret', e.target.value)}
              revealed={reveal}
              onToggleReveal={() => setReveal((r) => !r)}
              placeholder="留空 = 不修改"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-xs text-subtle">
              <Switch checked={form.feishu_notify_feedback} onCheckedChange={(v) => set('feishu_notify_feedback', v)} />
              在线反馈提交时推送
            </label>
            <label className="flex items-center gap-2 text-xs text-subtle">
              <Switch checked={form.feishu_notify_email} onCheckedChange={(v) => set('feishu_notify_email', v)} />
              收件箱新邮件时推送
            </label>
            <label className="flex items-center gap-2 text-xs text-subtle">
              <Switch checked={form.feishu_notify_payment} onCheckedChange={(v) => set('feishu_notify_payment', v)} />
              用户付费成功时推送
            </label>
            <Button size="sm" variant="outline" onClick={handleTestFeishu} disabled={testFeishu.isPending}>
              {testFeishu.isPending && <Loader2 className="size-3.5 animate-spin" />}
              发送测试消息
            </Button>
          </div>
        </Section>
      </div>
    </AdminPageLayout>
  );
}

function Section({
  icon,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-16 border border-border bg-surface-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-2xs text-faint">{label}</Label>
      {children}
    </div>
  );
}

/** 二维码上传:本地 FileReader → data URL(小图直存配置,免对象存储/URL 过期),带预览与移除。 */
function QRUpload({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const apiToast = useApiToast();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      void apiToast(Promise.reject(new Error('仅支持图片')), { success: '', failure: '仅支持图片文件' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      if (url.length > QR_MAX_BYTES) {
        void apiToast(Promise.reject(new Error('too large')), {
          success: '',
          failure: '图片过大,请压缩到 300KB 以内',
        });
        return;
      }
      onChange(url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-2xs text-faint">{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt={label} className="size-20 rounded-8 border border-border object-contain" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-8 border border-dashed border-border text-2xs text-faint">
            未设置
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" type="button" onClick={() => inputRef.current?.click()}>
            <Upload className="size-3.5" />
            上传图片
          </Button>
          {value && (
            <Button size="sm" variant="outline" type="button" onClick={() => onChange('')}>
              <Trash2 className="size-3.5" />
              移除
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

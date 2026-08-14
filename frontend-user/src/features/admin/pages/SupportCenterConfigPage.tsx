import { useEffect, useRef, useState } from 'react';
import { Headset, Inbox, Loader2, MailCheck, Save, Send, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ConfigPageGuard } from '../components/ConfigPageGuard';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
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
 * 敏感字段(IMAP 密码 / SMTP 密码 / webhook / secret)留空或保持 ******** = 不修改。
 *
 * 🔴 本页是「一次误点 = 线上事故」那一类:后端 PUT 是**整行覆盖**
 * (backend/internal/supportcenter/service.go UpdateConfig,只有四个敏感字段有
 * 「空/遮罩 = 保留旧值」的兜底),GET 挂掉时若还渲染表单、保存按钮还可点,
 * 一下去 support_email / business_email / 二维码 / IMAP / SMTP / 飞书开关全被写空。
 * 因此:① 表单整体裹 ConfigPageGuard(拿不到 data 就绝不渲染);
 *       ② 保存按钮 disabled 额外看 `isError || !cfg`(第二道闸,防止 Guard 被绕过)。
 */

// 后端硬上限(supportcenter/handler.go qrMaxBytes)量的是 **data URL 字符串**的字节数,
// 而 base64 会把原图撑大约 4/3 —— 所以真正能过的原图只有 ~220KB。
// 原来前端拿 300KB 去比 data URL 长度、文案却说「压缩到 300KB 以内」:
// 运维把图压到 260KB 仍被拒,却被告知已达标。这里改成**按原图大小**判定,报的数字
// 就是他在文件管理器里看到的那个数字。
const QR_MAX_DATAURL_BYTES = 300 * 1024;
const QR_MAX_FILE_BYTES = Math.floor(((QR_MAX_DATAURL_BYTES - 128) * 3) / 4); // ≈ 224KB
const QR_MAX_FILE_KB = Math.floor(QR_MAX_FILE_BYTES / 1024);

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

const FORM_KEYS = Object.keys(EMPTY) as (keyof FormState)[];

const numberInputValue = (value: number): number | '' =>
  Number.isFinite(value) ? value : '';

const parseNumberDraft = (raw: string): number =>
  raw === '' ? Number.NaN : Number(raw);

/** 切「小眼睛」时会随新请求回填的四个字段 —— 其余字段一律保留用户正在编辑的值。 */
const SECRET_KEYS = [
  'imap_password',
  'smtp_password',
  'feishu_webhook_url',
  'feishu_secret',
] as const;

function toForm(cfg: SupportCenterConfig): FormState {
  const { id: _id, ...rest } = cfg;
  void _id;
  return rest;
}

export function SupportCenterConfigPage() {
  const [reveal, setReveal] = useState(false);
  const q = useSupportCenterConfig(reveal);
  const cfg = q.data;
  const update = useUpdateSupportCenterConfig();
  const testFeishu = useTestFeishu();
  const testIMAP = useTestIMAP();
  const testSMTP = useTestSMTP();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const [form, setForm] = useState<FormState>(EMPTY);

  // 🔴 只在**首次**拿到配置时整体灌入。
  // 原写法是 `useEffect(() => { if (cfg) setForm(rest) }, [cfg])`,而 useSupportCenterConfig
  // 的 queryKey 里带着 showSensitive —— 任意一个 SecretInput 的「眼睛」一按就是换 key 重新取,
  // 新数据一到就 setForm(整份服务端版本)。运维填了半页 IMAP/SMTP 参数后想核对一下密码,
  // 点一下眼睛,全部白填。这里用 hydrated 守卫首灌,之后只回填四个敏感字段。
  const hydrated = useRef(false);
  useEffect(() => {
    if (!cfg) return;
    const next = toForm(cfg);
    if (!hydrated.current) {
      hydrated.current = true;
      setForm(next);
      return;
    }
    setForm((f) => {
      const patched = { ...f };
      for (const k of SECRET_KEYS) patched[k] = next[k];
      return patched;
    });
  }, [cfg]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 「屏幕上的参数」与「已保存的配置」是否一致 —— 三个测试按钮打的都是后者。
  const dirty = cfg ? FORM_KEYS.some((k) => form[k] !== cfg[k]) : false;
  const blocked = q.isError || !cfg;
  const numericDraftValid = [
    form.imap_port,
    form.imap_poll_minutes,
    form.smtp_port,
  ].every(Number.isFinite);

  const handleSave = async () => {
    if (!numericDraftValid) {
      toast.error('请先完整填写端口和轮询间隔');
      return;
    }
    await apiToast(update.mutateAsync(form), { success: '已保存', failure: '保存失败' });
  };

  // 刷新 = 重新拉服务端版本并**整体**回灌(不走 hydrated 守卫那条只补敏感字段的路径),
  // 所以有未保存修改时先问一句 —— 否则这个按钮就成了另一个「一点就丢一屏参数」的入口。
  const handleRefresh = async () => {
    if (
      dirty &&
      !(await confirm({
        title: '重新拉取会覆盖未保存的修改',
        description: '当前表单里有还没保存的改动,重新拉取后会被服务端版本替换。',
        confirmText: '仍然拉取',
        danger: true,
      }))
    ) {
      return;
    }
    const r = await q.refetch();
    if (r.data) {
      hydrated.current = true;
      setForm(toForm(r.data));
    }
  };

  const handleTestFeishu = async () => {
    await apiToast(testFeishu.mutateAsync(), {
      success: '已发送,请到飞书群查看',
      failure: '飞书测试失败(先保存配置再测试)',
    });
  };

  // 把邮箱信件总数说出来:只说「连接成功」时,「连上了但收件箱是空的(连错文件夹/账号)」
  // 和「连上了且有 342 封信」长得一模一样。
  const handleTestIMAP = async () => {
    const r = await apiToast(testIMAP.mutateAsync(), {
      failure: 'IMAP 连接失败(先保存配置再测试)',
    });
    if (r === null) return;
    const n = r.mailbox_messages ?? 0;
    toast.success(n > 0 ? `IMAP 连接成功 · 该邮箱共 ${n} 封信` : 'IMAP 连接成功 · 该邮箱当前 0 封信(留意是否连错账号/文件夹)');
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
      onRefresh={handleRefresh}
      refreshing={q.isFetching}
      actions={
        <Button size="sm" onClick={handleSave} disabled={update.isPending || q.isLoading || blocked || !numericDraftValid}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存全部
        </Button>
      }
    >
      <ConfigPageGuard query={q} resourceName="客服配置">
        {() => (
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
                  <span className="text-12 text-faint">启用拉取</span>
                  <Switch checked={form.imap_enabled} onCheckedChange={(v) => set('imap_enabled', v)} />
                </div>
              }
            >
              <p className="text-12 text-muted-foreground">
                填客服邮箱的 IMAP 信息(QQ/网易等邮箱需用「授权码」而非登录密码)。启用后每隔设定分钟自动拉取新邮件到「邮件中心」,并可飞书提醒。回信走「系统设置 → 邮件」里的 SMTP 发信配置。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="IMAP 服务器">
                  <Input value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} placeholder="imap.exmail.qq.com" />
                </Field>
                <Field label="端口">
                  <Input
                    type="number"
                    value={numberInputValue(form.imap_port)}
                    onChange={(e) => set('imap_port', parseNumberDraft(e.target.value))}
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
                    value={numberInputValue(form.imap_poll_minutes)}
                    onChange={(e) => set('imap_poll_minutes', parseNumberDraft(e.target.value))}
                  />
                </Field>
                <Field label="TLS(993 端口必开)">
                  <div className="flex h-9 items-center">
                    <Switch checked={form.imap_tls} onCheckedChange={(v) => set('imap_tls', v)} />
                  </div>
                </Field>
              </div>
              <TestAction dirty={dirty} pending={testIMAP.isPending} onClick={handleTestIMAP}>
                测试连接
              </TestAction>
            </Section>

            {/* 3. SMTP 发信 */}
            <Section icon={<MailCheck className="size-4" />} title="客服邮箱发信(SMTP)">
              <p className="text-12 text-muted-foreground">
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
                    value={numberInputValue(form.smtp_port)}
                    onChange={(e) => set('smtp_port', parseNumberDraft(e.target.value))}
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
              <TestAction dirty={dirty} pending={testSMTP.isPending} onClick={handleTestSMTP}>
                测试发信(给自己发一封)
              </TestAction>
            </Section>

            {/* 4. 飞书通知 */}
            <Section icon={<Send className="size-4" />} title="飞书通知(群自定义机器人)">
              <p className="text-12 text-muted-foreground">
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
                <label className="flex items-center gap-2 text-12 text-subtle">
                  <Switch checked={form.feishu_notify_feedback} onCheckedChange={(v) => set('feishu_notify_feedback', v)} />
                  在线反馈提交时推送
                </label>
                <label className="flex items-center gap-2 text-12 text-subtle">
                  <Switch checked={form.feishu_notify_email} onCheckedChange={(v) => set('feishu_notify_email', v)} />
                  收件箱新邮件时推送
                </label>
                <label className="flex items-center gap-2 text-12 text-subtle">
                  <Switch checked={form.feishu_notify_payment} onCheckedChange={(v) => set('feishu_notify_payment', v)} />
                  用户付费成功时推送
                </label>
              </div>
              <TestAction dirty={dirty} pending={testFeishu.isPending} onClick={handleTestFeishu}>
                发送测试消息
              </TestAction>
            </Section>
          </div>
        )}
      </ConfigPageGuard>
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
        <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
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
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}

/**
 * 「测试」按钮 —— 三个测试端点打的都是**已保存**的配置(后端从库里读)。
 * 而真实排障流程一定是「改参数 → 点测试」,此时测出来的成功/失败与屏幕上的参数无关,
 * 是最容易把人带沟里的一种假结论。所以有未保存修改时直接禁用并说明原因,
 * 而不是把这件事写在段落小字里指望人读到。
 */
function TestAction({
  dirty,
  pending,
  onClick,
  children,
}: {
  dirty: boolean;
  pending: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={onClick} disabled={pending || dirty}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {children}
      </Button>
      {dirty && (
        <span className="text-12 text-brand-amber">有未保存修改,测试用的是已保存的配置 —— 请先「保存全部」</span>
      )}
    </div>
  );
}

/** 二维码上传:本地 FileReader → data URL(小图直存配置,免对象存储/URL 过期),带预览与移除。 */
function QRUpload({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('仅支持图片文件');
      return;
    }
    // 按**原图**大小拦,报的数字才是用户看得到的那个数字(base64 会再撑大约 1/3)
    if (file.size > QR_MAX_FILE_BYTES) {
      toast.error(`图片过大(${Math.round(file.size / 1024)}KB),请压缩到 ${QR_MAX_FILE_KB}KB 以内`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error('读取图片失败,请换一张试试');
    reader.onload = () => {
      const url = String(reader.result ?? '');
      // 兜底:极端情况下(异常 MIME / 超长前缀)编码后仍可能越过后端硬上限
      if (url.length > QR_MAX_DATAURL_BYTES) {
        toast.error(`图片编码后仍超出上限,请压缩到 ${QR_MAX_FILE_KB}KB 以内`);
        return;
      }
      onChange(url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-12 text-faint">{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt={label} className="size-20 rounded-8 border border-border object-contain" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-8 border border-dashed border-border text-12 text-faint">
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

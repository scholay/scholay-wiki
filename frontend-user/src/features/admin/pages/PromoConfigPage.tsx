import { useEffect, useRef, useState } from 'react';
import { Check, Gift, Loader2, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { useAdminPromoConfig, useUpdatePromoConfig, type PromoConfig } from '../api/promo-config';

/**
 * 限时领取会员推广(后台)——
 *   · 总开关:关 = 用户端无按钮、不弹窗;开 = 顶部导航出现按钮 + 首屏/额度用尽自动弹
 *   · 微信客服二维码(data URL 直存)——用户扫码加客服领取
 *   · 文案:标题 / 副标题 / 福利点(一行一条)/ 按钮文案,均可留空走前端内置默认
 * 右侧实时预览弹窗效果。
 */

const QR_MAX_BYTES = 300 * 1024;

// 与前端 PromoModal 的 DEFAULTS 对齐,预览/留空时展示。
const PLACEHOLDER = {
  title: '限时领取会员',
  subtitle: '扫码添加客服,免费领取会员权益',
  benefits: ['解锁 Pro 全部高级功能', '更高 AI 额度,畅快使用', '论文检索 · 智能助手 · 智能写作全开'],
  buttonText: '扫码加客服 · 免费领取',
};

type FormState = Omit<PromoConfig, 'id'>;

const EMPTY: FormState = {
  enabled: false,
  title: '',
  subtitle: '',
  benefits: '',
  button_text: '',
  wechat_qr: '',
};

export function PromoConfigPage() {
  const { data: cfg, isLoading } = useAdminPromoConfig();
  const update = useUpdatePromoConfig();
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

  // 预览用(留空走默认),与 PromoModal 同逻辑。
  const pvTitle = form.title.trim() || PLACEHOLDER.title;
  const pvSubtitle = form.subtitle.trim() || PLACEHOLDER.subtitle;
  const pvButton = form.button_text.trim() || PLACEHOLDER.buttonText;
  const pvBenefits = form.benefits.trim()
    ? form.benefits.split('\n').map((s) => s.trim()).filter(Boolean)
    : PLACEHOLDER.benefits;

  return (
    <AdminPageLayout
      title="限时领取会员"
      description="推广期专用 —— 开启后用户端顶部出现「限时领取会员」按钮,首屏 / 额度用尽自动弹窗引导扫码加客服领取"
      actions={
        <Button size="sm" onClick={handleSave} disabled={update.isPending || isLoading}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* 表单 */}
        <div className="flex max-w-2xl flex-col gap-6">
          <Section icon={<Sparkles className="size-4" />} title="推广开关">
            <div className="flex items-center justify-between rounded-12 border border-border bg-surface-1 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">启用「限时领取会员」推广</span>
                <span className="text-xs text-muted-foreground">关闭后用户端不显示按钮、不弹窗</span>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
            </div>
          </Section>

          <Section icon={<Gift className="size-4" />} title="微信客服二维码">
            <QRUpload label="客服二维码(用户扫码加客服领取)" value={form.wechat_qr} onChange={(v) => set('wechat_qr', v)} />
          </Section>

          <Section icon={<Sparkles className="size-4" />} title="弹窗文案(留空走默认)">
            <Field label="标题">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={PLACEHOLDER.title} />
            </Field>
            <Field label="副标题">
              <Input
                value={form.subtitle}
                onChange={(e) => set('subtitle', e.target.value)}
                placeholder={PLACEHOLDER.subtitle}
              />
            </Field>
            <Field label="福利点(一行一条)">
              <textarea
                value={form.benefits}
                onChange={(e) => set('benefits', e.target.value)}
                rows={4}
                placeholder={PLACEHOLDER.benefits.join('\n')}
                className="flex w-full rounded-8 border border-border bg-surface-card px-3 py-2 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="按钮 / 引导文案">
              <Input
                value={form.button_text}
                onChange={(e) => set('button_text', e.target.value)}
                placeholder={PLACEHOLDER.buttonText}
              />
            </Field>
          </Section>
        </div>

        {/* 实时预览 */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Label className="mb-2 block text-2xs text-faint">实时预览</Label>
          <div className="w-full max-w-80 overflow-hidden rounded-16 border border-border lg:w-80">
            <div className="relative bg-gradient-to-br from-brand-red via-brand-red to-brand-amber px-6 pb-6 pt-8 text-center text-on-brand">
              <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-pill bg-surface-card/20 px-2 py-0.5 text-2xs font-medium backdrop-blur-sm">
                <Sparkles className="size-3" /> 限时
              </span>
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-pill bg-surface-card/15 ring-1 ring-on-brand/30">
                <Gift className="size-7" strokeWidth={2} />
              </div>
              <div className="text-lg font-bold">{pvTitle}</div>
              <div className="mt-1 text-sm text-on-brand/90">{pvSubtitle}</div>
            </div>
            <div className="flex flex-col gap-2.5 bg-surface-card px-6 pt-5">
              {pvBenefits.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.6} />
                  <span>{b}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-2.5 bg-surface-card px-6 pb-6 pt-5">
              {form.wechat_qr ? (
                <img src={form.wechat_qr} alt="二维码预览" className="size-44 rounded-12 border border-border object-contain p-1" />
              ) : (
                <div className="flex size-44 items-center justify-center rounded-12 border border-dashed border-border text-xs text-faint">
                  二维码未配置
                </div>
              )}
              <div className="inline-flex items-center gap-1.5 rounded-pill bg-brand-red/10 px-3 py-1.5 text-sm font-semibold text-brand-red">
                <Gift className="size-4" /> {pvButton}
              </div>
              <p className="text-xs text-faint">微信扫一扫,添加客服领取</p>
            </div>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-16 border border-border bg-surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      {children}
    </div>
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
        void apiToast(Promise.reject(new Error('too large')), { success: '', failure: '图片过大,请压缩到 300KB 以内' });
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

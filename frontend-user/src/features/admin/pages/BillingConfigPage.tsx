import { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { cn } from '@/shared/lib/utils';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { useBillingConfig, useUpdateBillingConfig, type BillingConfig } from '../api/billing-config';

type NumField = { key: keyof BillingConfig; label: string; hint?: string; step?: number };
type Group = { title: string; fields: NumField[] };

const GROUPS: Group[] = [
  {
    title: '每日额度(token)',
    fields: [
      { key: 'free_daily_tokens', label: 'Free 每日基准 Q', hint: '免费用户每日 token;Pro/Max 按倍率派生' },
      { key: 'pro_multiplier', label: 'Pro 倍率(× Free)', hint: 'Pro 每日额度 = Free × 此值;<=0 = 不限', step: 0.5 },
      { key: 'max_multiplier', label: 'Max 倍率(× Pro)', hint: 'Max 每日额度 = Pro × 此值;<=0 = 不限', step: 0.5 },
    ],
  },
  {
    title: '价格(分)',
    fields: [
      { key: 'pro_price_cents', label: 'Pro 月价' },
      { key: 'pro_original_cents', label: 'Pro 原价(划线)' },
      { key: 'max_price_cents', label: 'Max 月价' },
      { key: 'max_original_cents', label: 'Max 原价(划线)' },
    ],
  },
  {
    title: '订阅赠送经费(临时, 整月有效)',
    fields: [
      { key: 'pro_grant_credits', label: 'Pro 赠送经费' },
      { key: 'max_grant_credits', label: 'Max 赠送经费' },
      { key: 'subscription_period_days', label: '会员/赠送有效天数' },
    ],
  },
  {
    title: '充值 / 重置',
    fields: [
      { key: 'recharge_rate', label: '充值汇率(1元=N经费)', step: 0.1 },
      { key: 'min_recharge_cents', label: '起充金额(分)' },
      { key: 'reset_cost_credits', label: '每次重置花费经费' },
    ],
  },
];

export function BillingConfigPage() {
  const { data, isLoading } = useBillingConfig();
  const update = useUpdateBillingConfig();
  const apiToast = useApiToast();
  const [form, setForm] = useState<BillingConfig | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const setNum = (key: keyof BillingConfig, raw: string) =>
    setForm((f) => (f ? { ...f, [key]: Number(raw) } : f));

  const onSave = async () => {
    if (!form) return;
    await apiToast(update.mutateAsync(form), { success: '已保存计费配置', failure: '保存失败' });
  };

  return (
    <AdminPageLayout
      title="计费体系配置"
      description="统一 token 每日额度 + 经费钱包的全部动态旋钮。保存后最多 30 秒全量生效。"
    >
      {isLoading || !form ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-border p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载配置…
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 总开关 + 最受欢迎 */}
          <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">收费体系总开关</span>
                <span className="text-2xs text-faint">关闭后所有 AI 功能不限额(用于灰度/应急)</span>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-subtle">「最受欢迎」标在</span>
              <div className="flex gap-2">
                {(['pro', 'max', 'none'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, popular_plan: p })}
                    className={cn(
                      'h-8 rounded-md border px-3 text-xs transition-colors',
                      form.popular_plan === p
                        ? 'border-brand-red bg-danger-soft text-brand-red'
                        : 'border-border text-subtle hover:bg-surface-2'
                    )}
                  >
                    {p === 'pro' ? '专业版' : p === 'max' ? '旗舰版' : '不标'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {GROUPS.map((g) => (
            <section key={g.title} className="rounded-md border border-border bg-background p-5">
              <h3 className="mb-4 text-sm font-bold text-foreground">{g.title}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={String(f.key)} className="flex flex-col gap-1.5">
                    <Label htmlFor={String(f.key)}>{f.label}</Label>
                    <Input
                      id={String(f.key)}
                      type="number"
                      step={f.step ?? 1}
                      value={String(form[f.key] ?? 0)}
                      onChange={(e) => setNum(f.key, e.target.value)}
                      className="h-9"
                    />
                    {f.hint && <span className="text-2xs text-faint">{f.hint}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div>
            <Button onClick={onSave} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

export default BillingConfigPage;

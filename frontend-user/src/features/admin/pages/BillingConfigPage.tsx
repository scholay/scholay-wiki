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

// scale:DB 值与展示值的换算。free_window_tokens 库里存微元真实成本,展示/编辑按算力点(1 点 = 1000 微元 = ¥0.001)。
type NumField = { key: keyof BillingConfig; label: string; hint?: string; step?: number; scale?: number };
type Group = { title: string; fields: NumField[] };

const GROUPS: Group[] = [
  {
    title: '周期额度(算力点 · 7 天)',
    fields: [
      { key: 'free_window_tokens', label: 'Free 周期基准(算力点 · 7 天)', hint: 'P5 成本制:1 算力点 = ¥0.001 真实成本(按输入/输出/缓存实际单价扣)。Pro/Max 按倍率派生。示例 Free 300 / Pro 6000 / Max 30000', scale: 1000 },
      { key: 'window_days', label: '周期天数', hint: '额度窗口长度(默认 7);改动只影响新开的窗口' },
      { key: 'pro_multiplier', label: 'Pro 倍率(× Free)', hint: 'Pro 周期额度 = Free × 此值;<=0 = 不限', step: 0.5 },
      { key: 'max_multiplier', label: 'Max 倍率(× Pro)', hint: 'Max 周期额度 = Pro × 此值;<=0 = 不限', step: 0.5 },
    ],
  },
  {
    title: '月度套餐 · 价格(分)',
    fields: [
      { key: 'pro_price_cents', label: 'Pro 月价' },
      { key: 'pro_original_cents', label: 'Pro 原价(划线)' },
      { key: 'max_price_cents', label: 'Max 月价' },
      { key: 'max_original_cents', label: 'Max 原价(划线)' },
    ],
  },
  {
    title: '年度套餐 · 价格(分)',
    fields: [
      { key: 'pro_year_price_cents', label: 'Pro 年价', hint: '设 0 = 关闭 Pro 年付(前端隐藏年付入口)' },
      { key: 'pro_year_original_cents', label: 'Pro 年原价(划线)' },
      { key: 'max_year_price_cents', label: 'Max 年价', hint: '设 0 = 关闭 Max 年付' },
      { key: 'max_year_original_cents', label: 'Max 年原价(划线)' },
      { key: 'subscription_year_days', label: '年度会员时长(天)', hint: '默认 365' },
    ],
  },
  {
    title: '订阅赠送经费(临时)',
    fields: [
      { key: 'pro_grant_credits', label: 'Pro 月度赠送经费', hint: '月度订阅:开通/续期一次性发放,整月有效' },
      { key: 'max_grant_credits', label: 'Max 月度赠送经费' },
      { key: 'subscription_period_days', label: '月度会员/赠送有效天数' },
      { key: 'pro_year_grant_credits', label: 'Pro 年度赠送经费(总额)', hint: '年度订阅:按月分 12 批依次生效,每批当月有效' },
      { key: 'max_year_grant_credits', label: 'Max 年度赠送经费(总额)' },
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
      description="统一算力点周期额度(7 天成本制,首次使用开表)+ 经费钱包的全部动态旋钮。保存后最多 30 秒全量生效。"
    >
      {isLoading || !form ? (
        <div className="flex items-center justify-center gap-2 rounded-16 border border-border p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载配置…
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 总开关 + 最受欢迎 */}
          <section className="flex flex-col gap-4 rounded-16 border border-border bg-surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-12 font-medium text-foreground">收费体系总开关</span>
                <span className="text-12 text-faint">关闭后所有 AI 功能不限额(用于灰度/应急)</span>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-12 font-medium text-subtle">「最受欢迎」标在</span>
              <div className="flex flex-wrap gap-2">
                {(['pro', 'max', 'none'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, popular_plan: p })}
                    className={cn(
                      'h-8 rounded-8 border px-3 text-12 transition-colors',
                      form.popular_plan === p
                        ? 'border-brand-red bg-danger-soft text-brand-red'
                        : 'border-border text-subtle hover:bg-surface-2'
                    )}
                  >
                    {p === 'pro' ? 'Pro' : p === 'max' ? 'Max' : '不标'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {GROUPS.map((g) => (
            <section key={g.title} className="rounded-16 border border-border bg-surface-card p-5">
              <h3 className="mb-4 text-14 font-medium text-foreground">{g.title}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={String(f.key)} className="flex flex-col gap-1.5">
                    <Label htmlFor={String(f.key)}>{f.label}</Label>
                    <Input
                      id={String(f.key)}
                      type="number"
                      step={f.step ?? 1}
                      value={String(f.scale ? Math.round((Number(form[f.key] ?? 0)) / f.scale) : (form[f.key] ?? 0))}
                      onChange={(e) =>
                        setNum(f.key, f.scale ? String(Number(e.target.value) * f.scale) : e.target.value)
                      }
                      className="h-9"
                    />
                    {f.hint && <span className="text-12 text-faint">{f.hint}</span>}
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

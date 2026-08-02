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
// readOnly:仅展示不可编辑(disabled 置灰)。值仍留在 form 里随保存整体提交 —— 后台 PUT 是全列覆盖,不提交会被写 0。
type NumField = { key: keyof BillingConfig; label: string; hint?: string; step?: number; scale?: number; readOnly?: boolean };
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
      // 0090:「年度会员时长(天)」已删 —— 年度 = +1 个自然年,没有天数可配。
    ],
  },
  // 0090:整组「订阅赠送经费(临时)」已删 —— 订阅不再赠送经费,月度 = +1 个自然月。
  {
    title: '经费 / 按需付费',
    fields: [
      { key: 'recharge_rate', label: '充值汇率(1元=N经费)', step: 0.1, hint: '0095 起为 100,即**经费 = 分** —— 600 经费 = ¥6,用户一眼可读。改它会改变按需付费单价(¥1 = 本值 × 兑换率 算力点)' },
      {
        key: 'credit_to_points',
        label: '经费兑换率(1经费=N算力点)',
        hint:
          '与充值汇率共同决定按需付费单价:¥1 = 汇率 × 本值 算力点(现网 100×3 = 300)。' +
          '⚠️ 后端硬校验「按需付费必须比所有套餐档贵」—— 调高到套餐更贵时会拒绝保存。' +
          '⚠️ 调低会使用户手里已有经费的购买力下降,属对已付费用户的溯及变更,谨慎操作。',
      },
      { key: 'min_recharge_cents', label: '起充金额(分)' },
      // reset_cost_credits 已不参与运行时(重置改扣「重置次数」),但**不能从表单删** ——
      // 后台 PUT 是全列覆盖,表单不提交它会被写成 0,而迁移 0092 拿它当换算除数、每次启动重放,
      // 被写成 0 会让未换算批次按 1:1 换 = 超发 120 倍。保留只读展示,禁止编辑。
      { key: 'reset_cost_credits', label: '经费→重置次数换算率(历史迁移用)', hint: '已不参与运行时判定;仅迁移 0092 用作换算除数。**请勿改动**', readOnly: true },
      // 邀请奖励两旋钮(invite_reward_credits / invite_reward_daily_cap)已移至「活动管理」页
      // 单点配置(2026-07-31 活动统一管理)。字段仍在 form state 全量透传,别从 interface 删。
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
                      onChange={(e) => {
                        if (f.readOnly) return; // 只读字段(如 reset_cost_credits)不接受编辑
                        setNum(f.key, f.scale ? String(Number(e.target.value) * f.scale) : e.target.value);
                      }}
                      // 只读字段 disabled 置灰(Input 自带 disabled:opacity-50)。onSave 提交的是 form
                      // state 而非原生表单序列化,disabled 不影响该字段随保存整体提交。
                      disabled={f.readOnly}
                      readOnly={f.readOnly}
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

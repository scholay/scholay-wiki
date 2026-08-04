import { useEffect, useState, type ReactNode } from 'react';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { cn } from '@/shared/lib/utils';
import { useConfirm } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ConfigPageGuard } from '../components/ConfigPageGuard';
import { useApiToast } from '../hooks/useApiToast';
import { useBillingConfig, useUpdateBillingConfig, type BillingConfig } from '../api/billing-config';

// scale:DB 值与展示值的换算。free_window_tokens 库里存微元真实成本,展示/编辑按算力点(1 点 = 1000 微元 = ¥0.001)。
// unit='cents':该字段库里存**分**,输入框下方实时回显 `= ¥x.xx`。
//   🔴 这是必须的:把 Pro 月价定成 ¥19.9 要输 1990,少一个 0 = ¥1.99、多一个 0 = ¥199,
//   而保存后 30 秒内就进用户端定价弹窗与下单流程,错值没有任何中间拦截。
//   同页并存三种钱的刻度(分 / 微元 / 经费),裸数字根本认不出是哪一种。
// readOnly:仅展示不可编辑(disabled 置灰)。值仍留在 form 里随保存整体提交 —— 后台 PUT 是全列覆盖,不提交会被写 0。
type NumField = {
  key: keyof BillingConfig;
  label: string;
  hint?: string;
  step?: number;
  scale?: number;
  unit?: 'cents';
  readOnly?: boolean;
};
type Group = { id: string; title: string; fields: NumField[] };

const GROUPS: Group[] = [
  {
    id: 'quota',
    title: '周期额度(算力点 · 7 天)',
    fields: [
      { key: 'free_window_tokens', label: 'Free 周期基准(算力点 · 7 天)', hint: 'P5 成本制:1 算力点 = ¥0.001 真实成本(按输入/输出/缓存实际单价扣)。Pro/Max 按倍率派生 —— 派生结果见本组底部实时摘要', scale: 1000 },
      { key: 'window_days', label: '周期天数', hint: '额度窗口长度(默认 7);改动只影响新开的窗口' },
      { key: 'pro_multiplier', label: 'Pro 倍率(× Free)', hint: 'Pro 周期额度 = Free × 此值;<=0 = 不限', step: 0.5 },
      { key: 'max_multiplier', label: 'Max 倍率(× Pro)', hint: 'Max 周期额度 = Pro × 此值;<=0 = 不限', step: 0.5 },
    ],
  },
  {
    id: 'monthly',
    title: '月度套餐 · 价格(分)',
    fields: [
      { key: 'pro_price_cents', label: 'Pro 月价', unit: 'cents' },
      { key: 'pro_original_cents', label: 'Pro 原价(划线)', unit: 'cents' },
      { key: 'max_price_cents', label: 'Max 月价', unit: 'cents' },
      { key: 'max_original_cents', label: 'Max 原价(划线)', unit: 'cents' },
    ],
  },
  {
    id: 'yearly',
    title: '年度套餐 · 价格(分)',
    fields: [
      { key: 'pro_year_price_cents', label: 'Pro 年价', unit: 'cents', hint: '设 0 = 关闭 Pro 年付(前端隐藏年付入口)' },
      { key: 'pro_year_original_cents', label: 'Pro 年原价(划线)', unit: 'cents' },
      { key: 'max_year_price_cents', label: 'Max 年价', unit: 'cents', hint: '设 0 = 关闭 Max 年付' },
      { key: 'max_year_original_cents', label: 'Max 年原价(划线)', unit: 'cents' },
      // 0090:「年度会员时长(天)」已删 —— 年度 = +1 个自然年,没有天数可配。
    ],
  },
  // 0090:整组「订阅赠送经费(临时)」已删 —— 订阅不再赠送经费,月度 = +1 个自然月。
  {
    id: 'credit',
    title: '经费 / 按需付费',
    fields: [
      { key: 'recharge_rate', label: '充值汇率(1元=N经费)', step: 0.1, hint: '0095 起为 100,即「经费 = 分」—— 600 经费 = ¥6,用户一眼可读。改它会改变按需付费单价(¥1 = 本值 × 兑换率 算力点)' },
      {
        key: 'credit_to_points',
        label: '经费兑换率(1经费=N算力点)',
        hint:
          '与充值汇率共同决定按需付费单价:¥1 = 汇率 × 本值 算力点(现网 100×3 = 300)。' +
          '⚠️ 后端硬校验「按需付费必须比所有套餐档贵」—— 调高到套餐更贵时会拒绝保存。' +
          '⚠️ 调低会使用户手里已有经费的购买力下降,属对已付费用户的溯及变更,谨慎操作。',
      },
      { key: 'min_recharge_cents', label: '起充金额(分)', unit: 'cents' },
      // reset_cost_credits 已不参与运行时(重置改扣「重置次数」),但**不能从表单删** ——
      // 后台 PUT 是全列覆盖,表单不提交它会被写成 0,而迁移 0092 拿它当换算除数、每次启动重放,
      // 被写成 0 会让未换算批次按 1:1 换 = 超发 120 倍。保留只读展示,禁止编辑。
      { key: 'reset_cost_credits', label: '经费→重置次数换算率(历史迁移用)', hint: '已不参与运行时判定;仅迁移 0092 用作换算除数,请勿改动', readOnly: true },
      // 邀请奖励两旋钮(invite_reward_credits / invite_reward_daily_cap)已移至「活动管理」页
      // 单点配置(2026-07-31 活动统一管理)。字段仍在 form state 全量透传,别从 interface 删。
    ],
  },
];

/** 字段中文名 —— 保存前的改动清单要念得出是哪一项,不能给用户看 `pro_year_price_cents`。 */
const FIELD_LABEL: Record<string, string> = {
  ...Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [String(f.key), f.label]))),
  enabled: '收费体系总开关',
  popular_plan: '「最受欢迎」标记',
  invite_reward_credits: '邀请奖励(经费/人 · 在「活动管理」页编辑)',
  invite_reward_daily_cap: '邀请奖励每日上限(在「活动管理」页编辑)',
};

export function BillingConfigPage() {
  const q = useBillingConfig();

  return (
    <AdminPageLayout
      title="计费体系配置"
      description="统一算力点周期额度(7 天成本制,首次使用开表)+ 经费钱包的全部动态旋钮。保存后最多 30 秒全量生效。"
      onRefresh={() => void q.refetch()}
      refreshing={q.isFetching}
    >
      {/* 🔴 三态守卫:GET 失败时**绝不渲染表单**。
          原写法是 `isLoading || !form` → 失败后 isLoading=false、form 恒 null = 永久转圈,
          管理员分不清是后端挂了还是自己没权限(运营角色进来正是这个效果)。 */}
      <ConfigPageGuard query={q} resourceName="计费配置">
        {(cfg) => <BillingConfigForm initial={cfg} blocked={q.isError || !q.data} />}
      </ConfigPageGuard>
    </AdminPageLayout>
  );
}

function BillingConfigForm({ initial, blocked }: { initial: BillingConfig; blocked: boolean }) {
  const update = useUpdateBillingConfig();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<BillingConfig>(initial);

  // 刷新拿到新配置时重新同步(react-query 结构共享:内容不变则引用不变,不会打断编辑)
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const setNum = (key: keyof BillingConfig, raw: string) =>
    setForm((f) => ({ ...f, [key]: Number(raw) }));

  const onSave = async () => {
    // 🔴 保存前做 diff 并二次确认:这个 PUT 是全列覆盖,而其中一项(总开关)关掉
    // 等于全站 AI 功能不限额 —— 同项目里「停用一个兑换码」这种小得多的操作都有 confirm。
    const changed = (Object.keys(form) as (keyof BillingConfig)[]).filter((k) => form[k] !== initial[k]);
    if (changed.length === 0) {
      toast('当前没有任何改动');
      return;
    }
    const turningOff = initial.enabled && !form.enabled;
    const ok = await confirm({
      title: '保存计费配置?',
      description: (
        <span className="flex flex-col gap-1.5">
          <span>
            本次改动 {changed.length} 项:
            <span className="text-foreground">
              {changed.map((k) => FIELD_LABEL[String(k)] ?? String(k)).join('、')}
            </span>
          </span>
          <span className="text-faint">保存后最多 30 秒对全站生效(含用户端定价弹窗与下单)。</span>
          {turningOff && (
            <span className="flex items-start gap-1.5 font-medium text-brand-red">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              你正在关闭「收费体系总开关」—— 关闭后所有 AI 功能对所有用户不限额,不再计费也不再拦截。
            </span>
          )}
        </span>
      ),
      confirmText: '确认保存',
      danger: turningOff,
    });
    if (!ok) return;
    await apiToast(update.mutateAsync(form), { success: '已保存计费配置', failure: '保存失败' });
  };

  return (
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
        <section key={g.id} className="rounded-16 border border-border bg-surface-card p-5">
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
                {/* 分 → 元 实时回显:输错一个 0 在这里当场看得见 */}
                {f.unit === 'cents' && (
                  <span className="text-12 tabular-nums text-subtle">
                    = ¥{(Number(form[f.key] ?? 0) / 100).toFixed(2)}
                  </span>
                )}
                {f.hint && <span className="text-12 text-faint">{f.hint}</span>}
              </div>
            ))}
          </div>
          {/* 倍率是派生关系,页面上必须能看到派生结果 —— 否则「<=0 = 不限」这个语义翻转完全不可见 */}
          {g.id === 'quota' && <QuotaDerivedSummary form={form} />}
        </section>
      ))}

      <div>
        {/* 第二道闸:GET 失败(blocked)时按钮也不可点 —— 后端 PUT 是整行覆盖,
            误点一次就把线上计费配置写空。Guard 之外再挡一层,免得后续重构挪走 Guard 时静默失守。 */}
        <Button onClick={onSave} disabled={update.isPending || blocked}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存配置
        </Button>
      </div>
    </div>
  );
}

/**
 * 周期额度的派生摘要 —— Free 基准可输入,Pro/Max 只有倍率框,
 * 不算给管理员看的话「改了倍率之后 Pro 实际有多少算力点」在页面上完全不可见。
 * 倍率 <=0 是「不限」(语义翻转),这里显式显示成「不限」而不是一个负数/零。
 */
function QuotaDerivedSummary({ form }: { form: BillingConfig }) {
  const freePts = Math.round(Number(form.free_window_tokens ?? 0) / 1000);
  const proUnlimited = Number(form.pro_multiplier ?? 0) <= 0;
  const proPts = proUnlimited ? null : Math.round(freePts * Number(form.pro_multiplier));
  // Pro 不限 → Max(= Pro × 倍率)自然也不限
  const maxUnlimited = proUnlimited || Number(form.max_multiplier ?? 0) <= 0;
  const maxPts = maxUnlimited || proPts == null ? null : Math.round(proPts * Number(form.max_multiplier));

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-12 border border-border-soft bg-surface-1 px-4 py-3">
      <span className="text-12 text-faint">
        按当前取值派生 · 每 {Number(form.window_days) || 7} 天
      </span>
      <DerivedItem label="Free" value={`${freePts.toLocaleString()} 算力点`} />
      <DerivedItem label="Pro" value={proPts == null ? '不限' : `${proPts.toLocaleString()} 算力点`} />
      <DerivedItem label="Max" value={maxPts == null ? '不限' : `${maxPts.toLocaleString()} 算力点`} />
    </div>
  );
}

function DerivedItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-12 text-faint">{label}</span>
      <span className="text-12 font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

export default BillingConfigPage;

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import {
  useAdminProviders,
  MODEL_PRESETS,
  presetPayload,
  type AgentModel,
  type AgentModelPayload,
} from '../api/model-catalog';

/**
 * 数字输入的**中间态**处理。
 *
 * 旧写法 `Number(e.target.value) || 0` 有两个致命面:
 *   - 清空输入框 → `value` 是 ''(number input 对非法文本也回 '')→ 折成 0 写回受控 state,
 *     输入框当场跳回 `0`,用户得先删掉那个 0 才能继续打字;
 *   - 输入「0.」这类合法中间态同样被 sanitize 成 '' → 小数点被吞,而价格 step=0.0001
 *     恰恰是最需要输小数的地方。
 * 更要命的是 **0 在成本制里等于免费**:一次「先清空再重填」中途保存,就上线了一个白送的模型。
 *
 * 现在允许 NaN 停在 state 里(渲染成空串,DOM 里用户正在敲的原文不被 React 覆写),
 * 提交前统一 `sanitizeNumbers` 归 0。
 */
const num = (v: number) => (Number.isNaN(v) ? 0 : v);
const numValue = (v: number) => (Number.isNaN(v) ? '' : v);

const NUMERIC_KEYS: (keyof AgentModelPayload)[] = [
  'provider_id', 'context_window', 'max_input', 'max_output', 'sort_order',
  'price_in', 'price_out', 'price_cache_r', 'price_cache_w',
  'input_tier_threshold', 'price_in_hi', 'price_out_hi', 'price_cache_r_hi', 'price_cache_w_hi',
  'input_tier_threshold_2', 'price_in_hi2', 'price_out_hi2', 'price_cache_r_hi2', 'price_cache_w_hi2',
];

function sanitizeNumbers(f: AgentModelPayload): AgentModelPayload {
  const out: AgentModelPayload = { ...f };
  for (const k of NUMERIC_KEYS) {
    const v = out[k];
    if (typeof v === 'number' && Number.isNaN(v)) (out as Record<string, unknown>)[k] = 0;
  }
  return out;
}

/** 输入 + 输出单价都是 0 → 成本制下 cost 恒为 0 → 该模型对所有用户等于免费。 */
const isUnpriced = (f: AgentModelPayload) => !(num(f.price_in) > 0) && !(num(f.price_out) > 0);

/**
 * ModelFormDialog — 模型目录的新建 / 编辑弹窗(ModelCatalogPage 专用)。
 * model=null 时为新建;编辑时 model_id 可改(后端校验唯一)。
 *
 * 🔴 四类单价**不是**"只是录入与展示"(旧注释如此写,已过时):P5 起是成本制计费,
 * 用户额度按 cost_micro_yuan 扣,而 cost 就是这四个单价算出来的。单价 0 → cost 恒为 0
 * → 该模型对所有用户免费。所以本弹窗有未计价警示 + 提交闸门,见 isUnpriced。
 */
export function ModelFormDialog({
  open,
  model,
  presetProviderId = 0,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  model: AgentModel | null;
  /** 新建时的归属端点(从端点区块「添加模型」进入时预选;编辑时忽略,用模型自身值)。 */
  presetProviderId?: number;
  onClose: () => void;
  onSave: (payload: AgentModelPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AgentModelPayload>(emptyForm());

  useEffect(() => {
    if (!open) return;
    setForm(model ? { ...model } : { ...emptyForm(), provider_id: presetProviderId });
  }, [open, model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof AgentModelPayload>(key: K, value: AgentModelPayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 上下文 = 最大输入 + 最大输出 的共享预算。填了三者中的两个,自动补第三个(仅当恰有一个为 0 时;
  // 三个都填了则视为强改,不自动改动)。任何一个都可直接手填覆盖。
  const setCtxField = (key: 'context_window' | 'max_input' | 'max_output', v: number) =>
    setForm((f) => {
      const next = { ...f, [key]: v };
      // 用户正在清空这一格(NaN 中间态)→ 不自动补,否则刚删完就被填回去,永远清不掉。
      if (Number.isNaN(v)) return next;
      const ctx = num(next.context_window);
      const mi = num(next.max_input);
      const mo = num(next.max_output);
      const zeros = [ctx, mi, mo].filter((x) => x <= 0).length;
      if (zeros !== 1) return next; // 只在「恰好一个空」时自动补
      if (ctx <= 0) next.context_window = mi + mo;
      else if (mi <= 0) next.max_input = Math.max(0, ctx - mo);
      else if (mo <= 0) next.max_output = Math.max(0, ctx - mi);
      return next;
    });

  // 未计价警示 —— 价格区块上方常驻,「启用 + 用户可选」时升级成红框(那是真正会漏钱的组合)。
  const unpriced = isUnpriced(form);
  const unpricedAndLive = unpriced && form.enabled && form.user_selectable;

  // 上游 Provider:0 = 默认端点;openai 格式 provider 由 agent 出口自动翻译(F3)。
  const { data: providers } = useAdminProviders();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{model ? '编辑模型' : '新增模型'}</DialogTitle>
            <DialogDescription>
              模型 id 须是当前 agent 上游(base URL)能直接调用的 id;价格用于成本核算与计费倍率参考。
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = sanitizeNumbers(form);
              // 提交闸门:未计价 + 启用 + 用户可选 = 全站白送。必须先填价或先关掉一个开关。
              if (isUnpriced(payload) && payload.enabled && payload.user_selectable) {
                toast.error('输入 / 输出单价均为 0 —— 该模型对所有用户等于免费', {
                  description:
                    '成本制按四类单价算成本,单价 0 → cost 恒为 0,不扣任何额度。请填写真实单价,或先关闭「启用」/「用户可选」再保存。',
                });
                return;
              }
              onSave(payload);
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-model-id">模型 ID(上游真实 id)</Label>
                <Input
                  id="m-model-id"
                  value={form.model_id}
                  onChange={(e) => set('model_id', e.target.value)}
                  required
                  placeholder="deepseek-v4-pro"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-display">对外展示名(必填,与上游 code 分开)</Label>
                <Input
                  id="m-display"
                  value={form.display_name}
                  onChange={(e) => set('display_name', e.target.value)}
                  required
                  maxLength={32}
                  placeholder="给用户看的人话名,如「DeepSeek V4 Pro」"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-desc">一句话说明(选择器里展示)</Label>
              <Input
                id="m-desc"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={200}
                placeholder="均衡的日常主力模型"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-ctx">上下文窗口</Label>
                <Input
                  id="m-ctx"
                  type="number"
                  value={numValue(form.context_window)}
                  onChange={(e) => setCtxField('context_window', e.target.valueAsNumber)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-maxin">最大输入</Label>
                <Input
                  id="m-maxin"
                  type="number"
                  value={numValue(form.max_input)}
                  onChange={(e) => setCtxField('max_input', e.target.valueAsNumber)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-maxout">最大输出</Label>
                <Input
                  id="m-maxout"
                  type="number"
                  value={numValue(form.max_output)}
                  onChange={(e) => setCtxField('max_output', e.target.valueAsNumber)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-sort">排序</Label>
                <Input
                  id="m-sort"
                  type="number"
                  value={numValue(form.sort_order)}
                  onChange={(e) => set('sort_order', e.target.valueAsNumber)}
                />
              </div>
            </div>
            <p className="text-12 text-faint">
              上下文 = 最大输入 + 最大输出(共享预算)。填其中两个会自动补第三个,也可各自强改。最大输入留空(0)时
              agent 压缩墙按「上下文 − 输出预留」自动算,保证 输入 + 输出 ≤ 上下文,不溢出。
            </p>
            <p className="text-12 text-faint">
              成本制计费:用户额度按下方四类单价(输入/输出/缓存读/缓存写)的真实成本扣减,贵模型自然扣得快,无需再配倍率。
            </p>

            {/* 官方预设模型:一键填入官方参数(官方文档口径,填后仍可手改) */}
            {MODEL_PRESETS[form.model_id] && (
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft bg-surface-1 p-3">
                <p className="text-12 text-muted-foreground">
                  这是官方预设模型 —— 可一键填入官方参数(上下文 / 输出 / 价格 / 倍率),填后仍可手改。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setForm((f) => ({
                      ...presetPayload(form.model_id, model, f.provider_id),
                      user_selectable: f.user_selectable,
                      enabled: f.enabled,
                      min_tier: f.min_tier,
                      sort_order: f.sort_order,
                      notes: f.notes,
                    }))
                  }
                >
                  填入官方预设
                </Button>
              </div>
            )}

            {/* 🔴 未计价警示 —— 成本制下单价 0 = 该模型对所有用户免费。默认值就是 0,
                而「启用 + 用户可选」也默认开着,只填 model_id + 展示名就能存下一个白送的模型。 */}
            {unpriced && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-12 border p-3',
                  unpricedAndLive ? 'border-brand-red bg-danger-soft' : 'border-border-soft bg-surface-1',
                )}
              >
                <TriangleAlert
                  className={cn('size-3.5 shrink-0 mt-0.5', unpricedAndLive ? 'text-brand-red' : 'text-brand-amber')}
                />
                <div className="text-12">
                  <p className={cn('font-medium', unpricedAndLive ? 'text-brand-red' : 'text-foreground')}>
                    输入 / 输出单价都是 0 —— 该模型将不消耗任何用户额度
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    成本制按四类单价算成本(cost 恒为 0 → 扣 0)。
                    {unpricedAndLive
                      ? '它当前还是「启用 + 用户可选」,保存后全站用户都能免费用 —— 请填真实单价,或先关掉下方任一开关(否则保存会被拦下)。'
                      : '当前未同时处于「启用 + 用户可选」,可以先存;正式上线前请填入真实单价。'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['price_in', '输入 元/1M'],
                  ['price_out', '输出 元/1M'],
                  ['price_cache_r', '缓存读 元/1M'],
                  ['price_cache_w', '缓存写 元/1M'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`m-${key}`}>{label}</Label>
                  <Input
                    id={`m-${key}`}
                    type="number"
                    step="0.0001"
                    min={0}
                    value={numValue(form[key])}
                    onChange={(e) => set(key, e.target.valueAsNumber)}
                    className={cn(
                      unpricedAndLive && (key === 'price_in' || key === 'price_out') && 'border-brand-red',
                    )}
                  />
                </div>
              ))}
            </div>

            {/* 输入长度分档计价(千问等按 prompt 长度分 2~3 档;价格分档,平台不吃长上下文差价) */}
            <div className="space-y-2 rounded-12 border border-border-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="m-tier-threshold" className="text-12 font-medium">
                  输入长度分档 · 档2 阈值(高档价)
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-12 text-faint">prompt(输入+缓存)&gt;</span>
                  <Input
                    id="m-tier-threshold"
                    type="number"
                    min={0}
                    className="w-28"
                    value={numValue(form.input_tier_threshold)}
                    onChange={(e) => set('input_tier_threshold', e.target.valueAsNumber)}
                  />
                  <span className="text-12 text-faint">token 切档2</span>
                </div>
              </div>
              <p className="text-12 text-faint">
                0 = 不分档(DeepSeek / 扁平模型)。千问 plus 填 256000、qwen3.7-flash 填 32000。高档价留空(0)回落基础值;成本按高档价扣。
              </p>
              {form.input_tier_threshold > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(
                      [
                        ['price_in_hi', '档2 输入 元/1M'],
                        ['price_out_hi', '档2 输出 元/1M'],
                        ['price_cache_r_hi', '档2 缓存读 元/1M'],
                        ['price_cache_w_hi', '档2 缓存写 元/1M'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={`m-${key}`} className="text-12">{label}</Label>
                        <Input
                          id={`m-${key}`}
                          type="number"
                          step="0.0001"
                          min={0}
                          value={numValue(form[key])}
                          onChange={(e) => set(key, e.target.valueAsNumber)}
                        />
                      </div>
                    ))}
                  </div>
                  {/* 档3(可选第三档;须 > 档2 阈值)。qwen3.7-flash 填 256000。0 = 只 2 档。 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Label htmlFor="m-tier-threshold-2" className="text-12 font-medium">
                      档3 阈值(更高档价,可选)
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-12 text-faint">prompt &gt;</span>
                      <Input
                        id="m-tier-threshold-2"
                        type="number"
                        min={0}
                        className="w-28"
                        value={numValue(form.input_tier_threshold_2)}
                        onChange={(e) => set('input_tier_threshold_2', e.target.valueAsNumber)}
                      />
                      <span className="text-12 text-faint">token 切档3</span>
                    </div>
                  </div>
                  {form.input_tier_threshold_2 > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(
                        [
                          ['price_in_hi2', '档3 输入 元/1M'],
                          ['price_out_hi2', '档3 输出 元/1M'],
                          ['price_cache_r_hi2', '档3 缓存读 元/1M'],
                          ['price_cache_w_hi2', '档3 缓存写 元/1M'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={`m-${key}`} className="text-12">{label}</Label>
                          <Input
                            id={`m-${key}`}
                            type="number"
                            step="0.0001"
                            min={0}
                            value={numValue(form[key])}
                            onChange={(e) => set(key, e.target.valueAsNumber)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-provider">上游 Provider</Label>
              <Select
                id="m-provider"
                value={form.provider_id}
                onChange={(e) => set('provider_id', Number(e.target.value) || 0)}
                className="h-9"
              >
                <option value={0}>默认端点(AI Agent 服务页配置)</option>
                {(providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}({p.api_format})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-speed">速度档(选择器徽标)</Label>
                <Select
                  id="m-speed"
                  value={form.speed_class}
                  onChange={(e) => set('speed_class', e.target.value as AgentModelPayload['speed_class'])}
                  className="h-9"
                >
                  <option value="fast">fast · 快</option>
                  <option value="balanced">balanced · 均衡</option>
                  <option value="powerful">powerful · 强推理</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-tier">档位门槛</Label>
                <Select
                  id="m-tier"
                  value={form.min_tier}
                  onChange={(e) => set('min_tier', e.target.value as AgentModelPayload['min_tier'])}
                  className="h-9"
                >
                  <option value="">全员可用</option>
                  <option value="pro">Pro 及以上</option>
                  <option value="max">仅 Max</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-selectable" className="text-12 font-medium">用户可选</Label>
                  <p className="text-12 text-faint mt-0.5">出现在对话模型选择器中(P2 上线后生效)</p>
                </div>
                <Switch
                  id="m-selectable"
                  checked={form.user_selectable}
                  onCheckedChange={(v) => set('user_selectable', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-enabled" className="text-12 font-medium">启用</Label>
                  <p className="text-12 text-faint mt-0.5">停用后从选择器消失;能力绑定不受影响</p>
                </div>
                <Switch id="m-enabled" checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-vision" className="text-12 font-medium">视觉能力(识图)</Label>
                  <p className="text-12 text-faint mt-0.5">支持图片输入的模型才勾;决定对话里能否上传图片</p>
                </div>
                <Switch id="m-vision" checked={form.vision} onCheckedChange={(v) => set('vision', v)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-flagship" className="text-12 font-medium">旗舰模型</Label>
                  <p className="text-12 text-faint mt-0.5">标为旗舰后,用户选择器里名字彩色高亮 + 「旗舰」标签,突出主推</p>
                </div>
                <Switch id="m-flagship" checked={form.flagship} onCheckedChange={(v) => set('flagship', v)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-notes">内部备注(不对用户展示)</Label>
              <Input
                id="m-notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                maxLength={200}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

function emptyForm(): AgentModelPayload {
  return {
    model_id: '',
    provider_id: 0,
    display_name: '',
    description: '',
    channel: 'agent',
    context_window: 128000,
    max_input: 0,
    max_output: 0,
    price_in: 0,
    price_out: 0,
    price_cache_r: 0,
    price_cache_w: 0,
    input_tier_threshold: 0,
    price_in_hi: 0,
    price_out_hi: 0,
    price_cache_r_hi: 0,
    price_cache_w_hi: 0,
    input_tier_threshold_2: 0,
    price_in_hi2: 0,
    price_out_hi2: 0,
    price_cache_r_hi2: 0,
    price_cache_w_hi2: 0,
    speed_class: 'balanced',
    vision: false,
    flagship: false,
    user_selectable: true,
    min_tier: '',
    enabled: true,
    sort_order: 0,
    notes: '',
  };
}

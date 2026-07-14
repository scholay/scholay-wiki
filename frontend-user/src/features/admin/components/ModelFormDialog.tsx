import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useAdminProviders, type AgentModel, type AgentModelPayload } from '../api/model-catalog';

/**
 * ModelFormDialog — 模型目录的新建 / 编辑弹窗(ModelCatalogPage 专用)。
 * model=null 时为新建;编辑时 model_id 可改(后端校验唯一)。
 * 价格四项与计费倍率:P1 只是录入与展示,倍率在 P3(加权计费)才参与额度扣减。
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

  // 上游 Provider:0 = 默认端点;openai 格式 provider 由 agent 出口自动翻译(F3)。
  const { data: providers } = useAdminProviders();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
              onSave(form);
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
                  value={form.context_window}
                  onChange={(e) => set('context_window', Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-maxout">最大输出</Label>
                <Input
                  id="m-maxout"
                  type="number"
                  value={form.max_output}
                  onChange={(e) => set('max_output', Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-weight">计费倍率</Label>
                <Input
                  id="m-weight"
                  type="number"
                  step="0.05"
                  min={0.05}
                  max={100}
                  value={form.billing_weight}
                  onChange={(e) => set('billing_weight', Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-sort">排序</Label>
                <Input
                  id="m-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <p className="text-2xs text-faint">
              计费倍率 = 用户额度的扣减系数(×1 为基准,加权计费上线后生效)。建议按混合价估算:0.8×输入价 + 0.2×输出价,再除以基准模型同口径价格。
            </p>

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
                    value={form[key]}
                    onChange={(e) => set(key, Number(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-provider">上游 Provider</Label>
              <select
                id="m-provider"
                value={form.provider_id}
                onChange={(e) => set('provider_id', Number(e.target.value) || 0)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={0}>默认端点(AI Agent 服务页配置)</option>
                {(providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}({p.api_format})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-speed">速度档(选择器徽标)</Label>
                <select
                  id="m-speed"
                  value={form.speed_class}
                  onChange={(e) => set('speed_class', e.target.value as AgentModelPayload['speed_class'])}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="fast">fast · 快</option>
                  <option value="balanced">balanced · 均衡</option>
                  <option value="powerful">powerful · 强推理</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-tier">档位门槛</Label>
                <select
                  id="m-tier"
                  value={form.min_tier}
                  onChange={(e) => set('min_tier', e.target.value as AgentModelPayload['min_tier'])}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">全员可用</option>
                  <option value="pro">Pro 及以上</option>
                  <option value="max">仅 Max</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-selectable" className="text-sm font-medium">用户可选</Label>
                  <p className="text-2xs text-faint mt-0.5">出现在对话模型选择器中(P2 上线后生效)</p>
                </div>
                <Switch
                  id="m-selectable"
                  checked={form.user_selectable}
                  onCheckedChange={(v) => set('user_selectable', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-enabled" className="text-sm font-medium">启用</Label>
                  <p className="text-2xs text-faint mt-0.5">停用后从选择器消失;能力绑定不受影响</p>
                </div>
                <Switch id="m-enabled" checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border-soft p-3">
                <div>
                  <Label htmlFor="m-vision" className="text-sm font-medium">视觉能力(识图)</Label>
                  <p className="text-2xs text-faint mt-0.5">支持图片输入的模型才勾;决定对话里能否上传图片</p>
                </div>
                <Switch id="m-vision" checked={form.vision} onCheckedChange={(v) => set('vision', v)} />
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
    max_output: 0,
    price_in: 0,
    price_out: 0,
    price_cache_r: 0,
    price_cache_w: 0,
    billing_weight: 1,
    speed_class: 'balanced',
    vision: false,
    user_selectable: true,
    min_tier: '',
    enabled: true,
    sort_order: 0,
    notes: '',
  };
}

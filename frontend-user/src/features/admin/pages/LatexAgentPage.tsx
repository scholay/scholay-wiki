import { useState } from 'react';
import { Save, Loader2, Zap, Plus, Pencil, Trash2, Star, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useLatexAgentConfig,
  useUpdateLatexAgentConfig,
  useModelPresets,
  useApplyModelPreset,
  useTestLatexAgent,
  useAgentModels,
  useCreateAgentModel,
  useUpdateAgentModel,
  useDeleteAgentModel,
  useSetDefaultModel,
  type AgentModel,
  type AgentModelInput,
} from '../api/latex-agent';

/**
 * Latex Agent 管理 —— 2 个 tab:
 *   1. 模型清单 —— CRUD agent_models 表(provider/endpoint/api_key/温度)+ 设为默认
 *   2. Agent 配置 —— 全局 tuning 字段(默认模型 / 多 agent 开关 / 工具开关 / system prompt 覆盖)
 *
 * 不再像之前把"模型字段"硬塞进 agent 配置表单。
 */
export function LatexAgentPage() {
  return (
    <AdminPageLayout title="LaTeX Agent" description="Prism / Claw 等场景使用的 LLM 配置中心">
      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">模型清单</TabsTrigger>
          <TabsTrigger value="config">Agent 配置</TabsTrigger>
          <TabsTrigger value="test">连接测试</TabsTrigger>
        </TabsList>
        <TabsContent value="models" className="mt-4"><ModelsList /></TabsContent>
        <TabsContent value="config" className="mt-4"><AgentConfigForm /></TabsContent>
        <TabsContent value="test" className="mt-4"><TestPanel /></TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}

// ============================================================================
// 模型清单(agent_models 表)
// ============================================================================

type ModelEditMode = { kind: 'create' } | { kind: 'edit'; row: AgentModel } | null;

function ModelsList() {
  const { data, isLoading } = useAgentModels();
  const { data: presets } = useModelPresets();
  const create = useCreateAgentModel();
  const update = useUpdateAgentModel();
  const del = useDeleteAgentModel();
  const setDefault = useSetDefaultModel();
  const applyPreset = useApplyModelPreset();
  const [mode, setMode] = useState<ModelEditMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleDelete = async (r: AgentModel) => {
    const ok = await confirm({
      title: `删除模型「${r.display_name}」?`,
      description: r.is_default
        ? '⚠️ 这是当前默认模型,删除后 LaTeX Agent 将无法工作!'
        : undefined,
      danger: true,
      confirmText: '删除',
      typeToConfirm: r.is_default ? 'DELETE' : undefined,
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(r.id), { success: '已删除', failure: '删除失败' });
  };

  const handleSetDefault = async (r: AgentModel) => {
    if (r.is_default) return;
    await apiToast(setDefault.mutateAsync(r.id), { success: '已设为默认', failure: '设置失败' });
  };

  const handleApplyPreset = async (preset_id: string, name: string) => {
    const ok = await confirm({
      title: `应用预设「${name}」?`,
      description: '会自动创建对应模型记录。已存在的同名记录会被覆盖。',
    });
    if (!ok) return;
    await apiToast(applyPreset.mutateAsync(preset_id), { success: '预设已应用', failure: '应用失败' });
  };

  const columns: Column<AgentModel>[] = [
    {
      header: '名称',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="font-bold text-foreground">{r.display_name}</span>
            <span className="text-2xs text-faint font-mono">{r.model_name}</span>
          </div>
          {r.is_default && (
            <Badge variant="default" className="text-2xs">
              <Star className="size-3" />
              默认
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: '协议',
      width: 100,
      cell: (r) => <Badge variant="muted">{r.api_format}</Badge>,
    },
    {
      header: 'Endpoint',
      cell: (r) => <span className="text-2xs text-faint font-mono truncate max-w-[260px]">{r.api_endpoint}</span>,
    },
    {
      header: 'Key',
      width: 60,
      cell: (r) =>
        r.has_api_key ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">已设</Badge>
        ) : (
          <Badge variant="outline">未设</Badge>
        ),
    },
    {
      header: '上下文',
      width: 110,
      align: 'right',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {(r.max_context_tokens / 1000).toFixed(0)}k / {(r.max_output_tokens / 1000).toFixed(0)}k
        </span>
      ),
    },
    {
      header: '状态',
      width: 80,
      cell: (r) =>
        r.is_enabled ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">启用</Badge>
        ) : (
          <Badge variant="outline">停用</Badge>
        ),
    },
    {
      header: '',
      width: 130,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" title={r.is_default ? '已是默认' : '设为默认'}
            onClick={() => handleSetDefault(r)} disabled={r.is_default}>
            <Star className={`size-3.5 ${r.is_default ? 'fill-brand-amber text-brand-amber' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setMode({ kind: 'edit', row: r })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(r)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
            <Plus className="size-3.5" />
            新增模型
          </Button>
        </div>
        <DataTable columns={columns} rows={data} loading={isLoading} />
      </div>

      {/* 右栏:模型预设 */}
      <div className="rounded-md border border-border bg-background p-4 space-y-2 h-fit">
        <div className="pb-3 border-b border-border-soft flex items-center gap-2">
          <Sparkles className="size-4 text-faint" />
          <h3 className="text-sm font-bold text-foreground">模型预设</h3>
        </div>
        {presets && presets.length > 0 ? (
          presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={applyPreset.isPending}
              onClick={() => handleApplyPreset(p.id, p.name)}
              className="w-full text-left p-2 rounded-md border border-border-soft hover:bg-surface-1 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-sm">{p.name}</span>
                <Badge variant="muted" className="text-2xs">{p.api_format}</Badge>
              </div>
              <div className="text-2xs text-faint font-mono mt-0.5">{p.model_name}</div>
              {p.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</div>
              )}
            </button>
          ))
        ) : (
          <div className="text-xs text-faint text-center py-4">还没有配置预设,点上方按钮新建一个</div>
        )}
      </div>

      <ModelDialog
        mode={mode}
        onClose={() => setMode(null)}
        onSubmit={async (form) => {
          const ok = mode?.kind === 'create'
            ? await apiToast(create.mutateAsync(form), { success: '已添加', failure: '添加失败' })
            : mode?.kind === 'edit'
            ? await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' })
            : null;
          if (ok !== null) setMode(null);
        }}
      />
    </div>
  );
}

function ModelDialog({
  mode,
  onClose,
  onSubmit,
}: {
  mode: ModelEditMode;
  onClose: () => void;
  onSubmit: (form: AgentModelInput) => void;
}) {
  if (!mode) return null;
  const isEdit = mode.kind === 'edit';
  const initial = isEdit ? mode.row : undefined;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模型' : '新增模型'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const apiKey = String(fd.get('api_key') || '');
            onSubmit({
              display_name: String(fd.get('display_name') || ''),
              api_format: String(fd.get('api_format') || 'openai'),
              model_name: String(fd.get('model_name') || ''),
              api_endpoint: String(fd.get('api_endpoint') || ''),
              api_key: apiKey || undefined,
              max_context_tokens: Number(fd.get('max_context_tokens') || 128000),
              max_output_tokens: Number(fd.get('max_output_tokens') || 16384),
              temperature: Number(fd.get('temperature') || 0.7),
              description: String(fd.get('description') || '') || undefined,
              sort_order: Number(fd.get('sort_order') || 0),
              is_enabled: fd.get('is_enabled') === 'on',
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">显示名</Label>
              <Input id="display_name" name="display_name" defaultValue={initial?.display_name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model_name">Model Name</Label>
              <Input id="model_name" name="model_name" defaultValue={initial?.model_name} placeholder="gpt-4o" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api_format">API 协议</Label>
              <select
                id="api_format"
                name="api_format"
                defaultValue={initial?.api_format || 'openai'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="claude">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api_endpoint">API Endpoint</Label>
              <Input id="api_endpoint" name="api_endpoint" defaultValue={initial?.api_endpoint} placeholder="https://api.openai.com/v1" required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="api_key">API Key</Label>
              <Input id="api_key" name="api_key" type="password" placeholder={isEdit ? '留空表示不修改' : 'sk-...'} required={!isEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_context_tokens">上下文 tokens</Label>
              <Input id="max_context_tokens" name="max_context_tokens" type="number" defaultValue={initial?.max_context_tokens ?? 128000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_output_tokens">输出 tokens</Label>
              <Input id="max_output_tokens" name="max_output_tokens" type="number" defaultValue={initial?.max_output_tokens ?? 16384} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temperature">Temperature</Label>
              <Input id="temperature" name="temperature" type="number" step="0.1" min="0" max="2" defaultValue={initial?.temperature ?? 0.7} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort_order">排序</Label>
              <Input id="sort_order" name="sort_order" type="number" defaultValue={initial?.sort_order ?? 0} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">描述(可选)</Label>
            <Input id="description" name="description" defaultValue={initial?.description} />
          </div>

          <div className="flex items-center gap-2">
            <input id="is_enabled" name="is_enabled" type="checkbox" defaultChecked={initial?.is_enabled ?? true} className="size-4" />
            <Label htmlFor="is_enabled" className="text-sm">启用</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '添加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Agent 配置(latex_agent_configs 表)
// ============================================================================

function AgentConfigForm() {
  const { data, isLoading } = useLatexAgentConfig();
  const { data: models } = useAgentModels();
  const update = useUpdateLatexAgentConfig();
  const apiToast = useApiToast();

  if (isLoading) {
    return (
      <div className="rounded-md border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  return (
    <form
      className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            default_model_id: Number(fd.get('default_model_id')) || undefined,
            planner_model_id: Number(fd.get('planner_model_id')) || undefined,
            validator_model_id: Number(fd.get('validator_model_id')) || undefined,
            context_window_messages: Number(fd.get('context_window_messages') || 20),
            truncation_strategy: String(fd.get('truncation_strategy') || 'recency'),
            top_p: Number(fd.get('top_p') || 0.95),
            frequency_penalty: Number(fd.get('frequency_penalty') || 0),
            presence_penalty: Number(fd.get('presence_penalty') || 0),
            max_iterations: Number(fd.get('max_iterations') || 10),
            auto_validate_latex: fd.get('auto_validate_latex') === 'on',
            auto_fix_errors: fd.get('auto_fix_errors') === 'on',
            enable_tool_calling: fd.get('enable_tool_calling') === 'on',
            enable_multi_agent: fd.get('enable_multi_agent') === 'on',
            auto_compact_enabled: fd.get('auto_compact_enabled') === 'on',
            auto_compact_threshold: Number(fd.get('auto_compact_threshold') || 0.8),
            system_prompt_override: String(fd.get('system_prompt_override') || '') || undefined,
            system_prompt_append: String(fd.get('system_prompt_append') || '') || undefined,
            is_active: fd.get('is_active') === 'on',
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">Agent 配置</h2>
        <p className="text-xs text-muted-foreground mt-1">指定默认模型 + 调参 + 工具/多 Agent 开关</p>
      </div>

      {/* 模型指派 */}
      <div className="grid grid-cols-3 gap-3">
        <ModelSelectField name="default_model_id" label="默认模型" models={models} initial={data?.default_model_id} />
        <ModelSelectField name="planner_model_id" label="Planner 模型" models={models} initial={data?.planner_model_id} optional />
        <ModelSelectField name="validator_model_id" label="Validator 模型" models={models} initial={data?.validator_model_id} optional />
      </div>

      {/* 采样调参 */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Top P">
          <Input name="top_p" type="number" step="0.01" min="0" max="1" defaultValue={data?.top_p ?? 0.95} />
        </Field>
        <Field label="Frequency Penalty">
          <Input name="frequency_penalty" type="number" step="0.1" defaultValue={data?.frequency_penalty ?? 0} />
        </Field>
        <Field label="Presence Penalty">
          <Input name="presence_penalty" type="number" step="0.1" defaultValue={data?.presence_penalty ?? 0} />
        </Field>
      </div>

      {/* 上下文 + 迭代 */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="上下文窗口(消息数)">
          <Input name="context_window_messages" type="number" defaultValue={data?.context_window_messages ?? 20} />
        </Field>
        <Field label="截断策略">
          <select
            name="truncation_strategy"
            defaultValue={data?.truncation_strategy || 'recency'}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="recency">最近优先</option>
            <option value="summary">摘要保留</option>
          </select>
        </Field>
        <Field label="最大迭代次数">
          <Input name="max_iterations" type="number" defaultValue={data?.max_iterations ?? 10} />
        </Field>
      </div>

      {/* 自动压缩 */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-soft">
        <div className="flex items-center gap-2 h-9">
          <input id="auto_compact_enabled" name="auto_compact_enabled" type="checkbox"
            defaultChecked={data?.auto_compact_enabled} className="size-4" />
          <Label htmlFor="auto_compact_enabled" className="text-sm">启用自动压缩</Label>
        </div>
        <Field label="压缩触发阈值(0-1)">
          <Input name="auto_compact_threshold" type="number" step="0.05" min="0" max="1" defaultValue={data?.auto_compact_threshold ?? 0.8} />
        </Field>
      </div>

      {/* 行为开关 */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-soft">
        <Checkbox name="enable_tool_calling" label="允许工具调用" checked={data?.enable_tool_calling} />
        <Checkbox name="enable_multi_agent" label="启用多 Agent 协作" checked={data?.enable_multi_agent} />
        <Checkbox name="auto_validate_latex" label="自动校验 LaTeX" checked={data?.auto_validate_latex} />
        <Checkbox name="auto_fix_errors" label="自动修复编译错误" checked={data?.auto_fix_errors} />
        <Checkbox name="is_active" label="启用 LaTeX Agent" checked={data?.is_active} />
      </div>

      {/* System prompts */}
      <Field label="System Prompt Override(完全覆盖默认)">
        <textarea
          name="system_prompt_override"
          rows={5}
          defaultValue={data?.system_prompt_override}
          placeholder="留空表示沿用默认"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field label="System Prompt Append(追加到默认末尾)">
        <textarea
          name="system_prompt_append"
          rows={3}
          defaultValue={data?.system_prompt_append}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      <div className="pt-3 border-t border-border-soft">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存 Agent 配置
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// 连接测试
// ============================================================================

function TestPanel() {
  const test = useTestLatexAgent();
  const { data: models } = useAgentModels();
  const apiToast = useApiToast();
  const [result, setResult] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('Hello, can you reply in one short sentence?');
  const [modelId, setModelId] = useState<string>('');

  const handleTest = async () => {
    setResult(null);
    const r = await apiToast(
      test.mutateAsync({ prompt, model_id: modelId ? Number(modelId) : undefined }),
      { failure: '连接失败' }
    );
    if (r) {
      const { ok, latency_ms, sample, error } = r.data.data;
      if (ok) {
        setResult(`✓ 连接成功 · ${latency_ms ?? '?'}ms\n\n${sample || ''}`);
      } else {
        setResult(`✗ 连接异常 · ${error || '未知错误'}`);
      }
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl">
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">连接测试</h2>
        <p className="text-xs text-muted-foreground mt-1">用指定模型发一条消息,验证 endpoint + key 是否生效</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="使用模型(不选则用默认)">
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">默认模型</option>
            {models?.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name} ({m.model_name})</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <Button type="button" disabled={test.isPending} onClick={handleTest} className="w-full">
            {test.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            发送测试
          </Button>
        </div>
      </div>

      <Field label="测试 prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      {result && (
        <div className="rounded-md bg-surface-1 border border-border-soft p-3 text-xs font-mono text-subtle whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// helpers
// ============================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Checkbox({ name, label, checked }: { name: string; label: string; checked?: boolean }) {
  return (
    <div className="flex items-center gap-2 h-9">
      <input id={name} name={name} type="checkbox" defaultChecked={checked} className="size-4" />
      <Label htmlFor={name} className="text-sm">{label}</Label>
    </div>
  );
}

function ModelSelectField({
  name, label, models, initial, optional,
}: {
  name: string;
  label: string;
  models?: AgentModel[];
  initial?: number;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={initial?.toString() || ''}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {optional && <option value="">不指定</option>}
        {!optional && !initial && <option value="">请选择…</option>}
        {models?.map((m) => (
          <option key={m.id} value={m.id}>{m.display_name}</option>
        ))}
      </select>
    </Field>
  );
}

/**
 * LatexAgentConfig v2 — LaTeX Agent 模型与运行参数
 *
 * 功能:
 *   - 模型管理 (CRUD + 设默认 + 启停)
 *   - 全局配置 (context window / max iterations / temperature 等)
 *   - 应用模型预设 (一键填充常见模型配置)
 *   - 测试连接
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Star,
  Zap,
  Sparkles,
} from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Label } from '../../components/ui/label';

interface ModelRow {
  id: number;
  display_name: string;
  api_format: string;
  model_name: string;
  api_endpoint: string;
  max_context_tokens: number;
  max_output_tokens: number;
  temperature: number;
  description?: string;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  has_api_key?: boolean;
}

interface ModelFormState {
  id?: number;
  display_name: string;
  api_format: string;
  model_name: string;
  api_endpoint: string;
  api_key: string;
  max_context_tokens: number;
  max_output_tokens: number;
  temperature: number;
  description: string;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  editing?: boolean;
}

interface GlobalConfig {
  default_model_id?: number | string | null;
  context_window_messages?: number;
  max_iterations?: number;
  truncation_strategy?: string;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  auto_validate_latex?: boolean;
  auto_fix_errors?: boolean;
  enable_tool_calling?: boolean;
  enabled_tool_categories?: string[];
  system_prompt_override?: string;
  system_prompt_append?: string;
  is_active?: boolean;
}

function emptyModelForm(): ModelFormState {
  return {
    display_name: '',
    api_format: 'openai',
    model_name: '',
    api_endpoint: 'https://api.openai.com/v1',
    api_key: '',
    max_context_tokens: 128000,
    max_output_tokens: 16384,
    temperature: 0.7,
    description: '',
    sort_order: 0,
    is_default: false,
    is_enabled: true,
  };
}

export default function LatexAgentConfigV2() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['admin', 'latexAgent', 'config'],
    queryFn: async () => (await adminAPI.getLatexAgentConfig()).data?.data as GlobalConfig,
  });
  const modelsQuery = useQuery({
    queryKey: ['admin', 'latexAgent', 'models'],
    queryFn: async () => {
      // 后端返回 { models: [...], total: N }
      const data = (await adminAPI.getLatexAgentModels()).data?.data;
      const list = Array.isArray(data) ? data : data?.models || [];
      return list as ModelRow[];
    },
  });
  const presetsQuery = useQuery({
    queryKey: ['admin', 'latexAgent', 'presets'],
    queryFn: async () => {
      // 后端返回 { presets: [...] }
      const data = (await adminAPI.getLatexAgentModelPresets()).data?.data;
      const list = Array.isArray(data) ? data : data?.presets || [];
      return list as any[];
    },
  });
  const formatsQuery = useQuery({
    queryKey: ['admin', 'latexAgent', 'apiFormats'],
    queryFn: async () => {
      // 后端返回 { formats: [...] }
      const data = (await adminAPI.getLatexAgentApiFormats()).data?.data;
      const list = Array.isArray(data) ? data : data?.formats || [];
      return list as { value: string; label: string; default_endpoint?: string }[];
    },
  });
  const optionsQuery = useQuery({
    queryKey: ['admin', 'latexAgent', 'options'],
    queryFn: async () => (await adminAPI.getLatexAgentConfigOptions()).data?.data as any,
  });

  const saveModelMutation = useMutation({
    mutationFn: async (input: ModelFormState) => {
      const data = {
        display_name: input.display_name,
        api_format: input.api_format,
        model_name: input.model_name,
        api_endpoint: input.api_endpoint,
        ...(input.api_key ? { api_key: input.api_key } : {}),
        max_context_tokens: input.max_context_tokens,
        max_output_tokens: input.max_output_tokens,
        temperature: input.temperature,
        description: input.description,
        sort_order: input.sort_order,
        is_default: input.is_default,
        is_enabled: input.is_enabled,
      };
      if (input.editing && input.id) await adminAPI.updateLatexAgentModel(input.id, data);
      else await adminAPI.createLatexAgentModel(data);
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已创建');
      setModelForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '保存失败'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.setDefaultLatexAgentModel(id),
    onSuccess: () => {
      toast.success('已设为默认');
      queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent'] });
    },
    onError: () => toast.error('操作失败'),
  });

  const toggleModelMutation = useMutation({
    mutationFn: async (m: ModelRow) =>
      adminAPI.updateLatexAgentModel(m.id, { is_enabled: !m.is_enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent'] }),
    onError: () => toast.error('操作失败'),
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deleteLatexAgentModel(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent'] });
    },
    onError: () => toast.error('删除失败'),
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (input: { provider: string; name: string }) =>
      adminAPI.applyLatexAgentModelPreset(input.provider, input.name),
    onSuccess: () => {
      toast.success('预设已应用');
      setShowPresets(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent'] });
    },
    onError: () => toast.error('应用失败'),
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => adminAPI.testLatexAgentConnection(),
    onSuccess: (r: any) => {
      if (r.data?.code === 0) toast.success('连接正常');
      else toast.error(`连接失败: ${r.data?.message || '未知错误'}`);
    },
    onError: () => toast.error('测试失败'),
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (input: GlobalConfig) => adminAPI.updateLatexAgentConfig(input),
    onSuccess: () => {
      toast.success('全局配置已保存');
      queryClient.invalidateQueries({ queryKey: ['admin', 'latexAgent', 'config'] });
    },
    onError: () => toast.error('保存失败'),
  });

  const [modelForm, setModelForm] = useState<ModelFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelRow | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [globalDraft, setGlobalDraft] = useState<GlobalConfig | null>(null);
  const config = globalDraft ?? configQuery.data ?? {};

  function patchGlobal(patch: Partial<GlobalConfig>) {
    setGlobalDraft({ ...(configQuery.data || {}), ...(globalDraft || {}), ...patch });
  }

  function submitModelForm() {
    if (!modelForm) return;
    if (!modelForm.display_name.trim()) return toast.error('请填写显示名');
    if (!modelForm.model_name.trim()) return toast.error('请填写 model 名');
    if (!modelForm.editing && !modelForm.api_key.trim()) return toast.error('请填写 API Key');
    saveModelMutation.mutate(modelForm);
  }

  return (
    <PageLayout
      title="LaTeX Agent 配置"
      description="管理写作助手使用的模型与全局运行参数"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testConnectionMutation.mutate()}
            disabled={testConnectionMutation.isPending}
            title="测试的是默认模型(★ 标记的)"
          >
            <Zap className="h-4 w-4" />
            测试默认模型连接
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPresets(true)}>
            <Sparkles className="h-4 w-4" />
            应用预设
          </Button>
          <Button size="sm" onClick={() => setModelForm(emptyModelForm())}>
            <Plus className="h-4 w-4" />
            添加模型
          </Button>
        </>
      }
    >
      {/* 模型列表 */}
      <SectionCard title="模型列表" description={`共 ${(modelsQuery.data ?? []).length} 个`} bodyPadded={false}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>显示名 / Model</TableHead>
              <TableHead className="w-24">API 格式</TableHead>
              <TableHead className="w-32">Endpoint</TableHead>
              <TableHead className="w-32 text-right">上下文 / 输出</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`s-${i}`}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : (modelsQuery.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title="暂无模型" description="点击右上角添加,或应用预设快速接入" />
                </TableCell>
              </TableRow>
            ) : (
              (modelsQuery.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {m.display_name}
                      {m.is_default && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    </div>
                    <code className="text-xs text-muted-foreground">{m.model_name}</code>
                  </TableCell>
                  <TableCell><Badge variant="outline">{m.api_format}</Badge></TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground" title={m.api_endpoint}>{m.api_endpoint}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {(m.max_context_tokens || 0).toLocaleString()} / {(m.max_output_tokens || 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {m.is_enabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>操作</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setModelForm({ ...m, api_key: '', description: m.description || '', editing: true })}>
                          <Pencil />
                          编辑
                        </DropdownMenuItem>
                        {!m.is_default && (
                          <DropdownMenuItem onSelect={() => setDefaultMutation.mutate(m.id)}>
                            <Star />
                            设为默认
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => toggleModelMutation.mutate(m)}>
                          <Power />
                          {m.is_enabled ? '停用' : '启用'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(m)}
                        >
                          <Trash2 />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 全局配置 */}
      <SectionCard title="Agent 运行参数" description="影响所有调用的全局设置">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>上下文消息条数</Label>
            <Input
              type="number"
              value={config.context_window_messages ?? 50}
              onChange={(e) => patchGlobal({ context_window_messages: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>最大迭代次数</Label>
            <Input
              type="number"
              value={config.max_iterations ?? 10}
              onChange={(e) => patchGlobal({ max_iterations: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>截断策略</Label>
            <Select
              value={config.truncation_strategy || 'recent'}
              onValueChange={(v) => patchGlobal({ truncation_strategy: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(optionsQuery.data?.truncation_strategies || []).map((s: any) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Top P (0-1)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={config.top_p ?? 1}
              onChange={(e) => patchGlobal({ top_p: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>启用工具类别</Label>
            <div className="flex flex-wrap gap-2">
              {(optionsQuery.data?.tool_categories || []).map((c: any) => {
                const checked = (config.enabled_tool_categories || []).includes(c.value);
                return (
                  <label key={c.value} className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = new Set(config.enabled_tool_categories || []);
                        if (e.target.checked) cur.add(c.value);
                        else cur.delete(c.value);
                        patchGlobal({ enabled_tool_categories: Array.from(cur) });
                      }}
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>System Prompt 追加</Label>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={config.system_prompt_append || ''}
              onChange={(e) => patchGlobal({ system_prompt_append: e.target.value })}
              placeholder="追加在系统提示词末尾的内容(可留空)"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!config.auto_fix_errors}
                onChange={(e) => patchGlobal({ auto_fix_errors: e.target.checked })}
              />
              自动修复 LaTeX 错误
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!config.enable_tool_calling}
                onChange={(e) => patchGlobal({ enable_tool_calling: e.target.checked })}
              />
              启用 Tool Calling
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setGlobalDraft(null);
              configQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            撤销改动
          </Button>
          <Button
            onClick={() => globalDraft && saveConfigMutation.mutate(globalDraft)}
            disabled={!globalDraft || saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending ? '保存中…' : '保存配置'}
          </Button>
        </div>
      </SectionCard>

      {/* 模型表单 */}
      <Dialog open={!!modelForm} onOpenChange={(o) => !o && setModelForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modelForm?.editing ? '编辑模型' : '添加模型'}</DialogTitle>
          </DialogHeader>
          {modelForm && (
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>显示名</Label>
                  <Input value={modelForm.display_name} onChange={(e) => setModelForm({ ...modelForm, display_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>API 格式</Label>
                  <Select value={modelForm.api_format} onValueChange={(v) => setModelForm({ ...modelForm, api_format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(formatsQuery.data ?? []).map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Model 名</Label>
                <Input value={modelForm.model_name} onChange={(e) => setModelForm({ ...modelForm, model_name: e.target.value })} placeholder="gpt-4-turbo" />
              </div>
              <div className="space-y-1.5">
                <Label>API Endpoint</Label>
                <Input value={modelForm.api_endpoint} onChange={(e) => setModelForm({ ...modelForm, api_endpoint: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>API Key {modelForm.editing && <span className="text-xs text-muted-foreground">(编辑时留空表示不修改)</span>}</Label>
                <Input type="password" value={modelForm.api_key} onChange={(e) => setModelForm({ ...modelForm, api_key: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>最大上下文</Label>
                  <Input type="number" value={modelForm.max_context_tokens} onChange={(e) => setModelForm({ ...modelForm, max_context_tokens: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>最大输出</Label>
                  <Input type="number" value={modelForm.max_output_tokens} onChange={(e) => setModelForm({ ...modelForm, max_output_tokens: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>温度</Label>
                  <Input type="number" step="0.1" min="0" max="2" value={modelForm.temperature} onChange={(e) => setModelForm({ ...modelForm, temperature: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>描述</Label>
                <Input value={modelForm.description} onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })} />
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={modelForm.is_enabled} onChange={(e) => setModelForm({ ...modelForm, is_enabled: e.target.checked })} />
                  启用
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={modelForm.is_default} onChange={(e) => setModelForm({ ...modelForm, is_default: e.target.checked })} />
                  设为默认
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelForm(null)}>取消</Button>
            <Button onClick={submitModelForm} disabled={saveModelMutation.isPending}>{saveModelMutation.isPending ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预设 */}
      <Dialog open={showPresets} onOpenChange={setShowPresets}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择预设模型</DialogTitle>
            <DialogDescription>应用后会创建一条新的模型记录,你需要补上 API Key</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55vh] gap-2 overflow-y-auto">
            {(presetsQuery.data ?? []).map((p: any) => (
              <button
                key={`${p.provider}-${p.name}`}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/40"
                onClick={() => applyPresetMutation.mutate({ provider: p.provider, name: p.name })}
                disabled={applyPresetMutation.isPending}
              >
                <div>
                  <div className="font-medium">{p.display_name || p.name}</div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  )}
                </div>
                <Badge variant="outline">{p.provider}</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该模型?"
        description={`将删除 "${deleteTarget?.display_name}"。如果是当前默认模型,需要先设别的模型为默认。`}
        destructive
        loading={deleteModelMutation.isPending}
        onConfirm={() => deleteTarget && deleteModelMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}

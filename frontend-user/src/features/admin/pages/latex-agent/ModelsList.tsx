import { useState } from 'react';
import { Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { DataTable, type Column } from '../../components/DataTable';
import { useApiToast } from '../../hooks/useApiToast';
import { useConfirm } from '../../hooks/useConfirm';
import {
  useAgentModels,
  useApplyModelPreset,
  useCreateAgentModel,
  useDeleteAgentModel,
  useModelPresets,
  useSetDefaultModel,
  useUpdateAgentModel,
  type AgentModel,
} from '../../api/latex-agent';
import { ModelDialog, type ModelEditMode } from './ModelDialog';

/**
 * agent_models 表 CRUD 列表 + 右侧"模型预设"快速创建栏。
 *
 * 删除默认模型走 typeToConfirm = 'DELETE' 二次确认,避免误删导致 Agent 瘫痪。
 */
export function ModelsList() {
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

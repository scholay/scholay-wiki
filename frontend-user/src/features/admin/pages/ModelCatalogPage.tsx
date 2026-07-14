import { useState } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useConfirm } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ModelFormDialog } from '../components/ModelFormDialog';
import { ProviderSection } from '../components/ProviderSection';
import { DefaultEndpointDialog, ExtraProviderDialog } from '../components/ProviderDialogs';
import { useApiToast } from '../hooks/useApiToast';
import { useAgentConfig } from '../api/agent-config';
import {
  PURPOSE_LABELS,
  useAdminModels,
  useAdminProviders,
  useCreateModel,
  useDeleteModel,
  useDeleteProvider,
  useModelBindings,
  useSetModelBinding,
  useUpdateModel,
  type AgentModel,
  type AgentModelPayload,
  type AgentProviderDTO,
} from '../api/model-catalog';

/**
 * ModelCatalogPage — 上游端点与模型的**分组视图**(运营视角单一入口)。
 * 结构反映真实数据关系:模型隶属于端点(agent_models.provider_id),每个端点区块列自己的
 * 模型、从区块内添加模型(自动归属);默认端点(agent_config)恒为第一个区块,不可删。
 * 页尾:能力绑定(11 个固定能力 → 目录模型,跨端点选择)。
 */
export function ModelCatalogPage() {
  const { data: models, isLoading } = useAdminModels();
  const { data: providers } = useAdminProviders();
  const { data: defEndpoint } = useAgentConfig({ showSensitive: false });
  const create = useCreateModel();
  const update = useUpdateModel();
  const removeModel = useDeleteModel();
  const removeProvider = useDeleteProvider();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  // 模型弹窗(新建时带「归属端点」预选);端点弹窗(默认/额外两枚)。
  const [editing, setEditing] = useState<AgentModel | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [presetProviderId, setPresetProviderId] = useState(0);
  const [defOpen, setDefOpen] = useState(false);
  const [provEditing, setProvEditing] = useState<AgentProviderDTO | null>(null);
  const [provOpen, setProvOpen] = useState(false);

  const handleSaveModel = async (payload: AgentModelPayload) => {
    const ok = await apiToast(
      editing ? update.mutateAsync({ id: editing.id, data: payload }) : create.mutateAsync(payload),
      { success: '已保存', failure: '保存失败' }
    );
    if (ok !== null) {
      setFormOpen(false);
      setEditing(null);
    }
  };

  const handleDeleteModel = async (row: AgentModel) => {
    const ok = await confirm({
      title: `删除模型「${row.display_name || row.model_id}」?`,
      description: '仍被能力绑定引用的模型会被拒绝删除;删除不影响历史用量账单。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(removeModel.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const handleDeleteProvider = async (p: AgentProviderDTO) => {
    const ok = await confirm({
      title: `删除端点「${p.name}」?`,
      description: '端点下仍有模型时会被拒绝删除,请先改挂或删除模型。',
      danger: true,
      confirmText: '删除',
    });
    if (ok) await apiToast(removeProvider.mutateAsync(p.id), { success: '已删除', failure: '删除失败' });
  };

  const openAddModel = (providerId: number) => {
    setEditing(null);
    setPresetProviderId(providerId);
    setFormOpen(true);
  };

  const modelsOf = (providerId: number) => (models ?? []).filter((m) => m.provider_id === providerId);

  return (
    <AdminPageLayout
      title="模型目录"
      description="端点(Provider)与模型是隶属关系:每个端点下只列它真实提供的模型;添加模型从端点区块进入。改绑/换端点后自动推送 agent"
      actions={
        <Button
          onClick={() => {
            setProvEditing(null);
            setProvOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          新增端点
        </Button>
      }
    >
      <div className="space-y-6">
        {/* 默认端点区块(agent_config,不可删) */}
        <ProviderSection
          header={{
            title: '默认端点',
            apiFormat: 'anthropic',
            baseUrl: defEndpoint?.base_url ?? '',
            enabled: defEndpoint?.enabled ?? true,
            isDefault: true,
            pushFailed: defEndpoint?.push_status === 'failed',
            pushError: defEndpoint?.push_error,
          }}
          models={modelsOf(0)}
          loading={isLoading}
          onAddModel={() => openAddModel(0)}
          onEditModel={(m) => {
            setEditing(m);
            setFormOpen(true);
          }}
          onDeleteModel={handleDeleteModel}
          onEditProvider={() => setDefOpen(true)}
        />

        {/* 额外端点区块(agent_providers) */}
        {(providers ?? []).map((p) => (
          <ProviderSection
            key={p.id}
            header={{
              title: p.name,
              apiFormat: p.api_format,
              baseUrl: p.base_url,
              enabled: p.enabled,
              isDefault: false,
              pushFailed: p.push_status === 'failed',
              pushError: p.push_error,
            }}
            models={modelsOf(p.id)}
            loading={isLoading}
            onAddModel={() => openAddModel(p.id)}
            onEditModel={(m) => {
              setEditing(m);
              setFormOpen(true);
            }}
            onDeleteModel={handleDeleteModel}
            onEditProvider={() => {
              setProvEditing(p);
              setProvOpen(true);
            }}
            onDeleteProvider={() => handleDeleteProvider(p)}
          />
        ))}

        <BindingsCard models={models ?? []} />
      </div>

      <ModelFormDialog
        open={formOpen}
        model={editing}
        presetProviderId={presetProviderId}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveModel}
        saving={create.isPending || update.isPending}
      />
      <DefaultEndpointDialog open={defOpen} current={defEndpoint} onClose={() => setDefOpen(false)} />
      <ExtraProviderDialog open={provOpen} editing={provEditing} onClose={() => setProvOpen(false)} />
    </AdminPageLayout>
  );
}

/** BindingsCard — 11 个固定能力各绑一个目录模型;回退态(绑定缺失/失效)标红。 */
function BindingsCard({ models }: { models: AgentModel[] }) {
  const { data: bindings, isLoading } = useModelBindings();
  const setBinding = useSetModelBinding();
  const apiToast = useApiToast();

  const nameOf = (modelId: string) =>
    models.find((m) => m.model_id === modelId)?.display_name || modelId || '—';

  return (
    <section className="rounded-md border border-border bg-background">
      <div className="p-4 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">能力绑定</h2>
        <p className="text-xs text-muted-foreground mt-1">
          固定能力(不随用户选择)各自绑定一个目录模型;审稿预填识别、标题生成等小任务建议绑便宜快的模型。
          <span className="text-brand-red">红色标记 = 绑定缺失或指向已删除的模型,正在走回退链</span>,请尽快改绑。
        </p>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-xs text-muted-foreground">加载中…</div>
      ) : (
        <ul className="divide-y divide-border-soft">
          {(bindings ?? []).map((b) => {
            const meta = PURPOSE_LABELS[b.purpose] ?? { label: b.purpose, hint: '' };
            return (
              <li key={b.purpose} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{meta.label}</span>
                    {b.fallback && (
                      <span className="inline-flex items-center gap-1 text-2xs text-brand-red">
                        <TriangleAlert className="size-3" />
                        回退中 → {nameOf(b.effective)}
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-faint truncate">{meta.hint}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 max-w-56">
                      <span className="truncate font-mono text-xs">{nameOf(b.model_id)}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                    {models.map((m) => (
                      <DropdownMenuItem
                        key={m.model_id}
                        onSelect={() =>
                          apiToast(
                            setBinding.mutateAsync({ purpose: b.purpose, modelId: m.model_id }),
                            { success: '已改绑 — 配置将自动推送', failure: '改绑失败' }
                          )
                        }
                      >
                        <div className="flex flex-col">
                          <span className="text-sm">{m.display_name || m.model_id}</span>
                          <span className="text-2xs text-faint font-mono">
                            {m.model_id}
                            {!m.enabled && ' · 已停用'}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

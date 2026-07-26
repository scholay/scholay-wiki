import { useState } from 'react';
import { Plus, TriangleAlert, ChevronDown } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useConfirm } from '@/shared/components';
import { cn } from '@/shared/lib/utils';
import { ModelFormDialog } from '../components/ModelFormDialog';
import { ProviderSection } from '../components/ProviderSection';
import { DefaultEndpointDialog, ExtraProviderDialog } from '../components/ProviderDialogs';
import { useApiToast } from '../hooks/useApiToast';
import { useAgentConfig } from '../api/agent-config';
import {
  PURPOSE_LABELS,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL_ORDER,
  EXTRA_VENDOR_PANELS,
  presetPayload,
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
/**
 * 模型目录面板 —— 作为「模型与账号」页(AiUpstreamPage)的一个 tab 渲染。
 * 端点(Provider)+ 模型目录 + 11 个能力绑定,改动自动推送 agent。
 * 不含 AdminPageLayout 外壳(由父页统一提供),actions 内联成顶部工具条。
 */
export function ModelCatalogPanel() {
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

  const [showAdvanced, setShowAdvanced] = useState(false);

  // 额外厂商(千问/Kimi/智谱…)按 base_url 认出各自 provider(数据驱动,见 EXTRA_VENDOR_PANELS)。
  const providerFor = (baseUrlMatch: string) =>
    (providers ?? []).find((p) => p.base_url.includes(baseUrlMatch));
  const claimedProviderIds = new Set(
    EXTRA_VENDOR_PANELS.map((v) => providerFor(v.baseUrlMatch)?.id).filter((id): id is number => id != null),
  );

  // 一键把某厂商的官方模型参数补全为官方默认值(缺失则新建,存在则更新)。providerId:DeepSeek=0,其余=其 provider id。
  const applyPreset = async (order: readonly string[], providerId: number, vendorLabel: string) => {
    const ok = await confirm({
      title: `应用${vendorLabel}官方预设?`,
      description:
        '把这些模型的上下文、最大输出、四类单价(输入/输出/缓存读写)写入官方值;缺失则新建,存在则更新。用户可选 / 启用 / 门槛等开关保留不变。成本制:额度按真实单价扣,无需配倍率。',
      confirmText: '应用预设',
    });
    if (!ok) return;
    for (const modelId of order) {
      const existing = (models ?? []).find((m) => m.model_id === modelId) ?? null;
      const payload = presetPayload(modelId, existing, providerId);
      const done = await apiToast(
        existing
          ? update.mutateAsync({ id: existing.id, data: payload })
          : create.mutateAsync(payload),
        { success: `已应用官方预设 · ${modelId}`, failure: `应用失败 · ${modelId}` }
      );
      if (done === null) break; // 出错即止,避免只补了一半
    }
  };

  const endpointMatchesOfficial = (defEndpoint?.base_url ?? '') === DEEPSEEK_ENDPOINT.baseUrl;

  return (
    <div className="space-y-6">
      <p className="text-12 text-muted-foreground">
        平台上游:<span className="font-mono">DeepSeek 官方</span>(默认端点)+ 千问 / Kimi / 智谱(额外端点)。
        各厂商模型的参数、四类单价可编辑;「应用官方预设」按官方文档一键补全。成本制计费:额度按真实单价扣,无需配倍率。改动后自动推送 agent。
      </p>

      {/* ── DeepSeek 官方(默认端点,agent_config;不可删)────────────────── */}
      <ProviderSection
        header={{
          title: 'DeepSeek 官方',
          apiFormat: DEEPSEEK_ENDPOINT.apiFormat,
          baseUrl: defEndpoint?.base_url ?? DEEPSEEK_ENDPOINT.baseUrl,
          enabled: defEndpoint?.enabled ?? true,
          isDefault: true,
          pushFailed: defEndpoint?.push_status === 'failed',
          pushError: defEndpoint?.push_error,
        }}
        models={modelsOf(0)}
        loading={isLoading}
        onApplyPreset={() => applyPreset(DEEPSEEK_MODEL_ORDER, 0, 'DeepSeek ')}
        onAddModel={() => openAddModel(0)}
        onEditModel={(m) => {
          setEditing(m);
          setFormOpen(true);
        }}
        onDeleteModel={handleDeleteModel}
        onEditProvider={() => setDefOpen(true)}
      />
      {!endpointMatchesOfficial && defEndpoint?.base_url && (
        <p className="-mt-3 text-12 text-brand-amber">
          当前默认端点 Base URL 不是官方地址(应为 <span className="font-mono">{DEEPSEEK_ENDPOINT.baseUrl}</span>);点右上「编辑端点」核对。
        </p>
      )}

      {/* ── 额外厂商(千问 / Kimi / 智谱…)数据驱动,见 EXTRA_VENDOR_PANELS ────────── */}
      {EXTRA_VENDOR_PANELS.map((v) => {
        const prov = providerFor(v.baseUrlMatch);
        return prov ? (
          <ProviderSection
            key={v.key}
            header={{
              title: v.label,
              apiFormat: prov.api_format,
              baseUrl: prov.base_url,
              enabled: prov.enabled,
              isDefault: false,
              pushFailed: prov.push_status === 'failed',
              pushError: prov.push_error,
            }}
            models={modelsOf(prov.id)}
            loading={isLoading}
            onApplyPreset={() => applyPreset(v.models, prov.id, v.label + ' ')}
            onAddModel={() => openAddModel(prov.id)}
            onEditModel={(m) => {
              setEditing(m);
              setFormOpen(true);
            }}
            onDeleteModel={handleDeleteModel}
            onEditProvider={() => {
              setProvEditing(prov);
              setProvOpen(true);
            }}
          />
        ) : (
          <div
            key={v.key}
            className="rounded-16 border border-dashed border-border bg-surface-1 p-4 text-12 text-muted-foreground"
          >
            未检测到{v.label}端点。到下方「高级」新增端点:Base URL{' '}
            <span className="font-mono">{v.endpoint.baseUrl}</span>、格式{' '}
            <span className="font-mono">{v.endpoint.apiFormat}</span>、填该厂商 API Key
            {v.requiresReasoningReplay && <span className="text-brand-amber">(务必开启 reasoning_replay)</span>},即可在此出现{v.label}面板。
          </div>
        );
      })}

      <BindingsCard models={models ?? []} />

      {/* ── 高级 · 自定义上游端点与模型(暂时收起,一般不需要)──────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center gap-1.5 text-12 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', showAdvanced ? '' : '-rotate-90')} />
          高级 · 自定义上游端点与模型
          <span className="text-faint">(接入 DeepSeek 以外的厂商时才用)</span>
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-6">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setProvEditing(null);
                  setProvOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                新增端点
              </Button>
            </div>
            {(providers ?? [])
              .filter((p) => !claimedProviderIds.has(p.id)) // 千问/Kimi/智谱已在上方独立区块展示
              .map((p) => (
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
            {(providers ?? []).filter((p) => !claimedProviderIds.has(p.id)).length === 0 && (
              <p className="text-12 text-faint">暂无其它额外端点。千问 / Kimi / 智谱 以外的厂商在此新增。</p>
            )}
          </div>
        )}
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
    </div>
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
    <section className="rounded-16 border border-border bg-surface-card">
      <div className="p-4 border-b border-border-soft">
        <h2 className="text-16 font-medium text-foreground">能力绑定</h2>
        <p className="text-12 text-muted-foreground mt-1">
          固定能力(不随用户选择)各自绑定一个目录模型;审稿预填识别、标题生成等小任务建议绑便宜快的模型。
          <span className="text-brand-red">红色标记 = 绑定缺失或指向已删除的模型,正在走回退链</span>,请尽快改绑。
        </p>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-12 text-muted-foreground">加载中…</div>
      ) : (
        <ul className="divide-y divide-border-soft">
          {(bindings ?? []).map((b) => {
            const meta = PURPOSE_LABELS[b.purpose] ?? { label: b.purpose, hint: '' };
            return (
              <li key={b.purpose} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-12 font-medium text-foreground">{meta.label}</span>
                    {b.fallback && (
                      <span className="inline-flex items-center gap-1 text-12 text-brand-red">
                        <TriangleAlert className="size-3" />
                        回退中 → {nameOf(b.effective)}
                      </span>
                    )}
                  </div>
                  <p className="text-12 text-faint truncate">{meta.hint}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 max-w-56">
                      <span className="truncate font-mono text-12">{nameOf(b.model_id)}</span>
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
                          <span className="text-12">{m.display_name || m.model_id}</span>
                          <span className="text-12 text-faint font-mono">
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

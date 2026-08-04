import { useEffect, useRef, useState } from 'react';
import { Plus, TriangleAlert, ChevronDown, Loader2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useConfirm, ResourceError } from '@/shared/components';
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

/** 额外厂商名单从注册表推导 —— 写死的「千问 / Kimi / 智谱」在加了豆包 / MiniMax 后就成了错的。 */
const EXTRA_VENDOR_NAMES = EXTRA_VENDOR_PANELS.map((v) => v.label).join(' / ');

/**
 * ModelCatalogPage — 上游端点与模型的**分组视图**(运营视角单一入口)。
 * 结构反映真实数据关系:模型隶属于端点(agent_models.provider_id),每个端点区块列自己的
 * 模型、从区块内添加模型(自动归属);默认端点(agent_config)恒为第一个区块,不可删。
 * 页尾:能力绑定(10 个固定能力 → 目录模型,跨端点选择)。
 */
/**
 * 模型目录面板 —— 作为「模型与账号」页(AiUpstreamPage)的一个 tab 渲染。
 * 端点(Provider)+ 模型目录 + 10 个能力绑定,改动自动推送 agent。
 * 不含 AdminPageLayout 外壳(由父页统一提供),actions 内联成顶部工具条。
 */
export function ModelCatalogPanel() {
  const modelsQ = useAdminModels();
  const { data: models, isLoading, error: modelsError } = modelsQ;
  const provQ = useAdminProviders();
  const { data: providers, isLoading: provLoading, isError: provError } = provQ;
  const defQ = useAgentConfig({ showSensitive: false });
  const { data: defEndpoint, isError: defError } = defQ;
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
  // 「应用官方预设」是串行 for 循环发 2~3 个请求,期间必须锁住按钮 ——
  // 手一抖点两下会让两轮 upsert 交叉执行,且无进度只能数 toast。
  const [presetBusyKey, setPresetBusyKey] = useState<string | null>(null);

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

  const openEditModel = (m: AgentModel) => {
    setEditing(m);
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

  const extraProviders = (providers ?? []).filter((p) => !claimedProviderIds.has(p.id));
  // 「高级」里藏着的异常(端点停用 / 推送失败)—— 折叠时完全看不见,所以要在折叠按钮上标出来。
  const advIssueCount = extraProviders.filter((p) => !p.enabled || p.push_status === 'failed').length;
  const autoOpenedAdvanced = useRef(false);
  useEffect(() => {
    if (!autoOpenedAdvanced.current && advIssueCount > 0) {
      autoOpenedAdvanced.current = true;
      setShowAdvanced(true);
    }
  }, [advIssueCount]);

  // 落单模型 —— provider_id 不在「0 ∪ 当前 providers」里(指向已删端点的历史脏数据)。
  // 只在 providers 已确定时才判定:加载中 / 失败时所有非 0 归属都会被误判成落单。
  const providersKnown = !provLoading && !provError && providers != null;
  const knownProviderIds = new Set<number>([0, ...(providers ?? []).map((p) => p.id)]);
  const orphanModels = providersKnown
    ? (models ?? []).filter((m) => !knownProviderIds.has(m.provider_id))
    : [];

  // 一键把某厂商的官方模型参数补全为官方默认值(缺失则新建,存在则更新)。providerId:DeepSeek=0,其余=其 provider id。
  const applyPreset = async (
    busyKey: string,
    order: readonly string[],
    providerId: number,
    vendorLabel: string,
  ) => {
    if (presetBusyKey) return;
    const ok = await confirm({
      title: `应用${vendorLabel}官方预设?`,
      description:
        '把这些模型的上下文、最大输出、四类单价(输入/输出/缓存读写)写入官方值;缺失则新建,存在则更新。用户可选 / 启用 / 门槛等开关保留不变。成本制:额度按真实单价扣,无需配倍率。',
      confirmText: '应用预设',
    });
    if (!ok) return;
    setPresetBusyKey(busyKey);
    try {
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
    } finally {
      setPresetBusyKey(null);
    }
  };

  const endpointMatchesOfficial = (defEndpoint?.base_url ?? '') === DEEPSEEK_ENDPOINT.baseUrl;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-12 text-muted-foreground">
          平台上游:<span className="font-mono">DeepSeek 官方</span>(默认端点)+ {EXTRA_VENDOR_NAMES}(额外端点)。
          各厂商模型的参数、四类单价可编辑;「应用官方预设」按官方文档一键补全。成本制计费:额度按真实单价扣,无需配倍率。改动后自动推送 agent。
        </p>
        {/* 总数统计 —— 没有它,落单/脏数据模型在整页上一个字都不出现却仍在产生账单 */}
        <span className="shrink-0 text-12 text-faint tabular-nums">
          共 {models?.length ?? 0} 个模型 · {providers?.length ?? 0} 个额外端点
        </span>
      </div>

      {defError && (
        <p className="flex items-start gap-1.5 rounded-12 border border-brand-red bg-danger-soft p-3 text-12 text-brand-red">
          <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
          默认端点配置读取失败,下方「DeepSeek 官方」区块的 Base URL / 启用状态不可信(不是真实配置)。请刷新重试后再改。
        </p>
      )}

      {/* ── DeepSeek 官方(默认端点,agent_config;不可删)──────────────────
          🔴 baseUrl / enabled **不能**兜底成官方值 / true:加载中或失败时会渲染成
          「官方 baseUrl · 已启用」的假状态,而真实配置可能是停用的或指向中转地址;
          更糟的是下面那条「Base URL 不是官方地址」告警会因为兜底成官方值而永不触发。 */}
      <ProviderSection
        header={{
          title: 'DeepSeek 官方',
          apiFormat: DEEPSEEK_ENDPOINT.apiFormat,
          baseUrl: defEndpoint?.base_url ?? '',
          enabled: defEndpoint?.enabled ?? false,
          isDefault: true,
          pushStatus: defEndpoint?.push_status,
          pushError: defEndpoint?.push_error,
        }}
        models={modelsOf(0)}
        loading={isLoading}
        error={modelsError}
        onRetry={() => modelsQ.refetch()}
        onApplyPreset={() => applyPreset('deepseek', DEEPSEEK_MODEL_ORDER, 0, 'DeepSeek ')}
        presetBusy={presetBusyKey === 'deepseek'}
        onAddModel={() => openAddModel(0)}
        onEditModel={openEditModel}
        onDeleteModel={handleDeleteModel}
        onEditProvider={() => setDefOpen(true)}
      />
      {!defError && !endpointMatchesOfficial && defEndpoint?.base_url && (
        <p className="-mt-3 text-12 text-brand-amber">
          当前默认端点 Base URL 不是官方地址(应为 <span className="font-mono">{DEEPSEEK_ENDPOINT.baseUrl}</span>);点右上「编辑端点」核对。
        </p>
      )}

      {/* ── 额外厂商(千问 / Kimi / 智谱…)数据驱动,见 EXTRA_VENDOR_PANELS ──────────
          🔴 「未检测到 X 端点」只在 providers **确实拿到了** 才允许出现。加载中 / 接口失败时
          providers 是 undefined,五个厂商会同时报「未检测到」—— 那是假告警,管理员按引导去
          「新增端点」就会造出重复 provider。 */}
      {EXTRA_VENDOR_PANELS.map((v) => {
        const prov = providerFor(v.baseUrlMatch);
        if (prov) {
          return (
            <ProviderSection
              key={v.key}
              header={{
                title: v.label,
                apiFormat: prov.api_format,
                baseUrl: prov.base_url,
                enabled: prov.enabled,
                isDefault: false,
                pushStatus: prov.push_status,
                pushError: prov.push_error,
              }}
              models={modelsOf(prov.id)}
              loading={isLoading}
              error={modelsError}
              onRetry={() => modelsQ.refetch()}
              onApplyPreset={() => applyPreset(v.key, v.models, prov.id, v.label + ' ')}
              presetBusy={presetBusyKey === v.key}
              onAddModel={() => openAddModel(prov.id)}
              onEditModel={openEditModel}
              onDeleteModel={handleDeleteModel}
              onEditProvider={() => {
                setProvEditing(prov);
                setProvOpen(true);
              }}
            />
          );
        }
        if (provLoading) {
          return (
            <div
              key={v.key}
              className="flex items-center gap-1.5 rounded-16 border border-border bg-surface-1 p-4 text-12 text-muted-foreground"
            >
              <Loader2 className="size-3.5 animate-spin" />
              正在读取端点列表 —— {v.label}是否已接入尚未确定。
            </div>
          );
        }
        if (provError) {
          return (
            <div
              key={v.key}
              className="flex items-start gap-1.5 rounded-16 border border-brand-red bg-danger-soft p-4 text-12 text-brand-red"
            >
              <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
              <span>
                端点列表读取失败,无法判断{v.label}是否已接入。
                <span className="font-medium">请先刷新重试,不要据此新增端点</span> —— 端点可能已经存在,重复新增会造出两份配置。
              </span>
            </div>
          );
        }
        return (
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

      {/* ── 未归属端点(数据异常兜底)──────────────────────────────────────────
          provider_id 既不是 0 也不在现存 providers 里的模型:指向已删端点的历史脏数据。
          没有这个区块它们在整页上一个字都不出现,却仍可能被能力绑定引用、仍在产生账单。 */}
      {orphanModels.length > 0 && (
        <ProviderSection
          header={{
            title: '未归属端点(数据异常)',
            apiFormat: '未知',
            baseUrl: '',
            enabled: true,
            isDefault: false,
          }}
          headerNote={
            <span className="text-brand-amber">
              这 {orphanModels.length} 个模型的 provider_id 指向不存在的端点(端点被删但模型没改挂)。
              它们仍可能被能力绑定引用、仍在产生账单 —— 请逐个编辑改挂到正确端点,或删除。
            </span>
          }
          models={orphanModels}
          onEditModel={openEditModel}
          onDeleteModel={handleDeleteModel}
        />
      )}

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
          <span className="text-faint">({extraProviders.length} 个自定义端点)</span>
          {advIssueCount > 0 && (
            <Badge variant="outline" className="text-brand-red border-brand-red">
              {advIssueCount} 个停用 / 推送失败
            </Badge>
          )}
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
            {extraProviders.map((p) => (
              <ProviderSection
                key={p.id}
                header={{
                  title: p.name,
                  apiFormat: p.api_format,
                  baseUrl: p.base_url,
                  enabled: p.enabled,
                  isDefault: false,
                  pushStatus: p.push_status,
                  pushError: p.push_error,
                }}
                models={modelsOf(p.id)}
                loading={isLoading}
                error={modelsError}
                onRetry={() => modelsQ.refetch()}
                onAddModel={() => openAddModel(p.id)}
                onEditModel={openEditModel}
                onDeleteModel={handleDeleteModel}
                onEditProvider={() => {
                  setProvEditing(p);
                  setProvOpen(true);
                }}
                onDeleteProvider={() => handleDeleteProvider(p)}
              />
            ))}
            {provLoading && <p className="text-12 text-faint">正在读取端点列表…</p>}
            {provError && (
              <p className="flex items-start gap-1.5 text-12 text-brand-red">
                <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                端点列表读取失败 —— 这里显示的「暂无端点」不可信,请刷新重试。
              </p>
            )}
            {!provLoading && !provError && extraProviders.length === 0 && (
              <p className="text-12 text-faint">暂无其它额外端点。{EXTRA_VENDOR_NAMES} 以外的厂商在此新增。</p>
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

/** BindingsCard — 10 个固定能力(PURPOSE_LABELS:2 系统槽 + 8 功能槽)各绑一个目录模型;回退态(绑定缺失/失效)标红。 */
function BindingsCard({ models }: { models: AgentModel[] }) {
  const bindingsQ = useModelBindings();
  const { data: bindings, isLoading, isError, error } = bindingsQ;
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
      {/* 🔴 error 必须先于 loading 判 —— 否则接口挂了只会渲染出一个空 ul,
          看起来正好像「10 个能力槽一个都没绑」,而那恰是最需要立刻处理的告警长相。 */}
      {isError ? (
        <ResourceError
          error={error}
          resourceName="能力绑定"
          onRetry={() => bindingsQ.refetch()}
          autoRedirect={false}
          className="h-auto bg-surface-card"
        />
      ) : isLoading ? (
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
          {(bindings ?? []).length === 0 && (
            <li className="px-4 py-6 text-center text-12 text-faint">后端未返回任何能力槽位。</li>
          )}
        </ul>
      )}
    </section>
  );
}

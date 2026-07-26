import { Pencil, Plus, Trash2, Sparkles } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable, type Column } from './DataTable';
import type { AgentModel } from '../api/model-catalog';

const SPEED_LABEL: Record<string, string> = { fast: '快', balanced: '均衡', powerful: '强推理' };

export interface ProviderSectionHeader {
  title: string;
  apiFormat: string;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  pushFailed?: boolean;
  pushError?: string;
}

/**
 * ProviderSection — 「端点 → 它的模型」分组区块(模型目录页的主体结构)。
 * 上游 provider 与模型是隶属关系:模型只存在于所属端点之下,添加模型从端点区块进入
 * (自动归属该端点)。默认端点区块不可删;额外端点删除前须先清空/改挂模型(后端拒)。
 */
export function ProviderSection({
  header,
  models,
  loading,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onEditProvider,
  onDeleteProvider,
  onApplyPreset,
}: {
  header: ProviderSectionHeader;
  models: AgentModel[];
  loading?: boolean;
  onAddModel: () => void;
  onEditModel: (m: AgentModel) => void;
  onDeleteModel: (m: AgentModel) => void;
  onEditProvider: () => void;
  onDeleteProvider?: () => void; // 默认端点不传 = 不渲染删除
  onApplyPreset?: () => void; // 传入 = 渲染「应用官方预设」(DeepSeek 官方端点用,一键补全 flash/pro 参数)
}) {
  const columns: Column<AgentModel>[] = [
    {
      header: '模型',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-foreground">{r.display_name || r.model_id}</span>
            {r.flagship && (
              <Badge variant="outline" className="gap-0.5 border-brand-amber text-brand-amber">
                <Sparkles className="size-2.5" />旗舰
              </Badge>
            )}
          </span>
          <span className="text-2xs text-faint font-mono">{r.model_id}</span>
        </div>
      ),
    },
    {
      header: '上下文',
      width: 90,
      align: 'right',
      cell: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {r.context_window >= 1000 ? `${Math.round(r.context_window / 1000)}k` : r.context_window}
        </span>
      ),
    },
    {
      header: '价格 入/出(元/1M)',
      width: 150,
      align: 'right',
      cell: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {r.price_in} / {r.price_out}
          {r.input_tier_threshold > 0 && (
            <span
              className="ml-1 text-2xs text-brand-amber"
              title={`输入 >${Math.round(r.input_tier_threshold / 1000)}k 切高档价:${r.price_in_hi}/${r.price_out_hi}(成本自然翻档)`}
            >
              分档
            </span>
          )}
        </span>
      ),
    },
    {
      header: '速度',
      width: 80,
      cell: (r) => <Badge variant="outline">{SPEED_LABEL[r.speed_class] ?? r.speed_class}</Badge>,
    },
    {
      header: '用户可选',
      width: 110,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.user_selectable ? (
            <Badge variant="outline" className="text-brand-green border-brand-green">可选</Badge>
          ) : (
            <Badge variant="outline">隐藏</Badge>
          )}
          {r.min_tier && <Badge variant="outline" className="uppercase">{r.min_tier}+</Badge>}
        </div>
      ),
    },
    {
      header: '状态',
      width: 70,
      cell: (r) =>
        r.enabled ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">启用</Badge>
        ) : (
          <Badge variant="outline" className="text-brand-red border-brand-red">停用</Badge>
        ),
    },
    {
      header: '',
      width: 90,
      align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" title="编辑" onClick={() => onEditModel(r)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-brand-red"
            title="删除"
            onClick={() => onDeleteModel(r)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="rounded-md border border-border bg-surface-card">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border-soft">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-base font-bold text-foreground">{header.title}</h2>
            {header.isDefault && (
              <Badge variant="outline" className="text-brand-green border-brand-green">默认端点</Badge>
            )}
            <Badge variant="outline" className="font-mono text-2xs">{header.apiFormat}</Badge>
            {!header.enabled && <Badge variant="outline">停用</Badge>}
            {header.pushFailed && (
              <Badge variant="outline" className="text-brand-red border-brand-red" title={header.pushError}>
                推送失败
              </Badge>
            )}
          </div>
          <p className="text-2xs text-faint truncate font-mono mt-0.5">{header.baseUrl || '未配置'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onApplyPreset && (
            <Button variant="outline" size="sm" onClick={onApplyPreset} title="用 DeepSeek 官方文档参数补全 flash / pro(上下文/输出/四类单价)">
              <Sparkles className="size-3.5" />
              应用官方预设
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onAddModel}>
            <Plus className="size-3.5" />
            添加模型
          </Button>
          <Button variant="ghost" size="icon" className="size-8" title="编辑端点" onClick={onEditProvider}>
            <Pencil className="size-3.5" />
          </Button>
          {onDeleteProvider && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-brand-red"
              title="删除端点(须先清空模型)"
              onClick={onDeleteProvider}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {models.length === 0 && !loading ? (
        <div className="p-5 text-center text-xs text-faint">该端点下暂无模型 — 点右上「添加模型」接入</div>
      ) : (
        <DataTable columns={columns} rows={models} loading={loading} />
      )}
    </section>
  );
}

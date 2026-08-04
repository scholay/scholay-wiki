import { type ReactNode } from 'react';
import { Pencil, Plus, Trash2, Sparkles } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable, type Column } from './DataTable';
import { CopyableId } from './CopyableId';
import type { AgentModel } from '../api/model-catalog';

const SPEED_LABEL: Record<string, string> = { fast: '快', balanced: '均衡', powerful: '强推理' };

/**
 * token 数的人类可读写法。改造前只有一档 k 换算,`1_000_000` 渲染成「1000k」,
 * 与旁边 `262144`→「262k」并排极易被读成 100k。≥1M 走 M 档,并把精确值挂 title。
 */
function fmtTokens(n: number): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(2))}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * 未计价 = 输入与输出单价都为 0。成本制按四类单价算 cost,单价 0 → cost 恒为 0 →
 * 该模型对所有用户等于免费。改造前这里直出 `0 / 0`,与真实低价模型(0.2 / 0.8)
 * 同为一档灰色小字,肉眼分不出 —— 是账目不闭合的已知来源之一。
 */
const isUnpriced = (m: AgentModel) => !(m.price_in > 0) && !(m.price_out > 0);

/** 分档计价的完整价格表(改造前 title 只拼了档 2,三档模型 hover 看到的是残缺信息)。 */
function tierTitle(r: AgentModel): string {
  const lines = [`分档计价(按 prompt = 输入 + 缓存读 的长度切档,只影响价格)`];
  const t1 = r.input_tier_threshold;
  const t2 = r.input_tier_threshold_2;
  lines.push(`档1 ≤${fmtTokens(t1)}:输入 ${r.price_in} / 输出 ${r.price_out}`);
  const hiIn = r.price_in_hi || r.price_in;
  const hiOut = r.price_out_hi || r.price_out;
  lines.push(
    t2 > 0
      ? `档2 ${fmtTokens(t1)}–${fmtTokens(t2)}:输入 ${hiIn} / 输出 ${hiOut}`
      : `档2 >${fmtTokens(t1)}:输入 ${hiIn} / 输出 ${hiOut}`,
  );
  if (t2 > 0) {
    lines.push(`档3 >${fmtTokens(t2)}:输入 ${r.price_in_hi2 || hiIn} / 输出 ${r.price_out_hi2 || hiOut}`);
  }
  return lines.join('\n');
}

export interface ProviderSectionHeader {
  title: string;
  apiFormat: string;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  /** 后端 push_status:pending / success / failed(空 = 从未推送过) */
  pushStatus?: string;
  pushError?: string;
}

/**
 * ProviderSection — 「端点 → 它的模型」分组区块(模型目录页的主体结构)。
 * 上游 provider 与模型是隶属关系:模型只存在于所属端点之下,添加模型从端点区块进入
 * (自动归属该端点)。默认端点区块不可删;额外端点删除前须先清空/改挂模型(后端拒)。
 */
export function ProviderSection({
  header,
  headerNote,
  models,
  loading,
  error,
  onRetry,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onEditProvider,
  onDeleteProvider,
  onApplyPreset,
  presetBusy,
  emptyMessage = '该端点下暂无模型 — 点右上「添加模型」接入',
}: {
  header: ProviderSectionHeader;
  /** 标题区补充说明(如「未归属端点」兜底区块的成因解释) */
  headerNote?: ReactNode;
  models: AgentModel[];
  loading?: boolean;
  /** 模型列表 query 的 error —— 不透传的话请求失败会和「该端点下暂无模型」长得一模一样 */
  error?: unknown;
  onRetry?: () => void;
  /** 不传 = 不渲染「添加模型」(数据异常兜底区块用) */
  onAddModel?: () => void;
  onEditModel: (m: AgentModel) => void;
  onDeleteModel: (m: AgentModel) => void;
  /** 不传 = 不渲染「编辑端点」(数据异常兜底区块用) */
  onEditProvider?: () => void;
  onDeleteProvider?: () => void; // 默认端点不传 = 不渲染删除
  onApplyPreset?: () => void; // 传入 = 渲染「应用官方预设」(DeepSeek 官方端点用,一键补全 flash/pro 参数)
  /** 该端点的预设正在批量应用 —— 按钮禁用,防手抖点两下让两轮 upsert 交叉执行 */
  presetBusy?: boolean;
  emptyMessage?: string;
}) {
  const unpricedCount = models.filter(isUnpriced).length;

  const columns: Column<AgentModel>[] = [
    {
      header: '模型',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{r.display_name || r.model_id}</span>
            {r.flagship && (
              <Badge variant="outline" className="gap-0.5 border-brand-amber text-brand-amber">
                <Sparkles className="size-2.5" />旗舰
              </Badge>
            )}
          </span>
          <span className="text-12 text-faint font-mono">{r.model_id}</span>
        </div>
      ),
    },
    {
      header: '上下文',
      width: 90,
      align: 'right',
      cell: (r) => (
        <span
          className="text-12 text-muted-foreground tabular-nums"
          title={r.context_window > 0 ? `${r.context_window.toLocaleString()} token` : undefined}
        >
          {fmtTokens(r.context_window)}
        </span>
      ),
    },
    {
      header: '价格 入/出(元/1M)',
      width: 150,
      align: 'right',
      cell: (r) =>
        isUnpriced(r) ? (
          <Badge
            variant="outline"
            className="border-brand-red text-brand-red"
            title="输入与输出单价都是 0 —— 成本制下 cost 恒为 0,该模型对所有用户等于免费。点编辑填入真实单价。"
          >
            未计价
          </Badge>
        ) : (
          <span className="text-12 text-muted-foreground tabular-nums">
            {r.price_in} / {r.price_out}
            {r.input_tier_threshold > 0 && (
              <span className="ml-1 text-12 text-brand-amber" title={tierTitle(r)}>
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
    <section className="rounded-16 border border-border bg-surface-card">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border-soft">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-16 font-medium text-foreground">{header.title}</h2>
            {header.isDefault && (
              <Badge variant="outline" className="text-brand-green border-brand-green">默认端点</Badge>
            )}
            <Badge variant="outline" className="font-mono text-12">{header.apiFormat}</Badge>
            {!header.enabled && <Badge variant="outline">停用</Badge>}
            {/* 推送状态三态 —— 只标 failed 时,「pending(agent 不可达,长期卡住)」与
                「success」在界面上完全一样(都什么都不显示)。 */}
            {header.pushStatus === 'failed' ? (
              <Badge variant="outline" className="text-brand-red border-brand-red">推送失败</Badge>
            ) : header.pushStatus === 'pending' ? (
              <Badge
                variant="outline"
                className="text-brand-amber border-brand-amber"
                title="配置已保存但尚未推送成功 —— agent 不可达时会长期停在这个状态"
              >
                推送中
              </Badge>
            ) : header.pushStatus === 'success' ? (
              <Badge variant="outline" className="text-brand-green border-brand-green">已推送</Badge>
            ) : null}
            {unpricedCount > 0 && (
              <Badge
                variant="outline"
                className="text-brand-red border-brand-red"
                title="这些模型输入/输出单价都是 0 —— 成本制下不扣任何额度,等于免费"
              >
                {unpricedCount} 个模型未计价
              </Badge>
            )}
          </div>
          <CopyableId
            value={header.baseUrl}
            label="Base URL"
            fallback="未配置"
            className="text-12 text-faint font-mono mt-0.5 max-w-full"
          />
          {header.pushStatus === 'failed' && header.pushError && (
            <p className="text-12 text-brand-red mt-0.5 break-all">推送失败原因:{header.pushError}</p>
          )}
          {headerNote && <div className="text-12 text-muted-foreground mt-1">{headerNote}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onApplyPreset && (
            <Button
              variant="outline"
              size="sm"
              onClick={onApplyPreset}
              disabled={presetBusy}
              title="用官方文档参数补全该厂商模型(上下文/输出/四类单价)"
            >
              <Sparkles className="size-3.5" />
              {presetBusy ? '应用中…' : '应用官方预设'}
            </Button>
          )}
          {onAddModel && (
            <Button variant="outline" size="sm" onClick={onAddModel}>
              <Plus className="size-3.5" />
              添加模型
            </Button>
          )}
          {onEditProvider && (
            <Button variant="ghost" size="icon" className="size-8" title="编辑端点" onClick={onEditProvider}>
              <Pencil className="size-3.5" />
            </Button>
          )}
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
      {models.length === 0 && !loading && !error ? (
        <div className="p-5 text-center text-12 text-faint">{emptyMessage}</div>
      ) : (
        <DataTable
          columns={columns}
          rows={models}
          loading={loading}
          error={error}
          onRetry={onRetry}
          emptyMessage={emptyMessage}
        />
      )}
    </section>
  );
}

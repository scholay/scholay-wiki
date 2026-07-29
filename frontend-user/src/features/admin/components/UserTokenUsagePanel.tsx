import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useTokenUsageSummary, compactTokens, formatPoints, formatYuan } from '../api/token-usage';

const DAY_PRESETS = [7, 30, 90, 365];

/**
 * 单用户算力用量面板(后台用户详情抽屉内)——「本周期额度条」之外的历史用量视角。
 * 复用后台算力看板的 summary 端点(按 user_id 过滤),主指标与上方额度条同单位(算力点):
 *   - 时段合计(算力点 / 调用次数 / 输入 / 输出 / 缓存)
 *   - 按模型拆分(每模型 算力点 / 输入 / 输出 / 缓存 / 次数)
 *   - 按天拆分(每天 算力点 / 输入 / 输出 / 缓存 / 次数,只列有用量的天)
 */
export function UserTokenUsagePanel({ userId }: { userId: number }) {
  const [days, setDays] = useState(30);
  const q = useTokenUsageSummary({ user_id: userId, days });
  const totals = q.data?.totals;
  const byModel = (q.data?.by_model ?? []).filter((m) => m.total_tokens > 0);
  // daily 是补 0 连续序列;只留有用量的天, 最近在前。
  const daily = (q.data?.daily ?? []).filter((d) => d.total_tokens > 0).slice().reverse();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {DAY_PRESETS.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={days === d ? 'default' : 'outline'}
            onClick={() => setDays(d)}
          >
            近{d}天
          </Button>
        ))}
      </div>

      {q.isLoading ? (
        <Loader2 className="size-4 animate-spin text-faint" />
      ) : !totals || totals.total_tokens === 0 ? (
        <p className="py-2 text-12 text-faint">该时段无 AI 用量</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="算力点" text={formatPoints(totals.cost_micro_yuan)} strong />
            <Stat label="折合" text={formatYuan(totals.cost_micro_yuan)} />
            <Stat label="调用次数" value={totals.total_calls} raw />
            <Stat label="输入" value={totals.input_tokens} />
            <Stat label="输出" value={totals.output_tokens} />
            <Stat label="缓存(读/创)" text={`${compactTokens(totals.cache_read_tokens)} / ${compactTokens(totals.cache_creation_tokens)}`} />
          </div>

          {totals.unpriced_calls > 0 && (
            // 「0 算力点」与「没花钱」必须可区分:这些是成本制改造前的历史行 / 该模型当时未配单价。
            <p className="text-12 text-brand-amber">
              其中 {totals.unpriced_calls.toLocaleString()} 次调用未计价(
              {compactTokens(totals.unpriced_tokens)} tokens 未折算成算力点)
            </p>
          )}

          {byModel.length > 0 && (
            <UsageTable
              title="按模型"
              firstCol="模型"
              rows={byModel.map((m) => ({
                key: m.key || '(未知)',
                label: m.label || m.key || '(未知)',
                costMicro: m.cost_micro_yuan,
                input: m.input_tokens,
                output: m.output_tokens,
                cache: m.cache_read_tokens + m.cache_creation_tokens,
                calls: m.calls,
              }))}
            />
          )}

          {daily.length > 0 && (
            <UsageTable
              title="按天"
              firstCol="日期"
              rows={daily.map((d) => ({
                key: d.date,
                label: d.date,
                costMicro: d.cost_micro_yuan,
                input: d.input_tokens,
                output: d.output_tokens,
                cache: d.cache_read_tokens + d.cache_creation_tokens,
                calls: d.calls,
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 数值格来源二选一:`text` 已格式化好(算力点 / ¥ / 组合串),或 `value` 走 token 缩写(raw=原样千分位)。 */
function Stat({
  label,
  value,
  text,
  strong,
  raw,
}: {
  label: string;
  value?: number;
  text?: string;
  strong?: boolean;
  raw?: boolean;
}) {
  return (
    <div className="rounded-8 border border-border bg-surface-1 px-2.5 py-1.5">
      <div className="text-12 text-faint">{label}</div>
      <div
        className={cn(
          'tabular-nums',
          strong ? 'text-12 font-medium text-foreground' : 'text-12 text-subtle'
        )}
      >
        {text ?? (raw ? (value ?? 0).toLocaleString() : compactTokens(value ?? 0))}
      </div>
    </div>
  );
}

interface UsageRow {
  key: string;
  label: string;
  costMicro: number;
  input: number;
  output: number;
  cache: number;
  calls: number;
}

function UsageTable({ title, firstCol, rows }: { title: string; firstCol: string; rows: UsageRow[] }) {
  return (
    <div>
      <h5 className="mb-1.5 text-12 font-medium text-faint">{title}</h5>
      <div className="overflow-x-auto rounded-12 border border-border">
        <table className="w-full min-w-[360px] text-12 tabular-nums">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-faint">
              <th className="px-2 py-1.5 text-left font-medium">{firstCol}</th>
              <th className="px-2 py-1.5 text-right font-medium">算力点</th>
              <th className="px-2 py-1.5 text-right font-medium">输入</th>
              <th className="px-2 py-1.5 text-right font-medium">输出</th>
              <th className="px-2 py-1.5 text-right font-medium">缓存</th>
              <th className="px-2 py-1.5 text-right font-medium">次数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border-soft last:border-0">
                <td className="max-w-[120px] truncate px-2 py-1.5 text-left text-subtle" title={r.label}>
                  {r.label}
                </td>
                {/* 未计价(cost=0)显示「—」而非「0」—— 见 TokenUsageLogTable 同款理由 */}
                <td className="px-2 py-1.5 text-right font-medium text-foreground">
                  {r.costMicro > 0 ? formatPoints(r.costMicro) : <span className="font-normal text-faint">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.input)}</td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.output)}</td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.cache)}</td>
                <td className="px-2 py-1.5 text-right text-faint">{r.calls.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

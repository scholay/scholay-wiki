import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useTokenUsageSummary, compactTokens } from '../api/token-usage';

const DAY_PRESETS = [7, 30, 90, 365];

/**
 * 单用户 Token 用量面板(后台用户详情抽屉内)——「本周期额度条」之外的历史用量视角。
 * 复用后台 token 看板的 summary 端点(按 user_id 过滤),展示:
 *   - 时段合计(输入 / 输出 / 缓存命中 / 缓存创建 / 调用次数)
 *   - 按模型拆分(每模型 输入 / 输出 / 缓存 / 合计)
 *   - 按天拆分(每天 输入 / 输出 / 缓存 / 合计 / 次数,只列有用量的天)
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
        <p className="py-2 text-xs text-faint">该时段无 AI 用量</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="合计" value={totals.total_tokens} strong />
            <Stat label="输入" value={totals.input_tokens} />
            <Stat label="输出" value={totals.output_tokens} />
            <Stat label="缓存命中" value={totals.cache_read_tokens} />
            <Stat label="缓存创建" value={totals.cache_creation_tokens} />
            <Stat label="调用次数" value={totals.total_calls} raw />
          </div>

          {byModel.length > 0 && (
            <UsageTable
              title="按模型"
              firstCol="模型"
              rows={byModel.map((m) => ({
                key: m.key || '(未知)',
                label: m.label || m.key || '(未知)',
                input: m.input_tokens,
                output: m.output_tokens,
                cache: m.cache_read_tokens + m.cache_creation_tokens,
                total: m.total_tokens,
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
                input: d.input_tokens,
                output: d.output_tokens,
                cache: d.cache_read_tokens + d.cache_creation_tokens,
                total: d.total_tokens,
                calls: d.calls,
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong, raw }: { label: string; value: number; strong?: boolean; raw?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5">
      <div className="text-2xs text-faint">{label}</div>
      <div
        className={cn(
          'tabular-nums',
          strong ? 'text-sm font-bold text-foreground' : 'text-xs text-subtle'
        )}
      >
        {raw ? value.toLocaleString() : compactTokens(value)}
      </div>
    </div>
  );
}

interface UsageRow {
  key: string;
  label: string;
  input: number;
  output: number;
  cache: number;
  total: number;
  calls: number;
}

function UsageTable({ title, firstCol, rows }: { title: string; firstCol: string; rows: UsageRow[] }) {
  return (
    <div>
      <h5 className="mb-1.5 text-2xs font-bold tracking-[0.1em] text-faint">{title}</h5>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[360px] text-2xs tabular-nums">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-faint">
              <th className="px-2 py-1.5 text-left font-medium">{firstCol}</th>
              <th className="px-2 py-1.5 text-right font-medium">输入</th>
              <th className="px-2 py-1.5 text-right font-medium">输出</th>
              <th className="px-2 py-1.5 text-right font-medium">缓存</th>
              <th className="px-2 py-1.5 text-right font-medium">合计</th>
              <th className="px-2 py-1.5 text-right font-medium">次数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border-soft last:border-0">
                <td className="max-w-[120px] truncate px-2 py-1.5 text-left text-subtle" title={r.label}>
                  {r.label}
                </td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.input)}</td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.output)}</td>
                <td className="px-2 py-1.5 text-right text-subtle">{compactTokens(r.cache)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-foreground">{compactTokens(r.total)}</td>
                <td className="px-2 py-1.5 text-right text-faint">{r.calls.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

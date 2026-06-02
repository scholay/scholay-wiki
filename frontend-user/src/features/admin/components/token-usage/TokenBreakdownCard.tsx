import { cn } from '@/shared/lib/utils';
import { compactTokens } from '../../api/token-usage';

/**
 * Token 维度拆分卡 —— 横条排行(by model / feature / source / provider / top users 通用)。
 * 复用 UsageStatsPage 的横条样式(h-2 track + 品牌色 fill),不引 recharts(更轻、已是在手样式)。
 * 可选 onRowClick → 行变按钮,用于下钻(点某维度回填筛选 + 滚到明细)。
 */

export interface TokenBreakdownRow {
  key: string;
  label: string;
  tokens: number;
  calls: number;
  /** 次要说明(如 top 用户的邮箱) */
  sub?: string;
}

export function TokenBreakdownCard({
  title,
  rows,
  loading,
  color = 'green',
  emptyText = '暂无数据',
  onRowClick,
}: {
  title: string;
  rows: TokenBreakdownRow[];
  loading?: boolean;
  color?: 'green' | 'red';
  emptyText?: string;
  onRowClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  const fill = color === 'red' ? 'bg-brand-red' : 'bg-brand-green';

  return (
    <div className="rounded-md border border-border bg-background p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const body = (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-subtle font-medium truncate">
                  {r.label}
                  {r.sub && <span className="text-faint font-normal ml-1">{r.sub}</span>}
                </span>
                <span className="text-faint shrink-0 tabular-nums">
                  {compactTokens(r.tokens)} · {r.calls.toLocaleString()} 次
                </span>
              </div>
              <div className="h-2 rounded-pill bg-surface-2 overflow-hidden mt-1">
                <div
                  className={cn('h-full rounded-pill', fill)}
                  style={{ width: `${(r.tokens / max) * 100}%` }}
                />
              </div>
            </>
          );
          return onRowClick ? (
            <button
              key={r.key}
              type="button"
              onClick={() => onRowClick(r.key)}
              className="flex flex-col text-left w-full rounded-sm hover:bg-surface-1 -mx-1 px-1 py-0.5 transition-colors"
            >
              {body}
            </button>
          ) : (
            <div key={r.key} className="flex flex-col">
              {body}
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <p className="text-xs text-faint py-6 text-center">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

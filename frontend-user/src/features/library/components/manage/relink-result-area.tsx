import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatAuthorsDisplay, keyOfHit, sourceBrandLabel } from '../../lib/resolve-paper';
import type { SearchHit } from '../../api/upload-resolve';

/** RelinkPanel 的结果列表(loading / error / empty / 单选候选)。拆出来让 RelinkPanel ≤300 行。 */
export function RelinkResultArea({
  loading,
  error,
  tabLabel,
  hits,
  selectedKey,
  currentKey,
  onSelect,
}: {
  loading: boolean;
  error: Error | null;
  tabLabel: string;
  hits: SearchHit[];
  selectedKey: string | null;
  /** 当前已关联论文的 "source:source_paper_id"(free 行为 null)—— 命中候选标记「当前关联」 */
  currentKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint">
        <Loader2 className="size-4 animate-spin" />
        正在 {tabLabel} 检索…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-3 py-8 text-center text-sm text-brand-red">
        {error.message || '检索失败'}
      </div>
    );
  }
  if (hits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div className="text-sm font-semibold text-foreground">{tabLabel} 没找到匹配的论文</div>
        <div className="text-xs text-muted-foreground">换个标题关键词,或切到其他来源试试</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 mb-3 text-xs text-muted-foreground">
        <Check className="size-3.5 text-brand-green" strokeWidth={2.5} />
        已从 <span className="font-bold text-foreground">{tabLabel}</span> 找到{' '}
        <span className="font-bold text-foreground tabular-nums">{hits.length}</span> 条候选 ·
        按相关度排序
      </div>

      <ul className="space-y-2">
        {hits.map((h) => {
          const key = keyOfHit(h);
          const selected = key === selectedKey;
          const isCurrent = currentKey != null && key === currentKey;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 rounded-md border-2 text-left transition-colors',
                  selected ? 'border-brand-amber bg-warning-soft/40' : 'border-border hover:bg-surface-1',
                  isCurrent && !selected && 'opacity-70'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-pill shrink-0 mt-0.5 border-2 transition-colors',
                    selected ? 'bg-brand-amber border-brand-amber text-background' : 'border-border bg-background'
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="text-sm font-bold text-foreground leading-snug line-clamp-2"
                      title={h.title}
                    >
                      {h.title || '无标题'}
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1">
                      {isCurrent && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-warning-soft text-brand-amber text-2xs font-bold leading-none whitespace-nowrap">
                          当前关联
                        </span>
                      )}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-surface-2 text-subtle text-2xs font-bold leading-none uppercase tracking-wide">
                        {sourceBrandLabel(h.source)}
                      </span>
                    </span>
                  </div>
                  {(() => {
                    const a = formatAuthorsDisplay(h.authors);
                    return a ? (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{a}</div>
                    ) : null;
                  })()}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-faint">
                    {h.venue && <span>{h.venue}</span>}
                    {h.year && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{h.year}</span>
                      </>
                    )}
                    {h.doi && (
                      <>
                        <span>·</span>
                        <span className="font-mono">DOI {h.doi}</span>
                      </>
                    )}
                  </div>
                </div>
                {selected && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-brand-amber text-background text-xs font-bold">
                    <Check className="size-3" strokeWidth={3} />
                    已选
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

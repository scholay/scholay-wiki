import { useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useApiToast } from '@/shared/hooks';
import { useRelinkPaper, useRelinkSearch } from '../../api/relink';
import { hitToConfirmLink, keyOfHit } from '../../lib/resolve-paper';
import { RelinkResultArea } from './relink-result-area';
import type { PaperSource, UserLibraryPaper } from '@/shared/api/types';

/**
 * 统一管理弹窗 · 在线关联 tab —— 三源(Discovery/Graph/Medicine)检索 + 单选 + 落库。
 * 自动用 og_title / title 兜底查询;选 1 条 → 下一步 → relink(merged 时合并到已有行)。
 * 原 PaperRelinkDialog 的弹窗外壳由 PaperManageDialog 提供。
 */

type SourceTab = 'discovery' | 'graph' | 'medicine';

const TAB_DEFS: Array<{ id: SourceTab; label: string; source: PaperSource }> = [
  { id: 'graph', label: 'Graph', source: 'stc' },
  { id: 'discovery', label: 'Discovery', source: 'olx' },
  { id: 'medicine', label: 'Medicine', source: 'pmd' },
];

export function RelinkPanel({
  paper,
  onClose,
}: {
  paper: UserLibraryPaper;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SourceTab>('graph');
  const [queryOverride, setQueryOverride] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const searchQ = useRelinkSearch(paper.id, queryOverride);
  const relinkMut = useRelinkPaper();
  const apiToast = useApiToast();

  const queryText = queryOverride ?? searchQ.data?.used_title ?? '';
  const allHits = searchQ.data?.hits ?? [];

  const tabSource = TAB_DEFS.find((t) => t.id === tab)?.source ?? null;
  const filteredHits = useMemo(
    () => (tabSource ? allHits.filter((h) => h.source === tabSource) : []),
    [allHits, tabSource]
  );

  const counts: Record<SourceTab, number> = useMemo(() => {
    const c: Record<SourceTab, number> = { discovery: 0, graph: 0, medicine: 0 };
    for (const h of allHits) {
      if (h.source === 'stc') c.graph++;
      else if (h.source === 'olx') c.discovery++;
      else if (h.source === 'pmd') c.medicine++;
    }
    return c;
  }, [allHits]);

  const handleRelink = () => {
    const hit = filteredHits.find((h) => keyOfHit(h) === selectedKey);
    if (!hit) {
      toast.info('请先选择一条候选');
      return;
    }
    relinkMut.mutate(
      { paperId: paper.id, link: hitToConfirmLink(hit) },
      {
        onSuccess: (r) => {
          toast.success(r.merged ? '已合并到已有条目' : '已关联到上游');
          onClose();
        },
        onError: (err) => apiToast.show(err, '关联失败'),
      }
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 源 tab */}
      <div role="tablist" aria-label="数据源" className="flex items-center gap-1 px-6 border-b border-border shrink-0">
        {TAB_DEFS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative inline-flex items-center gap-1.5 h-10 px-3 text-sm font-semibold transition-colors',
                active ? 'text-brand-amber' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-pill text-[10px] font-bold leading-none tabular-nums',
                    active ? 'bg-brand-amber text-background' : 'bg-surface-2 text-subtle'
                  )}
                >
                  {count} 命中
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-pill bg-brand-amber"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 搜索条 */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 h-10 px-3 rounded-md border border-border bg-background focus-within:border-brand-amber focus-within:ring-2 focus-within:ring-brand-amber/20 transition-colors">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryOverride(e.target.value)}
              placeholder="标题 · DOI · 关键词"
              className="flex-1 min-w-0 h-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
            />
            {paper.doi && (
              <span className="text-2xs text-faint font-mono whitespace-nowrap shrink-0">
                DOI: {paper.doi}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setQueryOverride((q) => q ?? searchQ.data?.used_title ?? '');
              searchQ.refetch();
            }}
            disabled={searchQ.isFetching}
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-brand-amber text-brand-amber text-sm font-bold',
              'hover:bg-warning-soft disabled:opacity-60 transition-colors'
            )}
          >
            {searchQ.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            重新检索
          </button>
        </div>
      </div>

      {/* 结果 list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
        <RelinkResultArea
          loading={searchQ.isLoading}
          error={searchQ.error as Error | null}
          tabLabel={TAB_DEFS.find((t) => t.id === tab)?.label ?? ''}
          hits={filteredHits}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 px-6 py-3 bg-surface-1 border-t border-border-soft shrink-0">
        <span className="text-xs text-muted-foreground">应用后将覆盖文献卡当前对应字段</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-sm text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleRelink}
            disabled={
              !selectedKey ||
              relinkMut.isPending ||
              !filteredHits.find((h) => keyOfHit(h) === selectedKey)
            }
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-sm bg-brand-amber text-background text-sm font-bold',
              'hover:bg-brand-amber/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {relinkMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" strokeWidth={2.5} />
            )}
            下一步
          </button>
        </div>
      </div>
    </div>
  );
}

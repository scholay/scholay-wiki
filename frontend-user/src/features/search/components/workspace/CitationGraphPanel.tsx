import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { cn } from '@/shared/lib/utils';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import type { Paper } from '../../api/papers';
import { CitationGraphMock } from './CitationGraphMock';

const FILTERS = ['引文链', '共引簇', '合作者', '时间轴'] as const;

/** 工作区 · 文献图谱 —— 暂存文献的网络视图 mock */
export function CitationGraphPanel({ staged }: { staged: Paper[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('引文链');
  const checkedPaperIds = useWorkspaceFolderUi((s) => s.checkedPaperIds);
  const visibleStaged = useMemo(
    () => staged.filter((p) => checkedPaperIds.includes(p.paperId)),
    [staged, checkedPaperIds],
  );

  const stats = useMemo(() => {
    const authors = new Set(
      visibleStaged.flatMap((p) =>
        (p.authors ?? []).map((a) => a.name).filter(Boolean),
      ),
    );
    return { authors: authors.size, links: Math.max(visibleStaged.length * 2, 4) };
  }, [visibleStaged]);

  if (staged.length === 0 || visibleStaged.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background p-6">
        <EmptyState
          icon={FileText}
          title={staged.length === 0 ? '工作区还是空的' : '还没有勾选文献'}
          description={
            staged.length === 0
              ? '暂存论文后,可在此查看引文关联与合作网络'
              : '在左侧勾选文献后,即可查看引文关联与合作网络'
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
      <div className="flex h-9 min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border bg-surface-1 px-3">
        <div className="flex min-w-0 shrink items-center gap-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                'rounded-pill px-2.5 py-1 text-2xs font-semibold transition-colors',
                filter === item
                  ? 'bg-foreground text-background'
                  : 'text-subtle hover:bg-background hover:text-foreground',
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-2xs tabular-nums text-faint">
          <span>{visibleStaged.length} 篇</span>
          <span>{stats.authors} 作者</span>
          <span>{stats.links} 关联</span>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-3">
        <CitationGraphMock staged={visibleStaged} />
      </div>
    </div>
  );
}

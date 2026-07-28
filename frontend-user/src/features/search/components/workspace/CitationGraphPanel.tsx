import { useMemo, useState } from 'react';
import { FileText, Share2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '../../api/papers';
import { StagingTabs } from '../StagingTabs';
import { CitationGraphMock } from './CitationGraphMock';

const FILTERS = ['引文链', '共引簇', '合作者', '时间轴'] as const;

/** 工作区 · 文献图谱 —— 暂存文献的网络视图 mock */
export function CitationGraphPanel({ staged }: { staged: Paper[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('引文链');

  const stats = useMemo(() => {
    const authors = new Set(
      staged.flatMap((p) => (p.authors ?? []).map((a) => a.name).filter(Boolean)),
    );
    return { authors: authors.size, links: Math.max(staged.length * 2, 4) };
  }, [staged]);

  if (staged.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <PanelHeader count={0} />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="工作区还是空的"
            description="暂存论文后,可在此查看引文关联与合作网络"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PanelHeader count={staged.length} />

      <div className="shrink-0 border-b border-border">
        <StagingTabs />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                'rounded-pill px-2.5 py-1 text-2xs font-semibold transition-colors',
                filter === item
                  ? 'bg-foreground text-background'
                  : 'text-subtle hover:bg-surface-1 hover:text-foreground',
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-2xs tabular-nums text-faint">
          <span>{staged.length} 篇</span>
          <span>{stats.authors} 作者</span>
          <span>{stats.links} 关联</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <CitationGraphMock staged={staged} />
      </div>
    </div>
  );
}

function PanelHeader({ count }: { count: number }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
      <Share2 className="size-4 shrink-0 text-brand-green" strokeWidth={2.5} />
      <span className="text-sm font-bold text-foreground">文献图谱</span>
      <span className="truncate text-xs text-faint">
        {count > 0 ? `${count} 篇工作区文献` : '暂无文献'}
      </span>
    </header>
  );
}

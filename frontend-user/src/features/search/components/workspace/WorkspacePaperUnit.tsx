import { memo } from 'react';
import { X } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { cn } from '@/shared/lib/utils';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import type { Paper } from '@/shared/api/types';

/** 标题首字母(优先拉丁/汉字),缺省 "?" */
export function paperInitial(title?: string): string {
  const t = (title ?? '').trim();
  if (!t) return '?';
  const m = t.match(/[A-Za-z\u4e00-\u9fff]/);
  return (m?.[0] ?? t[0]).toUpperCase();
}

function formatAuthors(paper: Paper, max = 3): string {
  const names = (paper.authors ?? [])
    .map((a) => a.name?.trim())
    .filter(Boolean) as string[];
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} et al.`;
}

/** 悬浮时展示的参考文献基础信息 */
function CitePreview({ paper }: { paper: Paper }) {
  const authors = formatAuthors(paper);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-semibold leading-snug text-foreground">
        {paper.title || '无标题'}
      </div>
      {authors ? (
        <div className="text-2xs leading-relaxed text-subtle">{authors}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-faint">
        {paper.year != null ? (
          <span className="tabular-nums">{paper.year}</span>
        ) : null}
        {paper.venue ? (
          <span className="min-w-0 truncate italic">{paper.venue}</span>
        ) : null}
        {paper.citationCount != null ? (
          <span className="tabular-nums">被引 {paper.citationCount}</span>
        ) : null}
      </div>
    </div>
  );
}

interface WorkspacePaperUnitProps {
  paper: Paper;
  rail: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: (paperId: string) => void;
}

/**
 * 工作区文献单元 —— 展开态小卡片;窄轨态首字母+年份,hover 出参考文献信息卡。
 */
export const WorkspacePaperUnit = memo(function WorkspacePaperUnit({
  paper,
  rail,
  selected,
  onSelect,
  onRemove,
}: WorkspacePaperUnitProps) {
  const openDetail = useOpenPaperDetail();
  const initial = paperInitial(paper.title);
  const yearLabel =
    paper.year != null ? String(paper.year) : '—';
  const authors = formatAuthors(paper, 2);

  const open = () => {
    onSelect?.();
    openDetail(paper);
  };

  if (rail) {
    return (
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            data-workspace-row
            onClick={open}
            title={paper.title || '无标题'}
            aria-label={`${paper.title || '无标题'}${paper.year ? `, ${paper.year}` : ''}`}
            className={cn(
              'flex h-8 w-full items-center justify-center gap-0.5 rounded-sm px-0.5 transition-colors',
              selected
                ? 'bg-danger-soft text-brand-red'
                : 'text-subtle hover:bg-surface-1 hover:text-foreground',
            )}
          >
            <span className="inline-flex size-3 shrink-0 items-center justify-center text-2xs font-bold leading-none">
              {initial}
            </span>
            <span
              className={cn(
                'w-[4ch] shrink-0 text-center text-2xs font-semibold tabular-nums leading-none tracking-tight',
                selected ? 'text-brand-red' : 'text-faint',
              )}
            >
              {yearLabel}
            </span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-[260px] p-3"
        >
          <CitePreview paper={paper} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <HoverCard openDelay={280} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div
          data-workspace-row
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open();
            }
          }}
          className={cn(
            'group/unit relative mx-2 mb-1.5 cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors',
            selected
              ? 'border-brand-red/40 bg-danger-soft'
              : 'border-border bg-background hover:border-border-strong hover:bg-surface-1',
          )}
        >
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(paper.paperId);
              }}
              className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-sm text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover/unit:opacity-100"
              aria-label="从暂存区移除"
              title="从暂存区移除"
            >
              <X className="size-3" />
            </button>
          )}
          <div
            className={cn(
              'line-clamp-2 pr-5 text-xs font-semibold leading-snug',
              selected ? 'text-brand-red' : 'text-foreground',
            )}
          >
            {paper.title || '无标题'}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-2xs text-faint">
            {paper.year != null && (
              <span className="shrink-0 tabular-nums">{paper.year}</span>
            )}
            {authors ? (
              <span className="min-w-0 truncate">{authors}</span>
            ) : null}
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-[280px] p-3"
      >
        <CitePreview paper={paper} />
      </HoverCardContent>
    </HoverCard>
  );
});

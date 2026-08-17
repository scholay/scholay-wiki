import { memo } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { pickTags } from '@/shared/components/PaperResultCard/tags';
import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import { formatCiteAuthors, type CiteEntry } from './collect-session-papers';

function CiteTag({
  label,
  tone,
}: {
  label: string;
  tone: ReturnType<typeof pickTags>[number]['tone'];
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-pill px-1.5 text-12 font-medium',
        tone === 'tier-high' && 'border border-brand-green text-brand-green',
        tone === 'tier-mid' && 'border border-brand-amber text-amber-soft-fg',
        tone === 'neutral' && 'border border-border text-subtle',
        tone === 'alert' && 'bg-brand-red text-on-dark',
        tone === 'field' && 'text-faint',
      )}
    >
      {label}
    </span>
  );
}

export function CitePreview({
  paper,
  journalEnrichment,
}: {
  paper: Paper;
  journalEnrichment?: JournalEnrichment | null;
}) {
  const authors = formatCiteAuthors(paper, 8);
  const doi =
    typeof paper.externalIds?.DOI === 'string'
      ? paper.externalIds.DOI
      : undefined;
  const tags = pickTags(paper, journalEnrichment);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-14 font-semibold leading-snug text-foreground">
        {paper.title || '无标题'}
      </div>
      {authors ? (
        <div className="text-12 leading-relaxed text-subtle">{authors}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-12 text-faint">
        {paper.year != null ? (
          <span className="tabular-nums">{paper.year}</span>
        ) : null}
        {paper.venue ? (
          <span className="min-w-0 italic">{paper.venue}</span>
        ) : null}
        {paper.citationCount != null ? (
          <span className="tabular-nums">被引 {paper.citationCount}</span>
        ) : null}
        {doi ? <span className="break-all">DOI {doi}</span> : null}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {tags.slice(0, 6).map((t) => (
            <CiteTag key={t.key} label={t.label} tone={t.tone} />
          ))}
        </div>
      )}
      {paper.abstract ? (
        <p className="line-clamp-5 text-12 leading-relaxed text-subtle">
          {paper.abstract}
        </p>
      ) : null}
    </div>
  );
}

interface BibliographyCiteCardProps {
  entry: CiteEntry;
  isStaged: boolean;
  journalEnrichment?: JournalEnrichment | null;
  onStage: (paper: Paper) => void;
  onUnstage: (paperId: string) => void;
}

export const BibliographyCiteCard = memo(function BibliographyCiteCard({
  entry,
  isStaged,
  journalEnrichment,
  onStage,
  onUnstage,
}: BibliographyCiteCardProps) {
  const { paper, index } = entry;
  const openDetail = useOpenPaperDetail();
  const isActive = useSearchRightPanelStore((s) => s.isActivePaper(paper.paperId));
  const authors = formatCiteAuthors(paper, 2);

  const open = () => openDetail(paper);
  const toggleStage = () => {
    if (isStaged) onUnstage(paper.paperId);
    else onStage(paper);
  };

  return (
    <div
      className={cn(
        'mb-2 flex items-start gap-2 rounded-12 border px-3 py-2.5 last:mb-0 transition-colors',
        isActive
          ? 'border-brand-red/40 bg-brand-red/5'
          : isStaged
            ? 'border-brand-green/30 bg-brand-green/5'
            : 'border-border bg-surface-1 hover:border-border-strong hover:bg-background',
      )}
    >
      <HoverCard openDelay={140} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          >
            <span
              className={cn(
                'mt-0.5 w-6 shrink-0 text-right text-14 tabular-nums',
                isActive ? 'text-brand-red' : 'text-faint',
              )}
            >
              {index}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'line-clamp-2 text-14 font-semibold leading-snug',
                  isActive ? 'text-brand-red' : 'text-foreground',
                )}
              >
                {paper.title || '无标题'}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-12 text-subtle">
                {paper.year != null && (
                  <span className="shrink-0 tabular-nums">{paper.year}</span>
                )}
                {authors ? (
                  <span className="min-w-0 truncate">{authors}</span>
                ) : null}
              </span>
              {paper.venue ? (
                <span className="mt-0.5 block truncate text-12 italic text-faint">
                  {paper.venue}
                </span>
              ) : null}
            </span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="left"
          align="start"
          sideOffset={8}
          className="w-80 p-3.5"
        >
          <CitePreview paper={paper} journalEnrichment={journalEnrichment} />
        </HoverCardContent>
      </HoverCard>
      <Checkbox
        checked={isStaged}
        onCheckedChange={toggleStage}
        aria-label={isStaged ? '取消暂存' : '加入暂存区'}
        title={isStaged ? '取消勾选以移出暂存区' : '勾选以加入暂存区'}
        className="mt-1 shrink-0"
      />
    </div>
  );
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { BookmarkPlus, Loader2, Quote } from 'lucide-react';
import { toast } from 'sonner';
import type { Paper } from '@/shared/api/types';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import { trackPaperImpressions } from '@/shared/api/hot-content';
import { useStagingActions } from '../../hooks/useStagingActions';
import { useStagingView } from '../../hooks/useStagingView';
import { BibliographyCiteCard } from './BibliographyCiteCard';
import {
  groupCiteEntries,
  type CiteEntry,
} from './collect-session-papers';
import { useEnrichedPapers } from './useEnrichedPapers';

const reportedImpressionIds = new Set<string>();

/**
 * Session bibliography rail — unique papers from smart-search tool results,
 * compact cite rows with hover for the full record.
 */
export function SmartSearchBibliography({ entries }: { entries: CiteEntry[] }) {
  const rawPapers = useMemo(() => entries.map((e) => e.paper), [entries]);
  const enriched = useEnrichedPapers(rawPapers);
  const enrichedEntries = useMemo(() => {
    const byId = new Map(enriched.map((p) => [p.paperId, p]));
    return entries.map((e) => ({
      ...e,
      paper: byId.get(e.paper.paperId) ?? e.paper,
    }));
  }, [entries, enriched]);

  const groups = useMemo(
    () => groupCiteEntries(enrichedEntries),
    [enrichedEntries],
  );
  const showGroupHeads = groups.length > 1;

  useEffect(() => {
    const fresh = enriched.filter((p) => !reportedImpressionIds.has(p.paperId));
    if (fresh.length === 0) return;
    for (const p of fresh) reportedImpressionIds.add(p.paperId);
    trackPaperImpressions(fresh);
  }, [enriched]);

  const { areas, stagedIds } = useStagingView();
  const { stagePaper, removePaper, bulkStagePapers } = useStagingActions();

  const unstageAcrossAreas = useCallback(
    (paperId: string) => {
      if (!stagedIds.has(paperId)) return;
      for (const a of areas) {
        if (a.papers.some((p) => p.paperId === paperId)) {
          removePaper(a.id, paperId);
        }
      }
    },
    [areas, stagedIds, removePaper],
  );

  const handleStage = useCallback(
    (paper: Paper) => {
      stagePaper(paper, 'smart');
    },
    [stagePaper],
  );

  const venues = useMemo(
    () =>
      Array.from(
        new Set(
          enriched.map((p) => p.venue?.trim()).filter((v): v is string => !!v),
        ),
      ),
    [enriched],
  );
  const journalEnrichments = useJournalEnrichments(venues);

  const unstagedCount = useMemo(
    () => enriched.filter((p) => !stagedIds.has(p.paperId)).length,
    [enriched, stagedIds],
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const handleBulkStage = useCallback(async () => {
    if (bulkBusy || unstagedCount === 0) return;
    setBulkBusy(true);
    try {
      const { added, skipped, capped } = await bulkStagePapers(enriched, 'smart');
      const parts: string[] = [];
      if (added > 0) parts.push(`已暂存 ${added} 篇`);
      if (skipped > 0) parts.push(`${skipped} 篇已在暂存区`);
      if (capped > 0) parts.push(`${capped} 篇因暂存区已满未加入`);
      if (parts.length === 0) {
        toast.info('当前参考文献已全部在暂存区');
      } else {
        const isWarn = added === 0;
        if (isWarn) toast.info(parts.join(', '));
        else toast.success(parts.join(', '));
      }
    } catch (err) {
      toast.error(`批量暂存失败:${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, unstagedCount, bulkStagePapers, enriched]);

  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const allStaged = unstagedCount === 0;

  return (
    <aside
      aria-label="参考文献"
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border bg-background"
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border-soft px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Quote className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
          <span className="text-12 font-medium text-foreground">参考文献</span>
          <span className="text-12 text-faint tabular-nums">
            {enrichedEntries.length}
          </span>
        </div>
        <button
          type="button"
          onClick={handleBulkStage}
          disabled={bulkBusy || allStaged}
          title={
            allStaged
              ? '本组论文已全部在暂存区'
              : `把 ${unstagedCount} 篇未暂存论文加入暂存区`
          }
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-8 px-1.5 text-12 font-medium text-brand-green transition-colors hover:bg-brand-green/10 disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
        >
          {bulkBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <BookmarkPlus className="size-3" strokeWidth={2.2} />
          )}
          {allStaged ? '已暂存' : '暂存'}
        </button>
      </header>

      <div
        ref={listRef}
        className="chat-scrollbar-autohide min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5"
      >
        {groups.map((group) => (
          <section key={group.toolUseId} className="mb-3 last:mb-0">
            {showGroupHeads && (
              <h3 className="mb-1.5 truncate px-1 text-12 text-faint">
                {group.query ? `「${group.query}」` : '检索结果'}
                <span className="ml-1 tabular-nums">{group.entries.length}</span>
              </h3>
            )}
            {group.entries.map((entry) => (
              <BibliographyCiteCard
                key={entry.paper.paperId}
                entry={entry}
                isStaged={stagedIds.has(entry.paper.paperId)}
                journalEnrichment={
                  entry.paper.venue
                    ? (journalEnrichments[entry.paper.venue.trim()] ?? null)
                    : null
                }
                onStage={handleStage}
                onUnstage={unstageAcrossAreas}
              />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { parsePapersFromToolResult } from '@/shared/lib/minicod-papers';
import {
  useJournalEnrichments,
  type JournalEnrichment,
} from '@/shared/api/journal-enrichment';
import type { Paper, PaperAuthor } from '@/shared/api/types';
import {
  useOpenAuthorDetail,
  useOpenJournalDetail,
  useOpenPaperDetail,
} from '@/shared/hooks/useOpenInSearchPanel';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { pickTags, type CardTag } from '@/shared/components/PaperResultCard/tags';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import { cn } from '@/shared/lib/utils';
import { useStagingActions } from '../../hooks/useStagingActions';
import { useStagingView } from '../../hooks/useStagingView';
import { useStagedFavorites } from '../../hooks/useStagedFavorites';
import { revealStagingFileArea } from '../../lib/reveal-staging-file-area';
import { useEnrichedPapers } from './useEnrichedPapers';

const autoStagedBatches = new Set<string>();

const ENDNOTE_LINK =
  'underline decoration-dotted decoration-faint underline-offset-2 hover:text-brand-red hover:decoration-brand-red transition-colors';

function collectAuthors(authors?: PaperAuthor[]): PaperAuthor[] {
  if (!authors) return [];
  return authors
    .map((a) => ({ ...a, name: a.name?.trim() }))
    .filter((a): a is PaperAuthor & { name: string } => !!a.name);
}

function journalRowTags(j: JournalEnrichment | null): CardTag[] {
  const all = pickTags({ paperId: '' }, j);
  const quartile = all.find((t) => t.key === 'jcr') ?? all.find((t) => t.key === 'cas');
  const impact = all.find((t) => t.key === 'if');
  return [quartile, impact].filter((t): t is CardTag => !!t);
}

function MetricChip({ tag }: { tag: CardTag }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-pill px-1.5 align-middle text-12',
        tag.tone === 'tier-high' && 'border border-brand-green/70 text-brand-green',
        tag.tone === 'tier-mid' && 'border border-brand-amber text-brand-amber',
        tag.tone === 'neutral' && 'border border-border text-subtle',
        tag.tone === 'alert' && 'bg-brand-red text-on-brand',
      )}
    >
      {tag.label}
    </span>
  );
}

function PaperRowText({
  paper,
  journalEnrichment,
}: {
  paper: Paper;
  journalEnrichment: JournalEnrichment | null;
}) {
  const openPaper = useOpenPaperDetail();
  const openAuthor = useOpenAuthorDetail();
  const openJournal = useOpenJournalDetail();
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);

  const authors = collectAuthors(paper.authors);
  const visibleAuthors = authors.slice(0, 2);
  const hasMoreAuthors = authors.length > 2;
  const title = paper.title?.trim() || '无标题';
  const venue = paper.venue?.trim();
  const year = paper.year != null ? String(paper.year) : '';
  const canOpenJournal = !!journalEnrichment?.id;
  const metrics = journalRowTags(journalEnrichment);

  const handleAuthor = (author: PaperAuthor, e: MouseEvent) => {
    e.stopPropagation();
    if (!author.authorId || paper.source === 'local') return;
    openAuthor({
      authorId: author.authorId,
      name: author.name ?? '',
      affiliations: author.affiliations,
      source: paper.source,
    });
  };

  const handleVenue = (e: MouseEvent) => {
    e.stopPropagation();
    if (!journalEnrichment) return;
    openJournal({
      id: journalEnrichment.id,
      canonical_name: journalEnrichment.canonical_name,
      jcr_quartile: journalEnrichment.jcr_quartile,
      jcr_impact_factor: journalEnrichment.jcr_impact_factor,
      fqb_quartile: journalEnrichment.fqb_quartile,
      ccf_rank: journalEnrichment.ccf_rank,
      openalex_h_index: journalEnrichment.openalex_h_index,
      gjqk_warning: journalEnrichment.gjqk_warning,
      is_oa: journalEnrichment.is_oa,
    });
  };

  const handleTitle = () => {
    setSelectedPaperId(paper.paperId);
    openPaper(paper);
  };

  const sep = <span className="shrink-0 text-faint">·</span>;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-12 text-subtle">
      <button
        type="button"
        onClick={handleTitle}
        title={title}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-foreground',
          ENDNOTE_LINK,
        )}
      >
        {title}
      </button>
      {venue ? (
        <>
          {sep}
          {canOpenJournal ? (
            <button
              type="button"
              onClick={handleVenue}
              title={`查看期刊详情：${venue}`}
              className={cn(
                'max-w-[9rem] shrink-0 truncate italic',
                ENDNOTE_LINK,
              )}
            >
              {venue}
            </button>
          ) : (
            <span className="max-w-[9rem] shrink-0 truncate italic" title={venue}>
              {venue}
            </span>
          )}
          {metrics.map((tag) => (
            <MetricChip key={tag.key} tag={tag} />
          ))}
        </>
      ) : null}
      {visibleAuthors.length > 0 ? (
        <>
          {sep}
          <span className="shrink-0 whitespace-nowrap">
            {visibleAuthors.map((author, i) => (
              <span key={author.authorId ?? `${i}-${author.name}`}>
                {i > 0 ? ', ' : null}
                {author.authorId && paper.source !== 'local' ? (
                  <button
                    type="button"
                    onClick={(e) => handleAuthor(author, e)}
                    title={`查看学者详情：${author.name}`}
                    className={ENDNOTE_LINK}
                  >
                    {author.name}
                  </button>
                ) : (
                  <span>{author.name}</span>
                )}
              </span>
            ))}
            {hasMoreAuthors ? (
              <span title={authors.map((a) => a.name).join(', ')}>…</span>
            ) : null}
          </span>
        </>
      ) : null}
      {year ? (
        <>
          {sep}
          <span className="shrink-0 tabular-nums text-faint">{year}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Chat-stream paper tool result as independent endnote rows.
 * Papers land in 临时 and open the file-column staging pane.
 * Author / title / venue open the expansion info panel.
 */
export function PaperResultIngress({ content }: { content: unknown }) {
  const papers = useMemo(
    () => parsePapersFromToolResult(content),
    [content],
  );
  const enriched = useEnrichedPapers(papers);
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
  const { stagedIds } = useStagingView();
  const { bulkStagePapers } = useStagingActions();
  const favoritedSet = useStagedFavorites(enriched);
  const stagedRef = useRef(stagedIds);
  stagedRef.current = stagedIds;

  useEffect(() => {
    if (papers.length === 0) return;
    const key = papers.map((p) => p.paperId).join('\0');
    if (autoStagedBatches.has(key)) return;
    autoStagedBatches.add(key);
    revealStagingFileArea();
    const incoming = papers.filter((p) => !stagedRef.current.has(p.paperId));
    if (incoming.length === 0) return;
    void bulkStagePapers(incoming, 'smart');
  }, [papers, bulkStagePapers]);

  if (enriched.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {enriched.map((paper) => (
        <li key={paper.paperId}>
          <div
            data-paper-id={paper.paperId}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-8 px-2 py-1.5 text-left"
          >
            <FavoritePaperButton
              paper={paper}
              isFavorited={favoritedSet.has(
                `${paper.source ?? 'stc'}:${paper.paperId}`,
              )}
              variant="icon"
              size="sm"
              className="shrink-0"
            />
            <PaperRowText
              paper={paper}
              journalEnrichment={
                paper.venue
                  ? (journalEnrichments[paper.venue.trim()] ?? null)
                  : null
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

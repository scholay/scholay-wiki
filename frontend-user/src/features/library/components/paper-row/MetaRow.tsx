import type { JournalEnrichment } from '@/shared/api/journal-enrichment';

/**
 * Meta 行 —— DOI · venue(可点跳期刊) · year + journal enrichment chips。
 *
 * enrichment 命中时:venue 下划线 + JCR chip + IF chip + (可选)中科院 / CCF chip。
 * onClickVenue 由父级传(stopPropagation 后调 useOpenJournalInBrowser)。
 */
export function MetaRow({
  doi,
  venue,
  year,
  enrichment,
  onClickVenue,
}: {
  doi?: string;
  venue?: string;
  year?: number;
  enrichment?: JournalEnrichment | null;
  onClickVenue?: (e: React.MouseEvent) => void;
}) {
  const hasEnrichment = !!enrichment;
  return (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-faint">
      {doi && (
        <span
          className="font-mono truncate max-w-[280px]"
          title={`DOI: ${doi}`}
        >
          DOI: {doi}
        </span>
      )}
      {doi && (venue || year) && (
        <span className="text-border-strong">·</span>
      )}
      {venue &&
        (onClickVenue && hasEnrichment ? (
          <button
            type="button"
            onClick={onClickVenue}
            className="truncate max-w-[280px] text-left underline decoration-dotted decoration-faint underline-offset-2 hover:text-brand-red hover:decoration-brand-red transition-colors"
            title={`查看期刊详情:${venue}`}
          >
            {venue}
          </button>
        ) : (
          <span className="truncate max-w-[280px]" title={venue}>
            {venue}
          </span>
        ))}
      {venue && year && <span className="text-border-strong">·</span>}
      {year && <span className="tabular-nums">{year}</span>}

      {/* journal enrichment chips —— JCR / IF / 中科院 / CCF */}
      {enrichment && (
        <>
          {enrichment.jcr_quartile && (
            <span className="inline-flex items-center h-4 px-1.5 rounded-4 bg-brand-amber/10 text-brand-amber text-[10px] font-bold tabular-nums">
              JCR {enrichment.jcr_quartile}
            </span>
          )}
          {enrichment.jcr_impact_factor != null && (
            <span className="inline-flex items-center h-4 px-1.5 rounded-4 bg-surface-2 border border-border text-foreground text-[10px] font-bold tabular-nums">
              IF {enrichment.jcr_impact_factor.toFixed(1)}
            </span>
          )}
          {enrichment.fqb_quartile && (
            <span className="inline-flex items-center h-4 px-1.5 rounded-4 bg-brand-red/8 text-brand-red text-[10px] font-bold">
              中科院 {enrichment.fqb_quartile}区
            </span>
          )}
          {enrichment.ccf_rank && (
            <span className="inline-flex items-center h-4 px-1.5 rounded-4 bg-foreground text-background text-[10px] font-bold">
              CCF {enrichment.ccf_rank}
            </span>
          )}
        </>
      )}
    </div>
  );
}

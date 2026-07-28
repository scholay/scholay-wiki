import { lazy, Suspense, useMemo } from 'react';
import { ExternalLink, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { JournalCover } from '@/shared/components/JournalCover';
import { JournalSubmissionCard } from '@/shared/components/JournalSubmissionCard';
import { JournalMetricsGroups } from '@/shared/components/JournalMetricsGroups';
import { JournalDecisionCard } from '@/shared/components/JournalDecisionCard';
import { cn } from '@/shared/lib/utils';
import { useJournalFullDetail } from '@/shared/api/journals';
import type { Journal } from '@/shared/api/types';

const JournalTrendChart = lazy(() =>
  import('@/shared/components/JournalTrendChart').then((m) => ({
    default: m.JournalTrendChart,
  })),
);

export function JournalDetailContent({
  journal,
  compact = false,
}: {
  journal: Journal;
  compact?: boolean;
}) {
  const fullQ = useJournalFullDetail(journal.id, journal.id > 0);
  const unified = fullQ.data?.unified;
  const subSrc = fullQ.data?.sources?.submission;
  const submissionInfo = subSrc
    ? {
        has_guideline: !!subSrc.main?.has_guideline,
        has_latex: !!subSrc.main?.has_latex,
        latex_class: subSrc.latex?.class ?? null,
      }
    : null;
  const hasSubmission = !!(
    submissionInfo &&
    (submissionInfo.has_guideline || submissionInfo.has_latex)
  );
  const issns = useMemo(
    () => (journal.issns ?? []).filter(Boolean).join(' / '),
    [journal.issns],
  );

  return (
    <div
      className={
        compact
          ? 'mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6'
          : 'mx-auto max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-10 sm:py-7'
      }
    >
      <section className="flex flex-col gap-4 rounded-lg border border-border-soft bg-surface-1 p-4 sm:flex-row sm:items-stretch sm:gap-6 sm:p-6">
        <JournalCover
          id={journal.id}
          name={journal.canonical_name}
          size="lg"
          className="h-[145px] w-[110px] shrink-0 sm:h-[180px] sm:w-[140px]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {journal.publisher && (
              <span className="inline-flex h-6 items-center rounded-pill border border-border bg-background px-2.5 text-2xs font-bold text-subtle">
                {journal.publisher}
              </span>
            )}
            {journal.is_oa && (
              <span className="inline-flex h-6 items-center rounded-pill bg-brand-green/10 px-2.5 text-2xs font-bold text-brand-green">
                Open Access
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-[32px]">
            {journal.canonical_name}
          </h1>
          <p className="text-base leading-relaxed text-subtle">{buildDescription(journal)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
            {issns && <span className="font-mono">ISSN {issns}</span>}
            {journal.openalex_h_index != null && (
              <span>
                <span className="font-bold text-subtle">h-index </span>
                {journal.openalex_h_index}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {journal.issns?.[0] && (
              <a
                href={`https://portal.issn.org/resource/ISSN/${encodeURIComponent(journal.issns[0])}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-bold text-background hover:opacity-90"
              >
                <ExternalLink className="size-3" strokeWidth={2.5} />
                查询原刊
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard(window.location.href);
                if (ok) toast.success('已复制期刊链接');
                else toast.error('复制失败,请手动复制地址栏链接');
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-bold text-subtle hover:border-foreground hover:text-foreground"
            >
              <Share2 className="size-3" strokeWidth={2.5} />
              分享
            </button>
          </div>
        </div>
        {hasSubmission && submissionInfo && (
          <div className="shrink-0 border-t border-border-soft pt-4 sm:w-60 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <JournalSubmissionCard
              journalId={journal.id}
              journalName={journal.canonical_name}
              submission={submissionInfo}
            />
          </div>
        )}
      </section>

      <JournalDecisionCard journal={journal} unified={unified} />

      <h2 className="font-display text-lg font-bold leading-none text-foreground">
        分区与影响因子
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <IndexCard label="JCR 分区" value={journal.jcr_quartile ?? '—'} sub={journal.jcr_quartile ? '汤森路透' : '未收录'} />
        <IndexCard
          label="中科院分区"
          value={journal.fqb_quartile ? `${journal.fqb_quartile}区` : '—'}
          sub={journal.fqb_quartile ? '大类分区' : '未收录'}
        />
        <IndexCard
          label="H-index"
          value={journal.openalex_h_index != null ? `h ${journal.openalex_h_index}` : '—'}
          sub="累计 h-index"
        />
        <IndexCard
          label="影响因子"
          value={journal.jcr_impact_factor != null ? journal.jcr_impact_factor.toFixed(1) : '—'}
          sub={journal.ccf_rank ? `CCF ${journal.ccf_rank}` : 'IF'}
          highlight
        />
      </div>

      {journal.id > 0 && (
        <Suspense fallback={null}>
          <JournalTrendChart journalId={journal.id} active />
        </Suspense>
      )}

      {unified && <JournalMetricsGroups unified={unified} />}
    </div>
  );
}

function buildDescription(j: {
  publisher?: string;
  country?: string;
  type?: string;
  canonical_name: string;
}): string {
  const parts: string[] = [];
  if (j.publisher) parts.push(`由 ${j.publisher} 出版`);
  if (j.country) parts.push(`总部位于 ${j.country}`);
  if (j.type === 'journal') parts.push('属于学术期刊');
  if (parts.length === 0) {
    return `${j.canonical_name} 的详细介绍尚在补充,可通过「查询原刊」前往出版方页面。`;
  }
  return `${parts.join('、')}。`;
}

function IndexCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'space-y-1.5 rounded-lg p-5',
        highlight ? 'bg-foreground text-background' : 'border border-border bg-background',
      )}
    >
      <div className={cn('text-2xs font-bold uppercase tracking-[0.16em]', highlight ? 'text-background/60' : 'text-faint')}>
        {label}
      </div>
      <div className={cn('font-display text-2xl font-bold leading-none tabular-nums', highlight ? 'text-background' : 'text-foreground')}>
        {value}
      </div>
      <div className={cn('text-xs', highlight ? 'text-background/60' : 'text-muted-foreground')}>{sub}</div>
    </div>
  );
}

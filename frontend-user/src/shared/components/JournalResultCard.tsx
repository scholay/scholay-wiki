import type { ReactNode } from 'react';
import { ArrowUpRight, Star, StarHalf } from 'lucide-react';
import { JournalCover } from '@/shared/components/JournalCover';
import { cn } from '@/shared/lib/utils';
import type { Journal } from '@/shared/api/types';

export type JournalCardVariant = 'metrics' | 'recommend';

export interface JournalRecommendScore {
  /** 0–5, step 0.5 */
  stars: number;
  percent: number;
  fitLabel: string;
  fitSub: string;
}

/**
 * Search / hub journal card — .pen `AO18q` (cover 120 + info, h-192).
 * `metrics` = IF / CAS / CCF; `recommend` = star rating for 智能选刊.
 */
export function JournalResultCard({
  journal: j,
  onOpen,
  variant = 'metrics',
  recommend,
  actionLabel = '查看详情',
}: {
  journal: Journal;
  onOpen?: () => void;
  variant?: JournalCardVariant;
  recommend?: JournalRecommendScore;
  actionLabel?: string;
}) {
  const score = recommend ?? (variant === 'recommend' ? deriveRecommendScore(j) : undefined);
  const interactive = !!onOpen;

  const body = (
    <>
      <JournalCover id={j.id} name={j.canonical_name} size="card" />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate font-display text-md font-bold leading-tight text-foreground transition-colors group-hover:text-brand-red">
              {j.canonical_name}
            </h3>
            <div className="truncate text-xs text-faint">
              {j.publisher ?? '出版社未知'}
              {j.country && <> · {j.country}</>}
              {j.is_oa && <> · OA</>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {variant === 'recommend' && score ? (
              <span
                className="inline-flex h-6 items-center px-2 rounded-sm bg-brand-amber-soft text-2xs font-bold text-brand-amber"
                title="scholay 选刊推荐"
              >
                推荐 {score.stars.toFixed(1)}
              </span>
            ) : null}
            {j.xr_quartile && (
              <span
                className="inline-flex h-6 items-center px-2 rounded-sm bg-brand-green/10 text-2xs font-bold text-brand-green"
                title="中科院新锐分区"
              >
                新锐 {j.xr_quartile} 区
              </span>
            )}
            {j.gjqk_warning && (
              <span
                className="inline-flex h-6 items-center gap-1 px-2 rounded-sm bg-warning-soft text-2xs font-bold text-brand-amber"
                title="中科院预警期刊"
              >
                ⚠ 预警
              </span>
            )}
          </div>
        </div>

        <div className="flex items-stretch rounded-md border border-border-soft">
          {variant === 'recommend' && score ? (
            <>
              <KpiCell
                label="推荐星级"
                value={<StarRow stars={score.stars} />}
                sub={`${score.stars.toFixed(1)} / 5`}
              />
              <KpiCell
                label="匹配度"
                value={`${score.percent}%`}
                sub={score.fitLabel}
                borderLeft
              />
              <KpiCell
                label="适配"
                value={score.fitSub}
                sub={j.fqb_quartile ? `中科院 ${j.fqb_quartile} 区` : '综合匹配'}
                borderLeft
              />
            </>
          ) : (
            <>
              <KpiCell
                label="影响因子"
                value={fmtIf(j.jcr_impact_factor)}
                sub={j.jcr_quartile ? `JCR ${j.jcr_quartile}` : '—'}
              />
              <KpiCell
                label="中科院分区"
                value={j.fqb_quartile ? `${j.fqb_quartile}区` : '—'}
                sub={j.fqb_quartile === '1' ? 'Top' : '—'}
                borderLeft
              />
              <KpiCell
                label="CCF 等级"
                value={j.ccf_rank ?? '—'}
                sub={j.ccf_rank ? `CCF ${j.ccf_rank}` : '—'}
                borderLeft
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {j.type && (
              <span className="inline-flex h-5 items-center px-2 rounded-sm bg-foreground text-2xs font-bold uppercase tracking-wide text-background">
                {j.type}
              </span>
            )}
            {(j.source_count ?? 0) > 0 && (
              <span className="inline-flex h-5 items-center px-2 rounded-sm bg-surface-2 text-2xs text-subtle">
                {j.source_count} 个数据源
              </span>
            )}
            {j.has_submission && (
              <span
                className="inline-flex h-5 items-center px-2 rounded-sm bg-prism-badge-bg text-2xs font-medium text-prism-badge-fg"
                title="提供投稿须知 / LaTeX 模板(Max 会员可下载)"
              >
                投稿资源
              </span>
            )}
          </div>
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-bold text-foreground transition-colors group-hover:bg-surface-1">
            {actionLabel}
            <ArrowUpRight className="size-3" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </>
  );

  const shell =
    'group flex h-48 items-stretch gap-4 border border-border bg-background p-[18px] text-left rounded-lg transition-all hover:border-foreground hover:shadow-sm';

  if (!interactive) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button type="button" onClick={onOpen} className={shell}>
      {body}
    </button>
  );
}

export function deriveRecommendScore(j: Journal): JournalRecommendScore {
  let score = 62;
  if (j.jcr_impact_factor != null) {
    score += Math.min(28, j.jcr_impact_factor * 0.7);
  }
  if (j.fqb_quartile === '1') score += 8;
  else if (j.fqb_quartile === '2') score += 4;
  if (j.ccf_rank === 'A') score += 6;
  else if (j.ccf_rank === 'B') score += 3;
  if (j.gjqk_warning) score -= 25;
  const percent = Math.max(42, Math.min(99, Math.round(score)));
  const stars = Math.max(2, Math.min(5, Math.round((percent / 20) * 2) / 2));

  let fitLabel = '可考虑';
  let fitSub = '综合匹配';
  if (j.gjqk_warning) {
    fitLabel = '谨慎评估';
    fitSub = '预警名单';
  } else if (percent >= 90) {
    fitLabel = '高度匹配';
    fitSub = '优先推荐';
  } else if (percent >= 78) {
    fitLabel = '较为匹配';
    fitSub = '值得投稿';
  }

  return { stars, percent, fitLabel, fitSub };
}

/** Hub preview — Nature-shaped sample matching the live result card. */
export const HUB_JOURNAL_SAMPLE: Journal = {
  id: 1,
  canonical_name: 'Nature',
  publisher: 'Springer Nature',
  country: 'United Kingdom',
  type: 'journal',
  jcr_impact_factor: 50.5,
  jcr_quartile: 'Q1',
  fqb_quartile: '1',
  xr_quartile: '1',
  source_count: 7,
  has_submission: true,
};

function fmtIf(v: number | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span className="inline-flex items-center gap-px text-brand-amber" aria-label={`${stars} 星`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = stars >= i + 1;
        const half = !filled && stars >= i + 0.5;
        if (half) {
          return <StarHalf key={i} className="size-4" fill="currentColor" strokeWidth={2} />;
        }
        return (
          <Star
            key={i}
            className={cn('size-4', filled ? 'text-brand-amber' : 'text-border-strong')}
            fill={filled ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
        );
      })}
    </span>
  );
}

function KpiCell({
  label,
  value,
  sub,
  borderLeft,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  borderLeft?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 space-y-0.5 px-3.5 py-2.5',
        borderLeft && 'border-l border-border-soft',
      )}
    >
      <div className="text-2xs font-bold uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      <div
        className={
          typeof value === 'string' || typeof value === 'number'
            ? 'truncate font-display text-xl font-bold leading-none text-foreground tabular-nums'
            : 'flex h-5 items-center text-foreground'
        }
      >
        {value}
      </div>
      <div className="truncate text-2xs text-faint">{sub}</div>
    </div>
  );
}

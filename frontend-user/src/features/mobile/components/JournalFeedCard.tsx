import { memo } from 'react';
import { Bell, Bookmark, FolderPlus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { JournalCover } from '@/shared/components/JournalCover';
import type { JournalListUnified } from '@/shared/api/types';
import { formatNumeric, parseFqbQuartile } from '../api/journal-feed';
import { JournalTrendChart } from './JournalTrendChart';

async function shareJournal(j: JournalListUnified) {
  const url = `${window.location.origin}/journals?keyword=${encodeURIComponent(j.canonical_name)}`;
  const payload = { title: `${j.canonical_name} - Scholay 期刊`, url };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch {
      return;
    }
  }
  await navigator.clipboard.writeText(`${payload.title}\n${url}`);
  toast.success('链接已复制');
}

const comingSoon = () => toast.info('移动端即将上线,敬请期待');

export interface JournalFeedCardProps {
  journal: JournalListUnified;
  /** 是否当前滑到的卡 —— 趋势图详情数据只在激活时拉取 */
  isActive: boolean;
}

/**
 * Feed 期刊卡片 —— 对应 .pen `VcYgL`(Feed / 刷期刊)的 Journal Card + Action Rail。
 * 全出血版式(无外框),右侧浮动操作栏;设计稿的简介段落/分区图示/主题 chips
 * 依赖上游没有的数据(中文简介等),MVP 用指标卡替代视觉重心;
 * 卡内横滑「概览/指标」子页是下一里程碑。
 */
export const JournalFeedCard = memo(function JournalFeedCard({
  journal: j,
  isActive,
}: JournalFeedCardProps) {
  const ifValue = formatNumeric(j.jcr_impact_factor);
  const fqb = parseFqbQuartile(j.fqb_major_quartile);
  const isTop = j.fqb_top === '是';
  const hIndex = j.openalex_h_index;
  const works = j.openalex_works_count;
  const review = formatNumeric(j.scirev_first_review_months);
  const sjr = formatNumeric(j.scimago_sjr);

  const scopeLine = [j.wikidata_label_zh, j.fqb_major_category]
    .filter(Boolean)
    .join(' · ');
  const publisherLine = [j.crossref_publisher, j.openalex_country]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-background py-4 pr-16 pl-5">
      {/* Identity Row(.pen `H9UYGQ`) */}
      <div className="flex shrink-0 items-center gap-3">
        <JournalCover id={j.id} name={j.canonical_name} size="tile" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-2xl leading-tight font-semibold text-foreground">
            {j.canonical_name}
          </h2>
          {scopeLine && (
            <p className="mt-0.5 truncate text-base text-muted-foreground">
              {scopeLine}
            </p>
          )}
          {publisherLine && (
            <p className="mt-0.5 truncate text-xs text-faint">{publisherLine}</p>
          )}
        </div>
      </div>

      {/* Badge Row(.pen `NVHAf`) */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {j.jcr_quartile && (
          <Pill className="bg-brand-green text-white">JCR {j.jcr_quartile}</Pill>
        )}
        {fqb && (
          <Pill className="bg-brand-amber text-white">
            中科院 {fqb}
            {isTop ? ' Top' : ''}
          </Pill>
        )}
        {ifValue && (
          <Pill className="bg-foreground text-white">IF {ifValue}</Pill>
        )}
        {j.ccf_rank && (
          <Pill className="bg-surface-2 text-foreground">CCF {j.ccf_rank}</Pill>
        )}
        {j.openalex_is_oa === 1 && (
          <Pill className="bg-surface-2 text-brand-green">开放获取</Pill>
        )}
        {j.gjqk_warning_level && (
          <Pill className="bg-danger-soft text-brand-red">
            预警 {j.gjqk_warning_level}
          </Pill>
        )}
        {j.issn_l && (
          <Pill className="bg-warning-soft text-foreground">
            ISSN {j.issn_l}
          </Pill>
        )}
      </div>

      {/* 指标卡 —— 设计稿简介/分区图示位置的 MVP 替代(上游无中文简介数据) */}
      <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
        <Metric label="影响因子" value={ifValue ?? '—'} highlight />
        <Metric label="H 指数" value={hIndex != null ? String(hIndex) : '—'} />
        <Metric
          label="累计发文"
          value={works != null ? works.toLocaleString('en-US') : '—'}
        />
        <Metric
          label={review ? '平均初审' : 'SJR'}
          value={review ? `${review} 个月` : (sjr ?? '—')}
        />
      </div>

      {/* 年度趋势折线图(影响因子/发文量/被引量)—— 滑到本卡才拉详情数据 */}
      <JournalTrendChart journalId={j.id} active={isActive} />

      {j.fqb_major_category && (
        <p className="shrink-0 text-sm leading-relaxed text-muted-foreground">
          《{j.canonical_name}》是{j.fqb_major_category}领域
          {j.jcr_quartile === 'Q1' ? '的高影响力' : '的'}学术期刊
          {isTop ? ',中科院分区 Top 期刊' : ''}。
        </p>
      )}

      {/* Action Rail(.pen `uqbBO`):浮动右侧 */}
      <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 flex-col items-center gap-4">
        <RailButton label="收藏" onClick={comingSoon}>
          <Bookmark className="size-5" />
        </RailButton>
        <RailButton label="期刊集" onClick={comingSoon}>
          <FolderPlus className="size-5" />
        </RailButton>
        <RailButton label="分享" onClick={() => void shareJournal(j)}>
          <Share2 className="size-5" />
        </RailButton>
        <RailButton label="关注" onClick={comingSoon}>
          <Bell className="size-5" />
        </RailButton>
      </div>
    </article>
  );
});

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'rounded-pill px-2.5 py-1 text-xs font-semibold',
        className
      )}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface-1 px-3 py-2.5">
      <p className="text-2xs text-faint">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold',
          highlight ? 'text-brand-green' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-12 w-12 items-center justify-center rounded-pill border border-border-strong bg-background text-subtle transition-colors active:bg-surface-2"
      >
        {children}
      </button>
      <span className="text-2xs text-faint">{label}</span>
    </div>
  );
}

import { memo } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { AlignLeft, Heart, Quote, Share2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { JournalCover } from '@/shared/components/JournalCover';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { useDoubleTapFavorite } from '@/shared/hooks';
import { useShareSheet } from '@/stores/share.store';
import type { Paper } from '@/shared/api/types';

/** 万/k 缩写 —— 设计稿口径(被引 12.8万 / 引用此文 2.1k) */
function formatMetric(n: number | undefined): string {
  if (n == null) return '—';
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** 作者行:前两位 + "等 N 位作者"(设计稿口径) */
function formatAuthors(paper: Paper): string | null {
  const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} 等 ${names.length} 位作者`;
}

/** venue 字符串 → 稳定伪 id,喂给 JournalCover 的取色(同 venue 永远同色) */
function venueHash(venue: string): number {
  let h = 0;
  for (let i = 0; i < venue.length; i++) h = (h * 31 + venue.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface PaperFeedCardProps {
  paper: Paper;
  isFavorited: boolean;
  onCite: (paper: Paper) => void;
  /** 收藏/取消成功回调 —— 就地翻转「已收藏」态(多源 feed 用真实源,无需重拉) */
  onFavoriteToggle?: (paperId: string, favorited: boolean) => void;
}

/**
 * Feed 论文卡片 —— 与期刊卡(JournalFeedCard)同一套框架语言(用户拍板):
 * 全出血版式 + Identity 行(venue 字标) + 徽章排 + 指标 2×2 网格 +
 * 摘要段落 + 右侧浮动操作栏。卡内横滑「摘要全文/作者/参考文献」子页是下一里程碑。
 */
export const PaperFeedCard = memo(function PaperFeedCard({
  paper,
  isFavorited,
  onCite,
  onFavoriteToggle,
}: PaperFeedCardProps) {
  const authors = formatAuthors(paper);
  const venue = paper.venue || '未知来源';
  const firstAuthorInitial =
    paper.authors?.[0]?.name?.trim().charAt(0).toUpperCase() ?? '·';
  const openShare = useShareSheet((s) => s.openShare);
  // 双击卡片空白处收藏(Instagram 式)+ ❤️ 弹出
  const { onTap, showHeart } = useDoubleTapFavorite(paper, isFavorited);

  return (
    <article
      onClick={onTap}
      className="relative flex h-full min-h-0 flex-col gap-3.5 overflow-hidden bg-background py-4 pr-16 pl-5"
    >
      {/* 双击收藏的 ❤️ 反馈 */}
      <AnimatePresence>
        {showHeart && (
          <m.div
            key="dt-heart"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-raised flex items-center justify-center"
          >
            <Heart className="size-24 fill-brand-red text-brand-red drop-shadow-lg" />
          </m.div>
        )}
      </AnimatePresence>
      {/* Identity Row(同期刊卡 `H9UYGQ`):venue 字标 + 来源/年份 */}
      <div className="flex shrink-0 items-center gap-3">
        <JournalCover
          id={venueHash(venue)}
          name={venue}
          size="tile"
          className="h-12 w-12 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-md font-semibold text-foreground">{venue}</p>
          <p className="mt-0.5 truncate text-xs text-faint">
            {[paper.year, paper.publicationDate].filter(Boolean).find(Boolean)
              ? `${paper.publicationDate ?? paper.year} 发表`
              : '发表信息暂缺'}
          </p>
        </div>
      </div>

      {/* 标题 + 作者 */}
      <div className="shrink-0">
        <h2 className="line-clamp-3 text-2xl font-semibold text-foreground">
          {paper.title}
        </h2>
        {authors && (
          <p className="mt-1.5 truncate text-base text-muted-foreground">{authors}</p>
        )}
      </div>

      {/* 徽章排(同期刊卡 Tag Row) */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {paper.isOpenAccess && (
          <Pill className="bg-brand-green text-on-brand">开放获取</Pill>
        )}
        {paper.year && (
          <Pill className="bg-foreground text-on-brand">{paper.year}</Pill>
        )}
        {(paper.fieldsOfStudy ?? []).slice(0, 2).map((f) => (
          <Pill key={f} className="bg-surface-2 text-muted-foreground">
            {f}
          </Pill>
        ))}
      </div>

      {/* 指标 2×2 网格(同期刊卡 Metric 网格) */}
      <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
        <Metric label="被引" value={formatMetric(paper.citationCount)} highlight />
        <Metric label="参考文献" value={formatMetric(paper.referenceCount)} />
        <Metric
          label="高影响引用"
          value={formatMetric(paper.influentialCitationCount)}
        />
        <Metric
          label="发表年份"
          value={paper.year ? String(paper.year) : '—'}
        />
      </div>

      {/* 摘要(同期刊卡简介段落的质感;全文留给后续卡内横滑子页) */}
      <div className="min-h-0 shrink">
        {paper.abstract ? (
          <>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-faint">
              <AlignLeft className="size-3" />
              摘要
            </p>
            <p className="mt-1.5 line-clamp-[8] text-sm leading-paragraph text-muted-foreground">
              {paper.abstract}
            </p>
          </>
        ) : (
          <p className="text-sm text-faint">该论文暂无摘要</p>
        )}
      </div>

      {/* 浮动操作栏(同期刊卡 Action Rail):作者 / 收藏 / 分享 / 引用 */}
      <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 flex-col items-center gap-4">
        <RailItem label="作者">
          <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-green">
            <span className="text-lg font-semibold text-on-brand">
              {firstAuthorInitial}
            </span>
          </div>
        </RailItem>
        <RailItem label="收藏">
          <FavoritePaperButton
            paper={paper}
            isFavorited={isFavorited}
            variant="icon"
            size="lg"
            className="h-12 w-12 rounded-pill border border-border-strong bg-surface-card"
            onSuccess={onFavoriteToggle ? () => onFavoriteToggle(paper.paperId, true) : undefined}
            onUnfavorited={onFavoriteToggle ? () => onFavoriteToggle(paper.paperId, false) : undefined}
          />
        </RailItem>
        <RailItem label="分享">
          <RailButton ariaLabel="分享" onClick={() => openShare({ kind: 'single', paper })}>
            <Share2 className="size-5" />
          </RailButton>
        </RailItem>
        <RailItem label="引用">
          <RailButton ariaLabel="引用" onClick={() => onCite(paper)}>
            <Quote className="size-5" />
          </RailButton>
        </RailItem>
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
    <span className={cn('rounded-pill px-2.5 py-1 text-xs font-semibold', className)}>
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
    /* min-h 预留两行高度 —— 数值缺失/到达时不再撑动网格(防 CLS) */
    <div className="min-h-[62px] bg-surface-1 px-3 py-2.5">
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

function RailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <span className="text-2xs text-faint">{label}</span>
    </div>
  );
}

function RailButton({
  ariaLabel,
  onClick,
  children,
}: {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-pill border border-border-strong bg-surface-card text-subtle transition-[transform,background-color] active:scale-90 active:bg-surface-2"
    >
      {children}
    </button>
  );
}

import { memo } from 'react';
import { Share2 } from 'lucide-react';
import { JournalCover } from '@/shared/components/JournalCover';
import { JournalBadges } from '@/shared/components/JournalBadges';
import type { Journal } from '@/shared/api/types';

/**
 * 移动端期刊搜索结果项 —— 推特时间线式连续列表(与论文结果同语言):
 *   左:期刊封面字标;中:刊名 + 出版社·国家 + 分区/IF 徽章 + h-index/收录;右:分享。
 * 主区可点进期刊详情,右上角分享按钮弹全局分享面板(海报/二维码/链接)。
 */
export const MobileJournalResultCard = memo(function MobileJournalResultCard({
  journal,
  onOpen,
  onShare,
}: {
  journal: Journal;
  onOpen: (j: Journal) => void;
  onShare: (j: Journal) => void;
}) {
  const meta =
    [journal.publisher, journal.country].filter(Boolean).join(' · ') ||
    (journal.type ? journal.type : '期刊');

  return (
    <article className="flex items-start gap-3 border-b border-border px-4 py-3.5">
      <button
        type="button"
        onClick={() => onOpen(journal)}
        className="flex min-w-0 flex-1 gap-3 text-left active:opacity-80"
      >
        <JournalCover
          id={journal.id}
          name={journal.canonical_name}
          size="tile"
          className="h-12 w-12 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold text-foreground">
            {journal.canonical_name}
          </p>
          <p className="mt-0.5 truncate text-xs text-faint">{meta}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <JournalBadges enrichment={journal} />
            {journal.openalex_h_index != null && (
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                h-index {journal.openalex_h_index}
              </span>
            )}
            {journal.is_oa && (
              <span className="rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs font-medium text-brand-green">
                开放获取
              </span>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onShare(journal)}
        aria-label="分享期刊"
        className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-pill text-muted-foreground active:bg-surface-2"
      >
        <Share2 className="size-4" />
      </button>
    </article>
  );
});

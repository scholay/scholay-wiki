import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Flame, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  formatHeat,
  isNewsSurging,
  newsRelativeTime,
  newsReportLabel,
  newsSectionTone,
  type NewsCard as NewsCardData,
} from '@/shared/api/news';

/**
 * 移动情报 feed 卡片 —— 整屏一条,与论文/期刊卡同框架语言(纯文为主 + 可选封面图)。
 * 字段:section 彩点 + section_label + 相对时间 / title(h2)/ summary / meta(来源·热度·快讯标)。
 * 整卡可点 → /news/:slug(同 URL 响应式详情,保 SEO)。
 */
export const NewsCard = memo(function NewsCard({ item }: { item: NewsCardData }) {
  const navigate = useNavigate();
  const tone = newsSectionTone(item.section);
  const source = item.sources?.[0]?.label;
  const surging = isNewsSurging(item.heat_trend);
  const reportLabel = newsReportLabel(item.report_type);

  return (
    <article
      onClick={() => navigate(`/news/${item.slug}`)}
      className="relative flex h-full min-h-0 flex-col gap-3.5 overflow-hidden bg-background px-5 py-4"
    >
      {/* 顶部:section 彩点 + 版块名 + 相对时间 */}
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <span className={cn('size-1.5 rounded-pill', tone.dot)} />
        <span className={cn('font-semibold', tone.text)}>{item.section_label || '情报'}</span>
        <span className="text-faint">·</span>
        <span className="inline-flex items-center gap-1 text-faint">
          <Clock className="size-3" />
          {newsRelativeTime(item.published_at)}
        </span>
        {item.is_featured && (
          <span className="ml-auto rounded-pill bg-brand-red px-2 py-0.5 text-2xs font-semibold text-white">
            头条
          </span>
        )}
      </div>

      {/* 可选封面图(上游链接直用) */}
      {item.cover_image && (
        <img
          src={item.cover_image}
          alt=""
          loading="lazy"
          className="h-44 w-full shrink-0 rounded-md object-cover"
        />
      )}

      {/* 标题 */}
      <h2 className="line-clamp-3 shrink-0 text-2xl font-semibold text-foreground">
        {item.title}
      </h2>

      {/* 摘要 */}
      <div className="min-h-0 shrink">
        <p
          className={cn(
            'leading-paragraph text-muted-foreground',
            item.cover_image ? 'line-clamp-[6] text-sm' : 'line-clamp-[12] text-base',
          )}
        >
          {item.summary}
        </p>
      </div>

      {/* meta 行:快讯标 / 来源 / 热度 / 飙升 */}
      <div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-muted-foreground">
          {reportLabel}
        </span>
        {source && (
          <span className="truncate text-muted-foreground">来源 · {source}</span>
        )}
        {item.heat_external > 0 && (
          <span className="inline-flex items-center gap-0.5 text-faint">
            <Flame className="size-3.5" />
            {formatHeat(item.heat_external)}
          </span>
        )}
        {surging && (
          <span className="inline-flex items-center gap-0.5 rounded-pill bg-danger-soft px-1.5 py-0.5 font-semibold text-brand-red">
            <TrendingUp className="size-3" />
            飙升
          </span>
        )}
      </div>

      {/* 看全文提示 */}
      <div className="pointer-events-none absolute right-4 bottom-3 flex items-center gap-0.5 text-2xs text-faint">
        全文
        <ChevronRight className="size-3" />
      </div>
    </article>
  );
});

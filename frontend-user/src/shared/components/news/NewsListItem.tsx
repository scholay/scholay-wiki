import { Link } from 'react-router-dom';
import { Clock, Flame, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  formatHeat,
  isNewsSurging,
  newsRelativeTime,
  newsReportLabel,
  newsSectionTone,
  type NewsCard,
} from '@/shared/api/news';

/**
 * PC 情报信息流卡片(纯展示,props-in)—— 首页情报区主流 + /news 列表页共用。
 * 整卡 Link → /news/:slug;不取正文(列表只展示卡片字段)。
 */
export function NewsListItem({ item }: { item: NewsCard }) {
  const tone = newsSectionTone(item.section);
  const source = item.sources?.[0]?.label;
  const surging = isNewsSurging(item.heat_trend);

  return (
    <Link
      to={`/news/${item.slug}`}
      className="group flex gap-4 rounded-md border border-border-soft bg-background p-4 transition-all hover:border-foreground/30 hover:"
    >
      {item.cover_image && (
        <img
          src={item.cover_image}
          alt=""
          loading="lazy"
          className="hidden size-24 shrink-0 rounded-md object-cover sm:block"
        />
      )}
      <div className="min-w-0 flex-1">
        {/* 顶行:头条 + 版块 + 热度 + 时间 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {item.is_featured && (
            <span className="rounded-sm bg-brand-red px-1.5 py-0.5 text-2xs font-semibold text-white">
              头条
            </span>
          )}
          <span className={cn('inline-flex items-center gap-1 font-medium', tone.text)}>
            <span className={cn('size-1.5 rounded-pill', tone.dot)} />
            {item.section_label || '情报'}
          </span>
          {item.heat_external > 0 && (
            <span className="inline-flex items-center gap-0.5 text-faint">
              <Flame className="size-3" />
              {formatHeat(item.heat_external)}
            </span>
          )}
          {surging && (
            <span className="inline-flex items-center gap-0.5 text-brand-red">
              <TrendingUp className="size-3" />
              飙升
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-faint">
            <Clock className="size-3" />
            {newsRelativeTime(item.published_at)}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="mt-1.5 line-clamp-2 text-base font-bold text-foreground group-hover:text-brand-red">
          {item.title}
        </h3>

        {/* 摘要 */}
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-paragraph text-muted-foreground">
            {item.summary}
          </p>
        )}

        {/* 底行:来源 + 快讯/今日要览 */}
        <div className="mt-2 flex items-center gap-2 text-2xs text-faint">
          <span className="rounded-sm bg-surface-1 px-1.5 py-0.5">
            {newsReportLabel(item.report_type)}
          </span>
          {source && <span className="truncate">来源 · {source}</span>}
        </div>
      </div>
    </Link>
  );
}

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
  newsSourceLabel,
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
  const source = newsSourceLabel(item.sources?.[0]?.label);
  const surging = isNewsSurging(item.heat_trend);
  const reportLabel = newsReportLabel(item.report_type);
  // 封面判定单点化:图片渲染与摘要密度分支必须同源 —— 「有 thumb 无 cover_image」
  // 是真实可达状态(上游撤图后 thumb 列要等异步清理/回填收敛),两处各判会出现
  // 「图渲染了、摘要却按无图排 12 行」被 overflow 硬裁的错位。
  const hasCover = !!(item.cover_thumb || item.cover_image);

  return (
    <article
      onClick={() => navigate(`/news/${item.slug}`)}
      className="relative flex h-full min-h-0 flex-col gap-3.5 overflow-hidden bg-background px-5 py-4"
    >
      {/* 顶部:section 彩点 + 版块名 + 相对时间 */}
      <div className="flex shrink-0 items-center gap-2 text-12">
        <span className={cn('size-1.5 rounded-pill', tone.dot)} />
        <span className={cn('font-medium', tone.text)}>{item.section_label || '情报'}</span>
        <span className="text-faint">·</span>
        <span className="inline-flex items-center gap-1 text-faint">
          <Clock className="size-3" />
          {newsRelativeTime(item.published_at)}
        </span>
        {item.is_featured && (
          <span className="ml-auto rounded-pill bg-brand-red px-2 py-0.5 text-12 font-medium text-on-brand">
            头条
          </span>
        )}
      </div>

      {/* 可选封面图 —— 优先本站缩略图(~640px,秒开),没有再回落上游原图;
          onError 兜换图窗口(旧 thumb 已删、DTO 还在 5min staleTime 内)的 404 */}
      {hasCover && (
        <img
          src={item.cover_thumb || item.cover_image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            if (item.cover_image && !img.dataset.fellBack) {
              img.dataset.fellBack = '1';
              img.src = item.cover_image;
            }
          }}
          className="h-44 w-full shrink-0 rounded-16 object-cover"
        />
      )}

      {/* 标题 */}
      <h2 className="line-clamp-3 shrink-0 text-24 font-medium text-foreground">
        {item.title}
      </h2>

      {/* 摘要 */}
      <div className="min-h-0 shrink">
        <p
          className={cn(
            'leading-paragraph text-muted-foreground',
            hasCover ? 'line-clamp-[6] text-12' : 'line-clamp-[12] text-14',
          )}
        >
          {item.summary}
        </p>
      </div>

      {/* meta 行:快讯标 / 来源 / 热度 / 飙升 */}
      <div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 text-12">
        {/* shrink-0 whitespace-nowrap:同 PC 卡 —— 否则长来源名会把 chip 挤到内部换行 */}
        <span className="shrink-0 whitespace-nowrap rounded-pill bg-surface-2 px-2 py-0.5 text-muted-foreground">
          {reportLabel}
        </span>
        {source && (
          <span className="min-w-0 truncate text-muted-foreground">来源 · {source}</span>
        )}
        {item.heat_external > 0 && (
          <span className="inline-flex items-center gap-0.5 text-faint">
            <Flame className="size-3.5" />
            {formatHeat(item.heat_external)}
          </span>
        )}
        {surging && (
          <span className="inline-flex items-center gap-0.5 rounded-pill bg-danger-soft px-1.5 py-0.5 font-medium text-brand-red">
            <TrendingUp className="size-3" />
            飙升
          </span>
        )}
      </div>

      {/* 看全文提示 */}
      <div className="pointer-events-none absolute right-4 bottom-3 flex items-center gap-0.5 text-12 text-faint">
        全文
        <ChevronRight className="size-3" />
      </div>
    </article>
  );
});

import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Flame, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  formatHeat,
  isNewsSurging,
  newsRelativeTime,
  newsReportLabel,
  newsSectionTone,
  newsSourceLabel,
  type NewsCard,
} from '@/shared/api/news';

/**
 * PC 情报信息流卡片(纯展示,props-in)—— 首页情报区主流 + /news 列表页共用。
 * 整卡 Link → /news/:slug;不取正文(列表只展示卡片字段)。
 */
// memo:消费方 NewsListPage 是 useInfiniteQuery 无限列表,「加载更多」时 items 全量重建,
// 但 react-query 结构共享保证旧 item 引用稳定 → memo 直接命中,已加载页不重渲
// (移动端对应组件 NewsCard / JournalFeedCard / PaperFeedCard 均已同款 memo)。
export const NewsListItem = memo(function NewsListItem({ item, deferDetails = false }: { item: NewsCard; deferDetails?: boolean }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [detailsVisible, setDetailsVisible] = useState(!deferDetails);
  // 父级取消延迟时应在当次 render 立即展示，不等 effect 再同步一份 state。
  const showDetails = !deferDetails || detailsVisible;
  const tone = newsSectionTone(item.section);
  // 剥掉上游 label 尾部自带的日期 —— 时间由右上角的 published_at 单点负责,
  // 同卡两套日期表述是设计评审点出的问题。
  const source = newsSourceLabel(item.sources?.[0]?.label);
  const surging = isNewsSurging(item.heat_trend);

  useEffect(() => {
    if (!deferDetails || detailsVisible) return;
    const node = linkRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setDetailsVisible(true);
      return;
    }
    const root = node.closest<HTMLElement>('[data-news-scroll]');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setDetailsVisible(true);
        observer.disconnect();
      },
      { root, rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [deferDetails, detailsVisible]);

  return (
    <Link
      ref={linkRef}
      to={`/news/${item.slug}`}
      className="group flex gap-4 rounded-16 border border-border-soft bg-surface-card p-4 transition-all hover:border-foreground/30"
      style={deferDetails ? { minHeight: 132 } : undefined}
    >
      {!showDetails ? (
        <>
          {/* 保留真实 Link、标题语义与浏览器页内查找能力；系统字体只用于这个
              1px 裁剪的可访问文本，不会为尚未可见的摘要抢下 Noto 字体分片。 */}
          <h3 className="sr-only" style={{ fontFamily: 'Arial, sans-serif' }}>
            {item.title}
          </h3>
          <span aria-hidden className="h-20 w-full animate-pulse rounded-12 bg-surface-1" />
        </>
      ) : (
        <>
          {(item.cover_thumb || item.cover_image) && (
            /* 优先本站缩略图(后端生成,~640px JPEG);fetchPriority=low:列表配图
               永远让位于导航/正文请求 —— 首页曾因原图抢带宽把全站点击拖死(2026-08)。
               onError:上游换图后旧 thumb 对象会被后端删除,拿着 5min staleTime 旧 DTO
               的用户会 404 —— 运行时降级回原图,不留空白占位框。 */
            <img
              src={item.cover_thumb || item.cover_image}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onError={(e) => {
                const img = e.currentTarget;
                if (item.cover_image && !img.dataset.fellBack) {
                  img.dataset.fellBack = '1';
                  img.src = item.cover_image;
                }
              }}
              className="hidden size-24 shrink-0 rounded-12 object-cover sm:block"
            />
          )}
          <div className="min-w-0 flex-1">
            {/* 顶行:头条 + 版块 + 热度 + 时间 */}
            <div className="flex flex-wrap items-center gap-2 text-12">
              {item.is_featured && (
                <span className="rounded-4 bg-brand-red px-1.5 py-0.5 text-12 font-medium text-on-brand">
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
            <h3 className="mt-1.5 line-clamp-2 text-16 font-medium text-foreground group-hover:text-brand-red">
              {item.title}
            </h3>

            {/* 摘要 */}
            {item.summary && (
              <p className="mt-1 line-clamp-2 text-14 leading-paragraph text-muted-foreground">
                {item.summary}
              </p>
            )}

            {/* 底行:快讯/今日要览 + 来源。
                shrink-0 whitespace-nowrap:chip 不参与压缩 —— 没有它时旁边的长来源名会把
                chip 挤窄,「今日要览」四个字在里面折成两行(设计评审报的换行 bug)。
                min-w-0:让 truncate 真的能生效,压缩由来源名承担。 */}
            <div className="mt-2 flex items-center gap-2 text-12 text-faint">
              <span className="shrink-0 whitespace-nowrap rounded-4 bg-surface-1 px-1.5 py-0.5">
                {newsReportLabel(item.report_type)}
              </span>
              {source && <span className="min-w-0 truncate">来源 · {source}</span>}
            </div>
          </div>
        </>
      )}
    </Link>
  );
});

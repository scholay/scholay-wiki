import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { useHorizontalSwipe } from '@/shared/hooks';
import {
  flattenNewsPages,
  useNewsFeedInfinite,
  NEWS_FEED_PAGE_SIZE,
  type NewsSort,
} from '@/shared/api/news';
import { NewsCard } from '../components/NewsCard';
import { FeedTopTabs } from '../components/FeedTopTabs';
import { VerticalSwipeFeed } from '../components/VerticalSwipeFeed';

const LOADING_HINTS = [
  '正在为你汇集学术情报…',
  '顶刊速递 · 重大事件 · 国内政策…',
  '上下滑动查看下一条',
];

const SORTS: { key: NewsSort; label: string }[] = [
  { key: 'latest', label: '实时' },
  { key: 'heat', label: '热榜' },
];

/**
 * 刷情报 feed —— /m/feed 第三个 tab。复用 VerticalSwipeFeed 引擎,但数据是
 * 确定性时间/热度全序(useNewsFeedInfinite,非随机 seed):下拉刷新 = invalidate 同 key
 * 拿含最新条目的第一页;不接 feed-seed/feed-cache/feed-position 三件套(见情报调研 02 C1~C5)。
 */
export function NewsPage() {
  const [sort, setSort] = useState<NewsSort>('latest');
  const feedQ = useNewsFeedInfinite(sort, '');
  const items = useMemo(() => flattenNewsPages(feedQ.data?.pages), [feedQ.data]);

  const qc = useQueryClient();
  const navigate = useNavigate();
  // 横滑切 tab:情报 →(右滑)期刊。被动检测,不干扰纵向 embla。
  const swipe = useHorizontalSwipe({
    onSwipeRight: () => navigate('/m/feed/journals', { replace: true }),
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQ;
  const onPrefetch = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  // 下拉刷新 = 拉含最新条目的第一页(情报是确定全序,refetch 同 key 即得新内容)。
  const handleRefresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ['news', 'feed', sort, ''] }),
    [qc, sort],
  );

  return (
    <div className="flex h-full flex-col">
      <FeedTopTabs active="intel" />

      {/* 实时 / 热榜 切换(轻量 pill,非顶级 tab) */}
      <div className="flex shrink-0 items-center gap-1.5 bg-background px-4 pb-2">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={cn(
              'rounded-pill px-3 py-1 text-12 font-medium transition-colors',
              sort === s.key
                ? 'bg-foreground text-background'
                : 'bg-surface-2 text-muted-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1" {...swipe}>
        <VerticalSwipeFeed
          key={sort}
          items={items}
          itemKey={(n) => n.slug}
          pageSize={NEWS_FEED_PAGE_SIZE}
          onPrefetch={onPrefetch}
          canPrefetch={!!hasNextPage && !isFetchingNextPage}
          isLoading={feedQ.isLoading}
          isFetchingMore={isFetchingNextPage}
          isError={feedQ.isError}
          onRetry={() => void feedQ.refetch()}
          onEmptyRetry={() => void feedQ.refetch()}
          onRefresh={handleRefresh}
          loadingHints={LOADING_HINTS}
          errorText="情报加载失败,请检查网络后重试"
          swipeHint="上滑 · 下一条情报"
          swipeHintClassName="bottom-3"
          slideClassName="pb-0"
          renderPlaceholder={() => <div className="h-full bg-background" />}
          renderCard={(item) => <NewsCard item={item} />}
        />
      </div>
    </div>
  );
}

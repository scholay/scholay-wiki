import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { JournalCover } from '@/shared/components/JournalCover';
import { useHorizontalSwipe } from '@/shared/hooks';
import { getFeedSeed, rotateFeedSeed } from '@/shared/lib/feed-seed';
import { persistFeedPages } from '@/shared/lib/feed-cache';
import { getFeedPosition, setFeedPosition } from '@/shared/lib/feed-position';
import {
  useJournalFeed,
  flattenJournalPages,
  formatNumeric,
  journalFeedKey,
  JOURNAL_FEED_PAGE_SIZE,
} from '../api/journal-feed';
import { JournalFeedCard } from '../components/JournalFeedCard';
import { FeedTopTabs } from '../components/FeedTopTabs';
import { VerticalSwipeFeed } from '../components/VerticalSwipeFeed';

const LOADING_HINTS = [
  '正在为你整理高分期刊…',
  '影响因子从高到低排好了',
  '上下滑动即可切换期刊',
];

/**
 * 刷期刊 feed(.pen `VcYgL` Feed / 刷期刊)。
 * 与刷论文共用 VerticalSwipeFeed 引擎;差异:全出血卡片 + 底部「下一刊 peek」条
 * (点击直接滑到下一刊,.pen `RSOTM` Next Card Peek)。
 */
export function JournalFeedPage() {
  const [seed, setSeed] = useState(getFeedSeed);
  const feedQ = useJournalFeed(seed);
  const journals = useMemo(
    () => flattenJournalPages(feedQ.data?.pages),
    [feedQ.data]
  );
  // 二次进入接着上次位置往后刷(seed 一致才恢复;下拉刷新换 seed 自然从头)
  const initialIndex = useMemo(() => getFeedPosition('journals', seed), [seed]);

  // 持久化前几页 → 下次进入无缝显示上次内容(只在 ≤3 页时写,避免写放大)
  const qc = useQueryClient();
  useEffect(() => {
    if (feedQ.data && feedQ.data.pages.length <= 3) {
      persistFeedPages('journals', seed, feedQ.data.pages, feedQ.data.pageParams);
    }
  }, [feedQ.data, seed]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQ;
  const onPrefetch = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  // 横滑切 tab:期刊 →(右滑)论文 /(左滑)情报。被动检测,不干扰纵向 embla。
  const navigate = useNavigate();
  const swipe = useHorizontalSwipe({
    onSwipeRight: () => navigate('/m/feed', { replace: true }),
    onSwipeLeft: () => navigate('/m/feed/news', { replace: true }),
  });

  // 下拉刷新:回收旧 seed 查询 → 换 seed(换排序维度/起始页)→ 刷出一批不同期刊
  const handleRefresh = useCallback(() => {
    qc.removeQueries({ queryKey: journalFeedKey(seed) });
    setSeed(rotateFeedSeed());
  }, [qc, seed]);

  return (
    <div className="flex h-full flex-col">
      <FeedTopTabs active="journals" />

      <div className="min-h-0 flex-1" {...swipe}>
        <VerticalSwipeFeed
          key={seed}
          items={journals}
          itemKey={(j) => j.id}
          initialIndex={initialIndex}
          onIndexChange={(i) => setFeedPosition('journals', seed, i)}
          pageSize={JOURNAL_FEED_PAGE_SIZE}
          onPrefetch={onPrefetch}
          canPrefetch={!!hasNextPage && !isFetchingNextPage}
          isLoading={feedQ.isLoading}
          isFetchingMore={isFetchingNextPage}
          isError={feedQ.isError}
          onRetry={() => void feedQ.refetch()}
          onEmptyRetry={handleRefresh}
          onRefresh={handleRefresh}
          loadingHints={LOADING_HINTS}
          errorText="期刊加载失败,请检查网络后重试"
          swipeHint="上滑 · 下一本期刊"
          swipeHintClassName="bottom-24"
          slideClassName="pb-0"
          renderPlaceholder={() => <div className="h-full bg-background" />}
          renderCard={(j, _i, isActive) => (
            <JournalFeedCard journal={j} isActive={isActive} />
          )}
          renderPeek={(next) => (
            /* 下一刊 peek(.pen `RSOTM`):顶圆角 14 来自设计稿,token 无对应档位 */
            <div className="flex items-center gap-2.5 rounded-t-16 border border-b-0 border-border bg-surface-1/90 px-4 py-3">
              <JournalCover
                id={next.id}
                name={next.canonical_name}
                size="tile"
                className="h-9 w-9 rounded-8"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-14 font-medium text-foreground">
                  {next.canonical_name}
                </p>
                <p className="truncate text-12 text-faint">
                  {[
                    next.fqb_major_category,
                    formatNumeric(next.jcr_impact_factor)
                      ? `影响因子 ${formatNumeric(next.jcr_impact_factor)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '上滑查看'}
                </p>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

import { useCallback, useMemo } from 'react';
import { JournalCover } from '@/shared/components/JournalCover';
import {
  useJournalFeed,
  flattenJournalPages,
  formatNumeric,
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
  const feedQ = useJournalFeed();
  const journals = useMemo(
    () => flattenJournalPages(feedQ.data?.pages),
    [feedQ.data]
  );

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQ;
  const onPrefetch = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return (
    <div className="flex h-full flex-col">
      <FeedTopTabs active="journals" />

      <div className="min-h-0 flex-1">
        <VerticalSwipeFeed
          items={journals}
          itemKey={(j) => j.id}
          pageSize={JOURNAL_FEED_PAGE_SIZE}
          onPrefetch={onPrefetch}
          canPrefetch={!!hasNextPage && !isFetchingNextPage}
          isLoading={feedQ.isLoading}
          isError={feedQ.isError}
          onRetry={() => void feedQ.refetch()}
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
            <div className="flex items-center gap-2.5 rounded-t-[14px] border border-b-0 border-border bg-surface-1/90 px-4 py-3">
              <JournalCover
                id={next.id}
                name={next.canonical_name}
                size="tile"
                className="h-9 w-9 rounded-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-md font-semibold text-foreground">
                  {next.canonical_name}
                </p>
                <p className="truncate text-xs text-faint">
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

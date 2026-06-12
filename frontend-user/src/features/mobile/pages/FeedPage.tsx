import { useCallback, useMemo, useState } from 'react';
import { CitationDialog } from '@/shared/components/CitationDialog';
import { useFavoriteCheck } from '@/shared/api/user-library-mutations';
import type { Paper } from '@/shared/api/types';
import { usePaperFeed, flattenFeedPages, FEED_PAGE_SIZE } from '../api/feed';
import { PaperFeedCard } from '../components/PaperFeedCard';
import { FeedTopTabs } from '../components/FeedTopTabs';
import { VerticalSwipeFeed } from '../components/VerticalSwipeFeed';

const LOADING_HINTS = [
  '正在为你捞取论文…',
  '跨越 CS / 生医 / 材料 / 能源…',
  '上下滑动即可切换论文',
];

/**
 * 刷论文 feed(.pen `tdZMB` Feed / 刷论文)。
 * 滑动引擎与状态机收口在 VerticalSwipeFeed(与刷期刊共用),
 * 本页只管:数据源(usePaperFeed)+ 收藏态批查 + 卡片渲染 + 引用弹窗。
 */
export function FeedPage() {
  const feedQ = usePaperFeed();
  const papers = useMemo(
    () => flattenFeedPages(feedQ.data?.pages),
    [feedQ.data]
  );

  const paperIds = useMemo(() => papers.map((p) => p.paperId), [papers]);
  const favQ = useFavoriteCheck('stc', paperIds);
  const favoritedIds = favQ.data;

  const [citePaper, setCitePaper] = useState<Paper | null>(null);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQ;
  const onPrefetch = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return (
    <div className="flex h-full flex-col">
      <FeedTopTabs active="papers" />

      <div className="min-h-0 flex-1">
        <VerticalSwipeFeed
          items={papers}
          itemKey={(p) => p.paperId}
          pageSize={FEED_PAGE_SIZE}
          onPrefetch={onPrefetch}
          canPrefetch={!!hasNextPage && !isFetchingNextPage}
          isLoading={feedQ.isLoading}
          isError={feedQ.isError}
          onRetry={() => void feedQ.refetch()}
          loadingHints={LOADING_HINTS}
          errorText="论文加载失败,请检查网络后重试"
          swipeHint="上滑 · 下一篇论文"
          swipeHintClassName="bottom-24"
          slideClassName="pb-0"
          renderPlaceholder={() => <div className="h-full bg-background" />}
          renderCard={(paper) => (
            <PaperFeedCard
              paper={paper}
              isFavorited={favoritedIds?.has(paper.paperId) ?? false}
              onCite={setCitePaper}
            />
          )}
          renderPeek={(next) => (
            /* 下一篇 peek(同期刊卡 `RSOTM`):顶圆角 14 来自设计稿,token 无对应档位 */
            <div className="flex items-center gap-2.5 rounded-t-[14px] border border-b-0 border-border bg-surface-1/90 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-md font-semibold text-foreground">
                  {next.title}
                </p>
                <p className="truncate text-xs text-faint">
                  {[next.venue, next.year ? `${next.year}` : null]
                    .filter(Boolean)
                    .join(' · ') || '上滑查看'}
                </p>
              </div>
            </div>
          )}
        />
      </div>

      <CitationDialog
        open={citePaper != null}
        onOpenChange={(open) => {
          if (!open) setCitePaper(null);
        }}
        paper={citePaper}
      />
    </div>
  );
}

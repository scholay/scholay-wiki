import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CitationDialog } from '@/shared/components/CitationDialog';
import { useHorizontalSwipe } from '@/shared/hooks';
import { getFeedSeed, rotateFeedSeed } from '@/shared/lib/feed-seed';
import { persistFeedPages } from '@/shared/lib/feed-cache';
import { getFeedPosition, setFeedPosition } from '@/shared/lib/feed-position';
import type { Paper } from '@/shared/api/types';
import { usePaperFeed, flattenFeedPages, paperFeedKey, FEED_PAGE_SIZE } from '../api/feed';
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
 * 数据源 usePaperFeed(seed):seed 驱动随机(主题打乱+三源穿插+offset 抖动,偏最新);
 * 收藏态用后端逐篇标注的 paper.isFavorited(多源各按真实源)+ 本地 override 即时翻转;
 * 下拉刷新 = 换 seed 刷一批新内容。
 */
export function FeedPage() {
  const [seed, setSeed] = useState(getFeedSeed);
  const feedQ = usePaperFeed(seed);
  const papers = useMemo(() => flattenFeedPages(feedQ.data?.pages), [feedQ.data]);
  // 二次进入接着上次位置往后刷(seed 一致才恢复;下拉刷新换 seed 自然从头)
  const initialIndex = useMemo(() => getFeedPosition('papers', seed), [seed]);

  // 现场收藏/取消的本地翻转(优先于服务端初值);收藏走每篇真实源,'综合' 只是检索路由
  const [favOverrides, setFavOverrides] = useState<Map<string, boolean>>(() => new Map());
  const handleFavToggle = useCallback((id: string, fav: boolean) => {
    setFavOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, fav);
      return next;
    });
  }, []);

  // 持久化前几页(够无缝首屏即可)→ 下次任意入口进入先无缝显示上次内容。
  // 只在 ≤3 页时写,避免越划越深时每页都重写整个缓冲(写放大)。
  const qc = useQueryClient();
  useEffect(() => {
    if (feedQ.data && feedQ.data.pages.length <= 3) {
      persistFeedPages('papers', seed, feedQ.data.pages, feedQ.data.pageParams);
    }
  }, [feedQ.data, seed]);

  const [citePaper, setCitePaper] = useState<Paper | null>(null);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQ;
  const onPrefetch = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  // 横滑切 tab:论文 →(左滑)期刊。被动检测,不干扰纵向 embla。
  const navigate = useNavigate();
  const swipe = useHorizontalSwipe({
    onSwipeLeft: () => navigate('/m/feed/journals', { replace: true }),
  });

  // 下拉刷新:回收旧 seed 的查询缓存(避免反复刷新堆积)→ 换 seed → 新查询 → 刷一批新内容
  const handleRefresh = useCallback(() => {
    qc.removeQueries({ queryKey: paperFeedKey(seed) });
    setSeed(rotateFeedSeed());
  }, [qc, seed]);

  return (
    <div className="flex h-full flex-col">
      <FeedTopTabs active="papers" />

      <div className="min-h-0 flex-1" {...swipe}>
        <VerticalSwipeFeed
          key={seed}
          items={papers}
          itemKey={(p) => p.paperId}
          initialIndex={initialIndex}
          onIndexChange={(i) => setFeedPosition('papers', seed, i)}
          pageSize={FEED_PAGE_SIZE}
          onPrefetch={onPrefetch}
          canPrefetch={!!hasNextPage && !isFetchingNextPage}
          isLoading={feedQ.isLoading}
          isFetchingMore={isFetchingNextPage}
          isError={feedQ.isError}
          onRetry={() => void feedQ.refetch()}
          onEmptyRetry={handleRefresh}
          onRefresh={handleRefresh}
          loadingHints={LOADING_HINTS}
          errorText="论文加载失败,请检查网络后重试"
          swipeHint="上滑 · 下一篇论文"
          swipeHintClassName="bottom-24"
          slideClassName="pb-0"
          renderPlaceholder={() => <div className="h-full bg-background" />}
          renderCard={(paper) => (
            <PaperFeedCard
              paper={paper}
              isFavorited={favOverrides.get(paper.paperId) ?? paper.isFavorited ?? false}
              onCite={setCitePaper}
              onFavoriteToggle={handleFavToggle}
            />
          )}
          renderPeek={(next) => (
            /* 下一篇 peek(同期刊卡 `RSOTM`):顶圆角 14 来自设计稿,token 无对应档位 */
            <div className="flex items-center gap-2.5 rounded-t-16 border border-b-0 border-border bg-surface-1/90 px-4 py-3">
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

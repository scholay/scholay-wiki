import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { isPhoneDevice } from '@/shared/lib/device';
import { getFeedSeed } from '@/shared/lib/feed-seed';
import { hydrateFeed } from '@/shared/lib/feed-cache';
import { paperFeedKey, prefetchPaperFeed } from '../api/feed';
import { journalFeedKey, prefetchJournalFeed } from '../api/journal-feed';

/**
 * feed 路由预取器 —— 只随 /m/feed* 的嵌套路由布局挂载。
 *
 * 进入应用时(仅手机):
 *   1. feed query 本身通过 initialData 同步读本地缓存，首帧即时显示；
 *   2. 这里再为另一个未挂载 tab 灌缓存并 prefetch 论文 / 期刊首页 ——
 *      已被本地缓存灌满(同 seed、staleTime=Infinity)则是 no-op,
 *      冷启动(无缓存)才真正拉一次,作为数据准备,用户进 feed 不等待。
 *
 * 其他移动版块、桌面/后台/帮助/分享页都不会下载这段代码或预取 feed。
 */
export function FeedPrefetcher() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isPhoneDevice()) return;
    const seed = getFeedSeed();
    // 当前 tab 的首帧由 useInfiniteQuery.initialData 保证；这两次灌入
    // 主要是让未挂载的另一 tab 也能在空闲预取前命中本地缓存。
    hydrateFeed(qc, 'papers', seed, paperFeedKey(seed));
    hydrateFeed(qc, 'journals', seed, journalFeedKey(seed));
    // 真正的上游预取推迟到浏览器空闲:冷启动命中 SEO 落地页 / 分享深链时,用户未必会去 /m/feed,
    // 立即 prefetch 会与落地路由自身的请求抢带宽。命中本地缓存(同 seed)则是 no-op。
    const run = () => {
      prefetchPaperFeed(qc, seed);
      prefetchJournalFeed(qc, seed);
    };
    let handle: number;
    const useIdle = typeof window.requestIdleCallback === 'function';
    if (useIdle) handle = window.requestIdleCallback(run, { timeout: 3000 });
    else handle = window.setTimeout(run, 1500);
    return () => {
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // 仅应用加载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** 保持 /m/feed、/m/feed/journals、/m/feed/news URL 不变的轻量嵌套路由布局。 */
export function FeedPrefetchLayout() {
  return (
    <>
      <FeedPrefetcher />
      <Outlet />
    </>
  );
}

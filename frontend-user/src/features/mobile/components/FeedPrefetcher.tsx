import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isPhoneDevice } from '@/shared/lib/device';
import { getFeedSeed } from '@/shared/lib/feed-seed';
import { hydrateFeed } from '@/shared/lib/feed-cache';
import { paperFeedKey, prefetchPaperFeed } from '../api/feed';
import { journalFeedKey, prefetchJournalFeed } from '../api/journal-feed';

/**
 * 全局 feed 预取器 —— 由 Providers 挂一份(全站唯一),覆盖所有入口
 * (/m/* 移动壳、/ 桌面壳下的论文详情等 SEO 落地页、分享页…)。
 *
 * 进入应用时(仅手机):
 *   1. 先把本地缓存灌进 query cache(hydrateFeed)→ 到 feed 页即时显示上次内容(无缝);
 *   2. 再 prefetch 论文 / 期刊首页 —— 已被本地缓存灌满(同 seed、staleTime=Infinity)则是 no-op,
 *      冷启动(无缓存)才真正拉一次,作为数据准备,用户进 feed 不等待。
 *
 * 桌面不渲染 feed,直接跳过(isPhoneDevice=false),不浪费上游配额。
 */
export function FeedPrefetcher() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isPhoneDevice()) return;
    const seed = getFeedSeed();
    // 本地缓存灌入是纯内存操作(零网络),立即做 → 进 feed 即时显示上次内容(无缝)。
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

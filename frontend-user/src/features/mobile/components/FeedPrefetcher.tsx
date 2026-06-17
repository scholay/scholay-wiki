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
    hydrateFeed(qc, 'papers', seed, paperFeedKey(seed));
    hydrateFeed(qc, 'journals', seed, journalFeedKey(seed));
    prefetchPaperFeed(qc, seed);
    prefetchJournalFeed(qc, seed);
    // 仅应用加载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

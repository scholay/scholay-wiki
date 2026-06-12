import { useInfiniteQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { Paper } from '@/shared/api/types';

/** 每次请求取多少篇(一个种子词一页) */
export const FEED_PAGE_SIZE = 10;

/** 最多翻多少"页"(种子词 × 轮次) —— 防止划到天荒地老还在打上游 */
const FEED_MAX_PAGES = 48;

/**
 * Feed 种子词池 —— MVP 阶段用现有公开搜索接口喂 feed(技术选型决策:零后端改动起步)。
 *
 * 每个 pageParam 轮换一个种子词;轮完一圈后 offset + FEED_PAGE_SIZE 继续深翻,
 * 跨学科覆盖 CS / 生医 / 材料 / 能源 / 地学,保证刷起来不是单一领域。
 *
 * 后续切换真推荐端点(热门 + 随机 + 正负例个性化)时只动本文件,组件层无感。
 */
const SEED_QUERIES = [
  'large language models',
  'CRISPR gene editing',
  'cancer immunotherapy',
  'climate change mitigation',
  'quantum computing',
  'graph neural networks',
  'perovskite solar cells',
  'gut microbiome',
  'reinforcement learning',
  'single-cell RNA sequencing',
  'lithium battery energy storage',
  'protein structure prediction',
];

/**
 * 论文 feed 无限滚动 —— 上下滑动刷论文的数据层。
 *
 * 与 features/search 的 useSearchPapers 同源(POST /public/papers/search),
 * 但语义不同:feed 不带用户 query、按种子词轮换持续供给,所以独立成 hook
 * 而不是复用搜索 hook(搜索那边 query 为空直接 disabled)。
 */
export function usePaperFeed() {
  return useInfiniteQuery({
    queryKey: ['mobile', 'feed', 'papers'],
    initialPageParam: 0,
    getNextPageParam: (_lastPage: Paper[], allPages: Paper[][]) =>
      allPages.length >= FEED_MAX_PAGES ? undefined : allPages.length,
    // feed 内容无个性化、无实时性要求,10 分钟内复用缓存,降低上游配额消耗
    staleTime: 10 * 60_000,
    queryFn: async ({ pageParam }): Promise<Paper[]> => {
      const seed = SEED_QUERIES[pageParam % SEED_QUERIES.length];
      const round = Math.floor(pageParam / SEED_QUERIES.length);
      try {
        const { data } = await http.post<{
          data: { data: { data: Paper[] } };
        }>('/public/papers/search', {
          query: seed,
          limit: FEED_PAGE_SIZE,
          offset: round * FEED_PAGE_SIZE,
          source: 'stc',
        });
        return data.data?.data?.data ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 把分页结果摊平成卡片序列:跨种子词去重(同一篇论文可能命中多个词)+
 * 过滤掉没有标题的脏数据。摘要缺失不过滤 —— 卡片做降级展示。
 */
export function flattenFeedPages(pages: Paper[][] | undefined): Paper[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const page of pages) {
    for (const p of page) {
      if (!p.paperId || !p.title || seen.has(p.paperId)) continue;
      seen.add(p.paperId);
      out.push(p);
    }
  }
  return out;
}

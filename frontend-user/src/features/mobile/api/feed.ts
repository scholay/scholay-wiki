import { useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { Paper, UpstreamSource } from '@/shared/api/types';

/** 每次请求取多少篇(一个种子词一页) */
export const FEED_PAGE_SIZE = 10;

/** 最多翻多少"页" —— 防止一直划还在打上游 */
const FEED_MAX_PAGES = 60;

/** 连续这么多页都空 → 停止翻页(上游故障/捞干时不白打配额) */
const EMPTY_STOP = 4;

/** 近 N 年内的论文优先(偏向「最新」;太窄会让冷门主题没结果,3 年是平衡点) */
const RECENT_YEARS = 3;

/**
 * 通用主题池(CS / 物理 / 材料 / 能源 / 地学 …)—— stc / olx 源用。
 * 池子越大 + 种子打乱 → 每个会话刷到的主题组合越不一样。
 */
const GENERAL_TOPICS = [
  'large language models', 'graph neural networks', 'reinforcement learning',
  'diffusion models', 'computer vision', 'natural language processing',
  'quantum computing', 'superconductivity', 'black holes', 'dark matter',
  'perovskite solar cells', 'lithium battery', 'carbon capture', 'renewable energy',
  'nanomaterials', 'metamaterials', '2D materials', 'catalysis',
  'climate change', 'remote sensing', 'earthquake prediction', 'ocean warming',
  'robotics', 'autonomous driving', 'federated learning', 'protein structure prediction',
];

/** 生医主题池 —— pmd(PubMed)源用,避免给 PubMed 喂非医学词导致空结果。 */
const BIOMED_TOPICS = [
  'CRISPR gene editing', 'cancer immunotherapy', 'gut microbiome', 'gene therapy',
  'single-cell RNA sequencing', 'Alzheimer disease', 'vaccine development', 'stem cells',
  'metabolomics', 'antibiotic resistance', 'tumor microenvironment', 'neural stem cells',
  'mRNA vaccine', 'CAR-T cell therapy', 'epidemiology', 'diabetes treatment',
];

/** 论文 feed 三源轮转 —— 每页换一个源,刷下去就是 stc / olx / pmd 穿插着来。 */
const FEED_SOURCES: UpstreamSource[] = ['stc', 'olx', 'pmd'];

/** 把一页的「源 / 主题 / offset / 排序」由 (seed, page) 确定地推出来(同种子同页 = 同结果)。 */
function planPage(seed: number, page: number) {
  const source = FEED_SOURCES[page % FEED_SOURCES.length];
  const pool = source === 'pmd' ? BIOMED_TOPICS : GENERAL_TOPICS;
  const topic = pool[(seed + page * 7) % pool.length];
  const round = Math.floor(page / FEED_SOURCES.length);
  // 深翻 + 种子抖动:不同会话从不同 offset 起,避免每次都是该主题的头几篇。
  // 但**第一页固定 offset 0**:首屏要稳(任意主题近年里 top-10 几乎必有结果),
  // 否则种子抖动可能把 page 0 推到高 offset、冷门主题在那里没结果 → 首屏空。变化性靠主题本身保证。
  const offset = page === 0 ? 0 : (round + (seed % 5)) * FEED_PAGE_SIZE;
  // 排序:olx/pmd 支持按日期(偏最新);stc relevance 端点忽略 sort,靠 year_from 收近年
  const sort = source === 'olx' ? 'publication_date:desc' : source === 'pmd' ? 'date' : undefined;
  return { source, topic, offset, sort };
}

const PAPER_FEED_KEY = ['mobile', 'feed', 'papers'] as const;

/** 当前 seed 下的 feed queryKey(seed 进 key:换种子 = 新查询 = 刷新一批) */
export function paperFeedKey(seed: number) {
  return [...PAPER_FEED_KEY, seed] as const;
}

async function fetchPaperFeedPage(seed: number, page: number): Promise<Paper[]> {
  const { source, topic, offset, sort } = planPage(seed, page);
  const currentYear = new Date().getFullYear();
  try {
    const { data } = await http.post<{ data: { data: { data: Paper[] } } }>(
      '/public/papers/search',
      {
        query: topic,
        limit: FEED_PAGE_SIZE,
        offset,
        source,
        year_from: currentYear - RECENT_YEARS,
        ...(sort ? { sort } : {}),
      }
    );
    return data.data?.data?.data ?? [];
  } catch {
    // 单页失败(某源临时不可用)不抛 —— 返回空页,feed 继续往下供给,别整条流崩
    return [];
  }
}

/**
 * 论文 feed 无限滚动 —— 上下滑动刷论文的数据层。
 *
 * 随机性:seed(每会话/下拉刷新轮换)驱动「主题打乱 + offset 抖动 + 三源轮转」,
 * 每次刷到的不是固定列表;偏「最新」(year_from 近 N 年 + olx/pmd 按日期排)。
 * seed 进 queryKey:换种子 = 新查询 = 刷出新一批;同种子同页结果可复现(利于本地缓存/持久化一致)。
 *
 * 无缝衔接:refetchOnMount 关 + staleTime 极长 + 本地持久化(feed-cache)→ 二次进入直接显示旧内容,
 * 不自动重拉(避免列表在脚下重排);要新内容靠下拉刷新(轮换 seed)或缓存过期后的新会话。
 */
export function usePaperFeed(seed: number) {
  return useInfiniteQuery({
    queryKey: paperFeedKey(seed),
    initialPageParam: 0,
    getNextPageParam: (_last: Paper[], all: Paper[][]) => {
      if (all.length >= FEED_MAX_PAGES) return undefined;
      // 连续多页空(上游都挂了/该组合捞干)→ 停,别一路空翻到 60 页白打配额
      const tail = all.slice(-EMPTY_STOP);
      if (tail.length >= EMPTY_STOP && tail.every((p) => p.length === 0)) return undefined;
      return all.length;
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: ({ pageParam }) => fetchPaperFeedPage(seed, pageParam),
  });
}

/** 供全局预取:在任意页面进入时提前把首页内容拉好,到 feed 时即时呈现。 */
export function prefetchPaperFeed(qc: QueryClient, seed: number): void {
  void qc.prefetchInfiniteQuery({
    queryKey: paperFeedKey(seed),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPaperFeedPage(seed, pageParam as number),
    staleTime: Infinity,
  });
}

/**
 * 把分页结果摊平成卡片序列:跨页去重(同篇可能命中多个词/源)+ 过滤无标题脏数据。
 */
export function flattenFeedPages(pages: Paper[][] | undefined): Paper[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const page of pages) {
    for (const p of page) {
      const id = p.paperId;
      if (!id || !p.title || seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

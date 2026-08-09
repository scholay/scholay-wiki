import { useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { JournalListPage, JournalListUnified } from '@/shared/api/types';
import { readFeedPages } from '@/shared/lib/feed-cache';

/** 每批期刊条数 */
export const JOURNAL_FEED_PAGE_SIZE = 10;

/**
 * 最多翻多少页 —— 与论文 feed 的 FEED_MAX_PAGES 对齐的硬上限。
 * VerticalSwipeFeed 在 items.length===0 时会自动翻页找内容(空白屏修复需要);若上游一直回
 * hasMore:true 且 rows 非空但全被去重/过滤掉(unified 缺 id/名),items 永远是 0、tail 空页判定
 * (按 rows.length)也不触发 → 会无上限地顺序翻页打上游。这个 cap 兜底封顶,杜绝失控。
 */
const JOURNAL_FEED_MAX_PAGES = 60;

/**
 * 期刊 feed 排序 —— **固定按影响因子(数值字段 `jcr_impact_factor_num`)降序**,优先呈现高质量期刊。
 *
 * 为什么不轮换排序维度(原 jcr/sjr/h-index 轮换):上游 `/v1/jnl/list` 的 `scimago_sjr` 排序把
 * **NULL 排在最前** → 一批「2 篇文献、无 IF/SJR」的低质边角刊冒到顶部(用户实测命中阿拉伯文小刊);
 * `openalex_h_index` 也会混入无 IF 的刊。只有 IF 的数值字段排序干净(NULL 沉底、永远刷不到垃圾刊)。
 * 变化性改由「起始页抖动」提供:不同会话(seed)从 IF 榜的不同切片切入,但都在高分区。
 * 注意:`_num` 是数值排序字段(NULL 沉底);无后缀的 `jcr_impact_factor` 在 list 端点恰好也行,
 * 但 sjr/h 的对应字段不可靠,故统一只用 IF_num。
 */
const JNL_IF_SORT = 'jcr_impact_factor_num';

const JOURNAL_FEED_KEY = ['mobile', 'feed', 'journals'] as const;

export function journalFeedKey(seed: number) {
  return [...JOURNAL_FEED_KEY, seed] as const;
}

async function fetchJournalFeedPage(seed: number, pageParam: number): Promise<JournalListPage> {
  // 起始页抖动:不同会话从 IF 榜不同切片切入(0~7 页),避免永远是头部那几本;但都是高 IF 优质刊。
  const basePage = seed % 8;
  try {
    const { data } = await http.post<{ data: JournalListPage }>(
      '/public/journals/list',
      {
        sort_by: JNL_IF_SORT,
        sort_dir: 'desc',
        page: pageParam + basePage,
        page_size: JOURNAL_FEED_PAGE_SIZE,
      }
    );
    return data.data;
  } catch {
    return { rows: [], hasMore: false, page: pageParam, pageSize: JOURNAL_FEED_PAGE_SIZE, total: 0, totalPages: 0 };
  }
}

/**
 * 期刊 feed 无限滚动 —— seed 驱动「换排序维度 + 起始页抖动」造随机感;
 * 持久化 + 不自动重拉(同论文 feed),二次进入无缝看到旧内容,下拉刷新换 seed 出新一批。
 */
export function useJournalFeed(seed: number) {
  return useInfiniteQuery({
    queryKey: journalFeedKey(seed),
    initialPageParam: 1,
    getNextPageParam: (last: JournalListPage, all: JournalListPage[]) => {
      if (all.length >= JOURNAL_FEED_MAX_PAGES) return undefined; // 硬上限,杜绝失控翻页
      if (!last.hasMore) return undefined;
      // 连续多页空 → 停(上游故障时不空翻打配额)
      const tail = all.slice(-4);
      if (tail.length >= 4 && tail.every((p) => (p.rows?.length ?? 0) === 0)) return undefined;
      return all.length + 1;
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: () => readFeedPages<JournalListPage, number>('journals', seed),
    queryFn: ({ pageParam }) => fetchJournalFeedPage(seed, pageParam),
  });
}

/** 供全局预取。 */
export function prefetchJournalFeed(qc: QueryClient, seed: number): void {
  void qc.prefetchInfiniteQuery({
    queryKey: journalFeedKey(seed),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchJournalFeedPage(seed, pageParam as number),
    staleTime: Infinity,
  });
}

// useJournalFullDetail 已上移到 @/shared/api/journals(趋势图 feed + 被分享落地页共用)。

/** 摊平 + 按 id 去重 + 过滤无名脏数据 */
export function flattenJournalPages(
  pages: JournalListPage[] | undefined
): JournalListUnified[] {
  if (!pages) return [];
  const seen = new Set<number>();
  const out: JournalListUnified[] = [];
  for (const page of pages) {
    for (const row of page.rows ?? []) {
      const j = row.unified;
      if (!j?.id || !j.canonical_name || seen.has(j.id)) continue;
      seen.add(j.id);
      out.push(j);
    }
  }
  return out;
}

/** 中科院大类分区 "1 [77/5603]" → "一区";解析不出返回 null */
export function parseFqbQuartile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^([1-4])\b/.exec(raw.trim());
  if (!m) return null;
  const zh = ['一', '二', '三', '四'][Number(m[1]) - 1];
  return `${zh}区`;
}

/** 字符串数值("232.4")→ 展示串;无效返回 null */
export function formatNumeric(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n >= 1000 ? n.toLocaleString('en-US') : String(n);
}

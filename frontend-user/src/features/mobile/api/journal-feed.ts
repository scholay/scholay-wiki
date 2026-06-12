import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type {
  JournalFullDetail,
  JournalListPage,
  JournalListUnified,
} from '@/shared/api/types';

/** 每批期刊条数 */
export const JOURNAL_FEED_PAGE_SIZE = 10;

/**
 * 期刊 feed 无限滚动 —— 「高分期刊流」:/public/journals/list 按 JCR 影响因子
 * 降序分页(实测排序正确:第一名 CA-A Cancer ~232)。
 *
 * 注意该端点是上游原始透传(rows[].unified),不是 search 的规整 Journal 形态;
 * 上游无随机/推荐机制(调研结论),确定性分页是 MVP 的合理底座,
 * 后续做随机混流/学科频道时只动本文件。
 */
export function useJournalFeed() {
  return useInfiniteQuery({
    queryKey: ['mobile', 'feed', 'journals'],
    initialPageParam: 1,
    getNextPageParam: (last: JournalListPage, all: JournalListPage[]) =>
      last.hasMore ? all.length + 1 : undefined,
    staleTime: 10 * 60_000,
    queryFn: async ({ pageParam }): Promise<JournalListPage> => {
      try {
        const { data } = await http.post<{ data: JournalListPage }>(
          '/public/journals/list',
          {
            sort_by: 'jcr_impact_factor',
            sort_dir: 'desc',
            page: pageParam,
            page_size: JOURNAL_FEED_PAGE_SIZE,
          }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 期刊完整详情(full=1 含各源子表)—— 趋势图数据源(年度 IF / 发文量 / 被引量)。
 *
 * **只在卡片滑到当前位时才拉取**(enabled 由调用方控):jnl 系列后端无 Redis
 * 缓存且 get 有 SEO seed 副作用,feed 滑动不能给渲染窗口里每张卡都打一发;
 * staleTime 给长(详情数据天级不变),回滑不重复请求。
 */
export function useJournalFullDetail(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['mobile', 'journal', 'detail', id],
    enabled,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<JournalFullDetail> => {
      try {
        const { data } = await http.post<{ data: JournalFullDetail }>(
          '/public/journals/get',
          { id, full: '1' }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

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

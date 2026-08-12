import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/hotcontent/model.go。
 * 后端 struct 没有 `rank` 也没有 `count` —— 排名是数组顺序,计数是 `search_count` / `view_count`。
 */
/** 搜索类型 —— 文献 / 期刊分桶统计 */
export type SearchType = 'paper' | 'journal';

export interface HotKeyword {
  id: number;
  keyword: string;
  keyword_hash: string;
  search_type: SearchType;
  search_count: number;
  first_searched_at: string;
  last_searched_at: string;
}

export interface HotPaper {
  id: number;
  paper_id: string;
  doi?: string;
  title?: string;
  abstract?: string;
  authors?: string;
  year?: number;
  venue?: string;
  /** 曝光量: 出现在搜索结果集中 */
  impression_count: number;
  /** 点击量: 从搜索结果点开详情 */
  click_count: number;
  /** SEO 直访量: 经 /paper/:slug 直接访问(不含搜索点击) */
  seo_view_count: number;
  view_count?: number; // 历史遗留, 不再写
  first_viewed_at: string;
  last_viewed_at: string;
}

/**
 * GET /admin/hot-content/stats 的真实形态 —— 对齐 backend/internal/hotcontent/service.go
 * `GetStats()` 返回的那张 map(全表 count + 当前生效的清理策略)。
 *
 * ⚠️ 这个 interface 此前写的是 `total_keywords` / `total_papers` / `last_updated`,
 * 三个键**后端一个都不返回**。TS 上全是可选字段所以编译期毫无提示,运行时永远 undefined:
 * 两张 KPI 卡一直在显示 `keywords?.total`(那是**当前筛选 + 30 天窗口**的分页 total,
 * 切到「期刊」筛选就跟着变,却挂着「热搜词条数」的标签),而「最近更新:」那行文案
 * 因为 `last_updated` 恒为 undefined,从上线起就没渲染过一次。
 */
export interface HotStats {
  /** hot_search_keywords 全表行数(不受列表的 days / search_type 筛选影响) */
  keywords_count: number;
  /** hot_papers 全表行数 */
  papers_count: number;
  /** 当前生效的保留天数(来自 hot_content_config,读不到时后端用常量兜底) */
  retention_days: number;
  /** 当前生效的最大记录数 */
  max_records: number;
}

/**
 * 后端返回 `{ items, total, page, page_size }`,backend 用 days/page/page_size query。
 * searchType 为空 = 全部类型;传 'paper' / 'journal' 按类型过滤。
 */
export function useHotKeywords(page = 1, pageSize = 50, days = 30, searchType?: SearchType) {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'keywords', page, pageSize, days, searchType ?? 'all'],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: { items: HotKeyword[]; total: number } }>(
        '/admin/hot-content/keywords',
        {
          params: {
            days,
            page,
            page_size: pageSize,
            ...(searchType ? { search_type: searchType } : {}),
          },
        }
      );
      // 透传 total —— 此前只回 items 且写死 page=1,列表被钉死在前 50 条(后端数据本身是全量的)。
      return { items: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

export function useHotPapers(page = 1, pageSize = 50, days = 30) {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'papers', page, pageSize, days],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: { items: HotPaper[]; total: number } }>(
        '/admin/hot-content/papers',
        { params: { days, page, page_size: pageSize } }
      );
      return { items: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

export function useHotStats() {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'stats'],
    queryFn: async () => (await http.get<{ data: HotStats }>('/admin/hot-content/stats')).data.data,
  });
}

export function useCleanupHotContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post('/admin/hot-content/cleanup'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'hot-content'] }),
  });
}

// ─── 清理策略配置 (admin 可配,改完下一轮 cleanup 立即生效) ─────────────────

/** hot_content_config 单行表的形态 */
export interface HotContentConfig {
  id: number;
  retention_days: number;
  max_records: number;
  updated_at: string;
}

/** 校验范围与后端 binding 一致, 让前端在提交前能拦住明显非法值 */
export const HOT_CONTENT_RETENTION_MIN = 1;
export const HOT_CONTENT_RETENTION_MAX = 3650; // 10 年
export const HOT_CONTENT_MAX_RECORDS_MIN = 100;
export const HOT_CONTENT_MAX_RECORDS_MAX = 10_000_000;

export function useHotContentConfig() {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'config'],
    queryFn: async () =>
      (await http.get<{ data: HotContentConfig }>('/admin/hot-content/config')).data.data,
  });
}

export function useUpdateHotContentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { retention_days: number; max_records: number }) =>
      http.put<{ data: HotContentConfig }>('/admin/hot-content/config', body),
    onSuccess: () => {
      // 改完同时刷新策略 + stats(显示用了新的 retention/max), 列表不变
      qc.invalidateQueries({ queryKey: ['admin', 'hot-content', 'config'] });
      qc.invalidateQueries({ queryKey: ['admin', 'hot-content', 'stats'] });
    },
  });
}

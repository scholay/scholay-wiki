import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** 后端未必返回这个 stats —— 如果接口缺失,UI 应该 fallback 到 keywords.length / papers.length */
export interface HotStats {
  total_keywords?: number;
  total_papers?: number;
  last_updated?: string;
}

/**
 * 后端返回 `{ items, total, page, page_size }`,backend 用 days/page/page_size query。
 * searchType 为空 = 全部类型;传 'paper' / 'journal' 按类型过滤。
 */
export function useHotKeywords(page = 1, pageSize = 50, days = 30, searchType?: SearchType) {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'keywords', page, pageSize, days, searchType ?? 'all'],
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

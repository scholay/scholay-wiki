import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/hotcontent/model.go。
 * 后端 struct 没有 `rank` 也没有 `count` —— 排名是数组顺序,计数是 `search_count` / `view_count`。
 */
export interface HotKeyword {
  id: number;
  keyword: string;
  keyword_hash: string;
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
  view_count: number;
  first_viewed_at: string;
  last_viewed_at: string;
}

/** 后端未必返回这个 stats —— 如果接口缺失,UI 应该 fallback 到 keywords.length / papers.length */
export interface HotStats {
  total_keywords?: number;
  total_papers?: number;
  last_updated?: string;
}

/** 后端返回 `{ items, total, page, page_size }`,backend 用 days/page/page_size query */
export function useHotKeywords(pageSize = 50, days = 30) {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'keywords', pageSize, days],
    queryFn: async () => {
      const r = await http.get<{ data: { items: HotKeyword[]; total: number } }>(
        '/admin/hot-content/keywords',
        { params: { days, page: 1, page_size: pageSize } }
      );
      return r.data.data.items ?? [];
    },
  });
}

export function useHotPapers(pageSize = 50, days = 30) {
  return useQuery({
    queryKey: ['admin', 'hot-content', 'papers', pageSize, days],
    queryFn: async () => {
      const r = await http.get<{ data: { items: HotPaper[]; total: number } }>(
        '/admin/hot-content/papers',
        { params: { days, page: 1, page_size: pageSize } }
      );
      return r.data.data.items ?? [];
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

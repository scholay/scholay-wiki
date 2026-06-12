import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { STALE_WARM, STALE_COOL } from '@/shared/lib/query-config';
import type { FeatureTool, ToolCategoryMeta } from '@/types/feature-tool';

export interface ToolListParams {
  category?: string;
  access_type?: string;
  price_type?: string;
  open_source?: '' | 'open' | 'closed';
  q?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface ToolListResponse {
  items: FeatureTool[];
  total: number;
  page: number;
}

/** 公开:工具列表 (仅已上线)。 */
export function useToolList(params: ToolListParams = {}) {
  return useQuery({
    queryKey: ['tools', 'list', params] as const,
    staleTime: STALE_WARM,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<ToolListResponse> => {
      const sp = new URLSearchParams();
      if (params.category) sp.set('category', params.category);
      if (params.access_type) sp.set('access_type', params.access_type);
      if (params.price_type) sp.set('price_type', params.price_type);
      if (params.open_source) sp.set('open_source', params.open_source);
      if (params.q) sp.set('q', params.q);
      sp.set('page', String(params.page ?? 1));
      sp.set('page_size', String(params.page_size ?? 24));
      if (params.sort_by) sp.set('sort_by', params.sort_by);
      if (params.sort_order) sp.set('sort_order', params.sort_order);
      const { data } = await http.get<{ data: ToolListResponse }>(`/public/tools?${sp.toString()}`);
      return data.data;
    },
  });
}

/**
 * 公开:工具列表的无限滚动变体 —— 移动端功能页(触底续载)用,
 * 与 useToolList 同端点同筛选参数,只是分页形态不同。
 */
export function useInfiniteToolList(
  params: Omit<ToolListParams, 'page'> = {}
) {
  const pageSize = params.page_size ?? 20;
  return useInfiniteQuery({
    queryKey: ['tools', 'infinite-list', params] as const,
    staleTime: STALE_WARM,
    initialPageParam: 1,
    getNextPageParam: (last: ToolListResponse, all: ToolListResponse[]) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    queryFn: async ({ pageParam }): Promise<ToolListResponse> => {
      const sp = new URLSearchParams();
      if (params.category) sp.set('category', params.category);
      if (params.access_type) sp.set('access_type', params.access_type);
      if (params.price_type) sp.set('price_type', params.price_type);
      if (params.open_source) sp.set('open_source', params.open_source);
      if (params.q) sp.set('q', params.q);
      sp.set('page', String(pageParam));
      sp.set('page_size', String(pageSize));
      if (params.sort_by) sp.set('sort_by', params.sort_by);
      if (params.sort_order) sp.set('sort_order', params.sort_order);
      const { data } = await http.get<{ data: ToolListResponse }>(`/public/tools?${sp.toString()}`);
      return data.data;
    },
  });
}

/** 公开:分类计数 (12 类)。 */
export function useToolCategories() {
  return useQuery({
    queryKey: ['tools', 'categories'] as const,
    staleTime: STALE_COOL,
    queryFn: async (): Promise<{ categories: ToolCategoryMeta[]; total: number }> => {
      const { data } = await http.get<{ data: { categories: ToolCategoryMeta[]; total: number } }>(
        '/public/tools/categories',
      );
      return data.data;
    },
  });
}

/** 公开:工具详情 (按 id 或 slug)。 */
export function useToolDetail(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['tools', 'detail', idOrSlug] as const,
    enabled: !!idOrSlug,
    staleTime: STALE_WARM,
    queryFn: async (): Promise<FeatureTool> => {
      const { data } = await http.get<{ data: FeatureTool }>(`/public/tools/detail/${idOrSlug}`);
      return data.data;
    },
  });
}

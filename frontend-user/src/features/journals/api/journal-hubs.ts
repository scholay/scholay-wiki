import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_COLD } from '@/shared/lib/query-config';

/**
 * 期刊枢纽(发现层)API —— 对接 /api/v1/public/journal-hubs/*。
 *
 * mirrors backend journal-hubs public handlers(数据真源 = seo_journals 的
 * publish_state=1 行;与 SSR 枢纽页 /journals/browse|category|country|warning|oa
 * 同一后端形状,SPA 水合后由这两个 hook 接管)。
 *
 * 契约:
 *   GET /public/journal-hubs/overview
 *     → { categories:[{slug,name,count}], countries:[{code,count}],
 *         warning_count, oa_count, latest:[JournalHubCard×20] }
 *   GET /public/journal-hubs/list?dimension=category|country|warning|oa&key=&page=&per_page=
 *     → { items:[JournalHubCard], total, page, per_page }
 */

export type JournalHubDimension = 'category' | 'country' | 'warning' | 'oa';

export interface JournalHubCard {
  journal_id: number;
  /** Go 侧生成的权威 slug —— 详情链接 /journal/{id}/{slug} 用它,不在 JS 重算 */
  slug: string;
  name: string;
  publisher: string;
  jcr_impact_factor: number;
  jcr_quartile: string;
  /** 中科院大类分区("1"-"4",可能带「区」后缀,消费方取首位数字) */
  fqb_major_quartile: string;
  fqb_top: boolean | number;
  /** 中科院新锐分区 */
  xr_major_quartile: string;
  is_oa: boolean;
  /** 国际期刊预警等级(高/中/低),空 = 无预警 */
  warning_level: string;
  h_index: number;
  /** 国家/地区二位代码(如 US / CN) */
  country: string;
}

export interface JournalHubCategory {
  slug: string;
  name: string;
  count: number;
}

export interface JournalHubCountry {
  code: string;
  count: number;
}

export interface JournalHubOverview {
  categories: JournalHubCategory[];
  countries: JournalHubCountry[];
  warning_count: number;
  oa_count: number;
  latest: JournalHubCard[];
}

export interface JournalHubListResult {
  items: JournalHubCard[];
  total: number;
  page: number;
  per_page: number;
}

/** 枢纽页每页 50 刊 —— 与后端 SSR 枢纽分页同一口径。 */
export const HUB_PER_PAGE = 50;

export function useJournalHubOverview() {
  return useQuery({
    queryKey: ['journal', 'hub-overview'] as const,
    staleTime: STALE_COLD, // 发布批次级别才会变
    queryFn: async (): Promise<JournalHubOverview> => {
      try {
        const { data } = await http.get<{ data: JournalHubOverview }>(
          '/public/journal-hubs/overview',
        );
        const d = data.data;
        return {
          categories: d?.categories ?? [],
          countries: d?.countries ?? [],
          warning_count: d?.warning_count ?? 0,
          oa_count: d?.oa_count ?? 0,
          latest: d?.latest ?? [],
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

export interface JournalHubListOptions {
  dimension: JournalHubDimension;
  /** category 的 slug / country 的二位代码;warning、oa 不需要 */
  key?: string;
  page?: number;
}

export function useJournalHubList({ dimension, key, page = 1 }: JournalHubListOptions) {
  return useQuery({
    queryKey: ['journal', 'hub-list', dimension, key ?? '', page] as const,
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    staleTime: STALE_COLD,
    // category/country 缺 key 时不打后端(路由参数还没就位)
    enabled: dimension === 'warning' || dimension === 'oa' || !!key,
    queryFn: async (): Promise<JournalHubListResult> => {
      try {
        const { data } = await http.get<{ data: JournalHubListResult }>(
          '/public/journal-hubs/list',
          {
            params: {
              dimension,
              ...(key ? { key } : {}),
              page,
              per_page: HUB_PER_PAGE,
            },
          },
        );
        const d = data.data;
        return {
          items: d?.items ?? [],
          total: d?.total ?? 0,
          page: d?.page ?? page,
          per_page: d?.per_page ?? HUB_PER_PAGE,
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段严格对齐 backend/internal/umami/{client,handler}.go。
 * backend 是 umami HTTP API 的薄壳 —— 这里 hook 只决定查询窗口 + 维度类型,
 * 不在 client 做二次聚合。
 */

export interface StatsValue {
  value: number;
  prev: number;
}
export interface Overview {
  stats: {
    pageviews: StatsValue;
    visits: StatsValue;
    visitors: StatsValue;
    bounces: StatsValue;
    totaltime: StatsValue;
  };
  active: { visitors: number };
  start: string;
  end: string;
}

export interface SeriesPoint {
  x: string;
  y: number;
}
export interface Pageviews {
  series: { pageviews: SeriesPoint[]; sessions: SeriesPoint[] };
  unit: 'hour' | 'day' | 'month' | 'year';
  start: string;
  end: string;
}

export type TopType = 'url' | 'referrer' | 'country' | 'browser' | 'os' | 'device';
export interface TopRow {
  x: string;
  y: number;
}
export interface TopResponse {
  type: TopType;
  items: TopRow[];
  start: string;
  end: string;
}

export interface AnalyticsRangeParams {
  /** ISO8601 字符串,缺省最近 30 天 */
  start?: string;
  end?: string;
}

/**
 * 把 hook 入参里非空字段拍成 axios 接受的 `Record<string, string>`。
 * 用泛型签名是因为 TS 的 named interface (AnalyticsRangeParams) 没 string index
 * signature,传 `Record<string, ...>` 会被拒;泛型放过任意 object。
 */
function paramsToObj<T extends object>(p: T): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v != null && v !== '') o[k] = String(v);
  }
  return o;
}

export function useAnalyticsOverview(params: AnalyticsRangeParams = {}) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'overview', params],
    queryFn: async () => {
      const r = await http.get<{ data: Overview }>('/admin/analytics/overview', {
        params: paramsToObj(params),
      });
      return r.data.data;
    },
    // 概览数据 60s 内不重复拉,避免页面切 tab 来回触发
    staleTime: 60_000,
  });
}

export function usePageviews(
  unit: 'hour' | 'day' = 'day',
  params: AnalyticsRangeParams = {},
) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'pageviews', unit, params],
    queryFn: async () => {
      const r = await http.get<{ data: Pageviews }>('/admin/analytics/pageviews', {
        params: paramsToObj({ ...params, unit }),
      });
      return r.data.data;
    },
    staleTime: 60_000,
  });
}

export function useTopMetric(type: TopType, limit = 10, params: AnalyticsRangeParams = {}) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'top', type, limit, params],
    queryFn: async () => {
      const r = await http.get<{ data: TopResponse }>('/admin/analytics/top', {
        params: paramsToObj({ ...params, type, limit }),
      });
      return r.data.data;
    },
    staleTime: 60_000,
  });
}

/**
 * 实时在线 —— 30s 轮询。staleTime/refetchInterval 同步设置,后台 tab 切回来也会立刻刷。
 */
export function useActiveVisitors() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'active'],
    queryFn: async () => {
      const r = await http.get<{ data: { visitors: number } }>('/admin/analytics/active');
      return r.data.data;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

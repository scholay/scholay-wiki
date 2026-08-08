// 功能使用统计 v2 (usage_events) —— admin 只读 hooks。
// 字段对齐 backend/internal/usagestat。旧 v1(usage-logs.ts / 使用日志(旧)页)已随 usagelog 模块整体下线删除。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { windowToDateRange, type DateWindow } from '../components/DateRangeControl';

export interface FeatureItem {
  feature: string;
  feature_name: string;
  count: number;
  unique_users: number; // 去重登录用户
  unique_anon: number; // 去重匿名访客
}

export interface DayCount {
  date: string;
  count: number;
}

export interface UsageStatsSummary {
  days: number;
  total: number;
  today: number;
  unique_users: number;
  unique_anon: number;
  by_feature: FeatureItem[];
  daily: DayCount[];
}

/**
 * usage_events 原始记录。用户详情只展示业务使用轨迹，不渲染 IP / UA / extra
 * 等调试字段，但类型仍与后端 UsageEvent 完整对齐，避免契约漂移。
 */
export interface UsageEvent {
  id: number;
  user_id: number | null;
  anon_id: string;
  feature: string;
  action: string;
  correlation_id: string;
  source: string;
  ip_address: string;
  user_agent: string;
  device_type: string;
  extra: unknown;
  created_at: string;
}

export interface UsageEventPage {
  events: UsageEvent[];
  total: number;
}

/**
 * 单用户近期功能记录。后端单页上限为 100，因此这里明确取最近 100 条；
 * total 仍是时间窗内全量，界面会明示「最近 100 / 共 N」，不把样本数冒充总数。
 */
export function useUserUsageEvents(userId: number, days: number, enabled = true) {
  const params = { user_id: userId, days, page: 1, page_size: 100 };
  return useQuery({
    queryKey: ['admin', 'usage-stats', 'user-events', params],
    enabled: userId > 0 && enabled,
    queryFn: async () => {
      const r = await http.get<{ data: UsageEventPage }>('/admin/usage-stats/events', { params });
      return {
        events: Array.isArray(r.data.data.events) ? r.data.data.events : [],
        total: r.data.data.total ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

export function useUsageStatsSummary(win: DateWindow) {
  const r = windowToDateRange(win);
  const params = { start_date: r.start, end_date: r.end };
  return useQuery({
    queryKey: ['admin', 'usage-stats', 'summary', params],
    queryFn: async () =>
      (await http.get<{ data: UsageStatsSummary }>('/admin/usage-stats/summary', { params })).data.data,
    staleTime: 60_000,
  });
}

export interface FunnelItem {
  action: string;
  label: string;
  submissions: number;
  events: number;
}

export function useUsageStatsFunnel(win: DateWindow) {
  const r = windowToDateRange(win);
  const params = { start_date: r.start, end_date: r.end };
  return useQuery({
    queryKey: ['admin', 'usage-stats', 'funnel', params],
    queryFn: async () =>
      (await http.get<{ data: { stages: FunnelItem[] } }>('/admin/usage-stats/peer-review-funnel', { params }))
        .data.data.stages,
    staleTime: 60_000,
  });
}

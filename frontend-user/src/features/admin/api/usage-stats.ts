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

import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 后端 GET /admin/users/metrics —— 一次返回 4 张图所需的全部数据。
 * 字段对齐 internal/user/metrics.go。
 */

export interface MetricsPoint {
  date: string;
  value: number;
}

export interface CategoryCount {
  name: string;
  value: number;
}

export interface HourlyPoint {
  hour: number;
  value: number;
}

export interface UserMetrics {
  granularity: 'day' | 'week' | 'month';
  days: number;
  registrations: MetricsPoint[];
  sources: CategoryCount[];
  hourly_activity: HourlyPoint[];
  mau_trend: MetricsPoint[];
}

export function useUserMetrics(days = 30, granularity: 'day' | 'week' | 'month' = 'day') {
  return useQuery({
    queryKey: ['admin', 'users', 'metrics', days, granularity],
    queryFn: async () => {
      const r = await http.get<{ data: UserMetrics }>('/admin/users/metrics', {
        params: { days, granularity },
      });
      return r.data.data;
    },
  });
}

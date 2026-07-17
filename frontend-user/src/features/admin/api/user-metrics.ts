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
  /** 每日活跃(去重)用户数,按天。口径「打开即活跃」=当天有过任意鉴权请求的去重用户
   *  (user_daily_active 台账,0069;排除注册当天;last_active_at 单列无法重建历史每日序列)。 */
  daily_active: MetricsPoint[];
  /** 窗口内新注册总数(= registrations 各桶之和)。 */
  registrations_total: number;
  /** 窗口内**去重**活跃用户数(非逐日相加人次;与 daily_active 同口径)。 */
  active_total: number;
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

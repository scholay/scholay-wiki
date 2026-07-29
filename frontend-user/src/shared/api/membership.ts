import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { useIsAuthenticated } from '@/stores/auth.store';

/**
 * 当前登录用户的会员等级 —— 跨 feature 复用的轻量读取(期刊投稿资源下载门槛等)。
 *
 * 复用 settings 的 `['settings','billing']` 缓存键 + 同端点,和 useBillingOverview 共享
 * 一份缓存,不重复请求;这里只 select 出 tier。未登录时不发请求(data=undefined),
 * 调用方按「非 Max」处理(锁定 + 引导)。
 */
export type ViewerTier = 'free' | 'pro' | 'max';

interface BillingOverviewLite {
  tier: ViewerTier;
  cycle?: 'monthly' | 'yearly';
  credit?: { total: number };
}

async function fetchBillingOverviewLite(): Promise<BillingOverviewLite> {
  return (
    await http.get<{ data: BillingOverviewLite }>('/user/billing/overview')
  ).data.data;
}

export function useViewerTier() {
  const authed = useIsAuthenticated();
  return useQuery({
    queryKey: ['settings', 'billing'] as const,
    enabled: authed,
    staleTime: 15_000,
    queryFn: fetchBillingOverviewLite,
    select: (o) => o.tier,
  });
}

/** 犀牛面板等：会员档 + 经费余额(同 billing 缓存)。 */
export function useBillingSnapshot() {
  const authed = useIsAuthenticated();
  return useQuery({
    queryKey: ['settings', 'billing'] as const,
    enabled: authed,
    staleTime: 15_000,
    queryFn: fetchBillingOverviewLite,
    select: (o) => ({
      tier: (['free', 'pro', 'max'].includes(o.tier) ? o.tier : 'free') as ViewerTier,
      cycle: o.cycle,
      creditTotal: o.credit?.total ?? 0,
    }),
  });
}

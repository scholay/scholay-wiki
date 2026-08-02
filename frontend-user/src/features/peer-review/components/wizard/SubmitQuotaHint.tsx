// 提交前额度预告 —— 挂在 wizard 第 4 步(核对投递)CTA 按钮旁。
//
// 一次审稿跑 3 位审稿人 + 主审,是全站最贵的单次操作,提交前必须让用户有预期:
//   · 常驻小字:本次审稿将消耗较多额度
//   · 额度将尽(percent >= 80)时追加琥珀提示行 + 自动重置时刻
//
// overview 读法与 QuotaNotifier 同款 queryKey ['settings','billing'],staleTime 一致 ——
// 全局通知器常驻在 providers,这里通常直接命中缓存,不额外打请求。
// 跨 feature 禁 import(settings 的 useBillingOverview 用不了),与 QuotaNotifier /
// UserMenuContent 同款做法:inline useQuery 打同一个端点。
// 字段 mirrors backend/internal/vip/quota.go Overview.token(P5:percent 是真值,绝对额度已抹除)。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { formatResetAt } from '@/shared/components/QuotaNotifier';

interface OverviewLite {
  token: {
    percent: number; // 本周期已用百分比(0..100,真值)
    unlimited: boolean;
    window_reset_at: string | null; // 窗口自动重置时刻;null = 未开窗
  };
}

export function SubmitQuotaHint() {
  const { data } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () => (await http.get<{ data: OverviewLite }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 15_000,
  });

  const t = data?.token;
  const low = !!t && !t.unlimited && t.percent >= 80;
  const resetAt = low ? formatResetAt(t.window_reset_at) : '';

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <p className="text-12 text-faint">本次审稿将消耗较多额度</p>
      {low && (
        <p className="text-12 font-medium text-brand-amber">
          本周期额度剩余不足 20%{resetAt && `,将于 ${resetAt} 自动重置`}
        </p>
      )}
    </div>
  );
}

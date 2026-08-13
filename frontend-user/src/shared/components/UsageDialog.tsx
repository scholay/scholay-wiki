// 「查看用量」轻量弹窗 —— composer 额度条 / 其他入口共用的额度快照。
// 数据 = /user/billing/overview(QUOTA_OVERVIEW_QUERY_KEY 全局共享缓存,通常零请求);
// 用户端 overview 已抹绝对额度,只有 percent(0..100),展示口径与 account-assets-card 一致。
//
// 「恢复方式」区(2026-08-12 拍板):恢复次数与经费是**或**的关系 ——
//   · 两者都为 0 → 整块不出现(没有可用的恢复方式,不给用户看空数字);
//   · 只有其一 → 只展示那一条,带快捷操作(立即恢复需二次确认 / 经费可就地开启);
//   · 两者都有 → 两条并列,中间「或」分隔,任选其一。
// 「有次数才提」这条判定与 QuotaComposerStrip 上区、耗尽 toast 的 action 三处同源(2026-08-13)。
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import { isPhoneDevice } from '@/shared/lib/device';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { QUOTA_OVERVIEW_QUERY_KEY, type QuotaOverview } from '@/shared/lib/quota-overview';
import { formatResetAt } from '@/shared/lib/quota-display';
import {
  PaygConfirmDialog,
  ResetConfirmDialog,
  usePaygMutation,
  useResetQuotaMutation,
} from './quota-recovery';

const TIER_LABEL: Record<string, string> = { free: '免费版', pro: 'Pro 会员', max: 'Max 会员' };

export function UsageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmPayg, setConfirmPayg] = useState(false);
  const reset = useResetQuotaMutation(() => setConfirmReset(false));
  const payg = usePaygMutation(() => setConfirmPayg(false));

  // 响应式登录态门控(getAuthToken 非响应式,原地弹窗登录后查询不会自动启动)。
  const authToken = useAuthStore((s) => s.token);
  const { data } = useQuery({
    queryKey: QUOTA_OVERVIEW_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: QuotaOverview }>('/user/billing/overview')).data.data,
    enabled: open && !!authToken,
    staleTime: 15_000,
  });

  const percent = data?.token.percent ?? 0;
  const remain = Math.max(0, 100 - percent);
  const barColor =
    percent >= 90 ? 'bg-brand-red' : percent >= 60 ? 'bg-brand-amber' : 'bg-brand-green';
  const resetAt = formatResetAt(data?.token.window_reset_at);

  const passes = data?.reset_passes ?? 0;
  const credit = data?.credit.total ?? 0;
  const autopayOn = data?.credit.credit_autopay ?? false;
  const showReset = passes > 0;
  const showCredit = credit > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>用量与额度</DialogTitle>
          {/* 副标题只报档位:「额度每 N 天自动恢复」是周期机制,按 2026-08-13 文案铁律不进用户文案
              (恢复时刻改由下面的绝对时间承载,那是事实不是机制)。 */}
          <DialogDescription>{data ? TIER_LABEL[data.tier] ?? data.tier : ''}</DialogDescription>
        </DialogHeader>

        {data && (
          <div className="flex flex-col gap-3">
            {/* 剩余额度 */}
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-12 text-muted-foreground">剩余额度</span>
                <span className="text-14 font-medium text-foreground">
                  {data.token.unlimited ? '不限量' : `${remain}%`}
                </span>
              </div>
              {!data.token.unlimited && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className={cn('h-full rounded-pill transition-[width]', barColor)}
                    style={{ width: `${remain}%` }}
                  />
                </div>
              )}
              {resetAt && !data.token.unlimited && (
                <p className="mt-1 text-12 text-faint">{resetAt} 恢复满额</p>
              )}
            </div>

            {/* 恢复方式(或的关系):零则整块隐藏;只有其一只展示其一。 */}
            {(showReset || showCredit) && (
              <div className="flex flex-col rounded-12 bg-surface-1 px-3 py-2">
                <p className="text-12 text-faint">
                  {showReset && showCredit ? '立即恢复额度,以下方式任选其一' : '立即恢复额度'}
                </p>
                {showReset && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-12">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <RefreshCw className="size-3.5" />
                      恢复次数
                      <span className="font-medium text-foreground">剩余 {passes} 次</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setConfirmReset(true)}
                    >
                      立即恢复
                    </Button>
                  </div>
                )}
                {showReset && showCredit && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border-hairline" />
                    <span className="text-12 text-faint">或</span>
                    <span className="h-px flex-1 bg-border-hairline" />
                  </div>
                )}
                {showCredit && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-12">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Coins className="size-3.5" />
                      经费余额
                      <span className="font-medium text-foreground">{credit}</span>
                    </span>
                    {autopayOn ? (
                      <span className="text-12 text-faint">「用经费继续」已开启</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => setConfirmPayg(true)}
                      >
                        用经费继续
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              关闭
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              quotaNavigate(isPhoneDevice() ? '/m/me' : '/settings/membership');
            }}
          >
            查看明细
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ResetConfirmDialog
      open={confirmReset}
      onOpenChange={setConfirmReset}
      passes={passes}
      pending={reset.isPending}
      onConfirm={() => reset.mutate()}
    />
    <PaygConfirmDialog
      open={confirmPayg}
      onOpenChange={setConfirmPayg}
      pending={payg.isPending}
      onConfirm={() => payg.mutate()}
    />
    </>
  );
}

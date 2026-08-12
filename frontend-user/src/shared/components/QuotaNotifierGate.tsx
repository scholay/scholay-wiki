import { lazy, Suspense, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { localDateKey } from '@/shared/lib/daily-trend';
import { isPhoneDevice } from '@/shared/lib/device';
import {
  BILLING_CHANGED_EVENT,
  QUOTA_EXCEEDED_EVENT,
  QUOTA_RECOVERED_EVENT,
  quotaNavigate,
  type QuotaExceededDetail,
} from '@/shared/lib/quota-events';
import {
  QUOTA_OVERVIEW_QUERY_KEY,
  type QuotaOverview,
} from '@/shared/lib/quota-overview';
import { useQuotaStore } from '@/stores/quota.store';
import { showQuotaToast } from './quota-toast';
import { formatResetAt } from '@/shared/lib/quota-display';

const QuotaNotifier = lazy(() =>
  import('./QuotaNotifier').then((m) => ({ default: m.QuotaNotifier })),
);

/**
 * 额度通知的轻量常驻控制器(2026-08-12 交互重做后的信号路由):
 *
 *  · 6010/quota_exceeded → 记入 quota.store.lastExceeded + 刷新 overview,然后分流:
 *      - 对话位已有「被拦未发送」条(blockedStripCount>0)→ 什么都不弹,
 *        输入框上方的 QuotaComposerStrip 全权承接(含自动重发);
 *      - 其余(矩阵分析 / 翻译 / 审稿等非对话场景)→ 弹**带状态按钮**的耗尽 toast,
 *        按钮就地拉起确认弹窗(恢复额度 / 用经费继续)或升级弹窗,与对话位一致。
 *        🔴 原「额度耗尽大弹窗」已删除,任何场景都不再自动弹整页拦截弹窗。
 *    分流判定延后一拍(150ms):WS 额度帧到达时,feature 标记 blocked 的 setState
 *    还没落地,立即判会误走 toast。
 *  · 阈值提醒(50% / 80%):对话位挂着额度条时让位(条自己常显预警),否则 toast,
 *    每周期每级一次(去重持久化)。
 *  · QUOTA_RECOVERED / BILLING_CHANGED → 刷新 overview;恢复时清 lastExceeded。
 *
 * 重 UI(支付/兑换/升级弹窗)按需懒挂:首次打开后保持挂载(Radix 收尾铁律)。
 */
export function QuotaNotifierGate() {
  const queryClient = useQueryClient();
  const subscribeOpen = useQuotaStore((s) => s.subscribeOpen);
  const confirmResetOpen = useQuotaStore((s) => s.confirmResetOpen);
  const confirmPaygOpen = useQuotaStore((s) => s.confirmPaygOpen);
  const everOpened = useRef(false);
  const dataRef = useRef<QuotaOverview | undefined>(undefined);

  // 响应式登录态门控:本组件常驻 Providers 层、不订阅 auth store 时,原地弹窗登录后
  // 50%/80% 额度预警与 overview 轮询要等到窗口 focus/刷新才启动(2026-08-12 审计)。
  const authToken = useAuthStore((s) => s.token);
  const { data } = useQuery({
    queryKey: QUOTA_OVERVIEW_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: QuotaOverview }>('/user/billing/overview')).data.data,
    enabled: !!authToken,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  dataRef.current = data;

  useEffect(() => {
    const onExceeded = (event: Event) => {
      const detail = (event as CustomEvent<QuotaExceededDetail | undefined>).detail;
      const store = useQuotaStore.getState();
      store.setExceeded(detail?.message, detail?.quota);
      store.markQuotaNoticed(); // PromoModal 据此避让
      void queryClient.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });

      window.setTimeout(() => {
        const s = useQuotaStore.getState();
        if (s.blockedStripCount > 0) return; // 对话位额度条已承接
        // 非对话场景:带状态按钮的耗尽 toast(与对话位按钮矩阵同一优先级序)。
        const ov = dataRef.current;
        const quota = detail?.quota;
        const autopayOn = quota?.credit_autopay ?? ov?.credit.credit_autopay ?? false;
        const creditPositive =
          quota?.credit_balance_positive ?? (ov?.credit.total ?? 0) > 0;
        const tier = ov?.tier ?? 'free';
        const passes = ov?.reset_passes ?? 0;
        const action =
          !autopayOn && creditPositive
            ? {
                label: '用经费继续',
                onClick: () =>
                  isPhoneDevice()
                    ? quotaNavigate('/m/me')
                    : useQuotaStore.getState().openConfirmPayg(),
              }
            : tier === 'free'
              ? {
                  label: '升级会员',
                  onClick: () => {
                    if (isPhoneDevice()) quotaNavigate('/m/me?upgrade=1');
                    else useQuotaStore.getState().openSubscribe();
                  },
                }
              : passes > 0
                ? {
                    label: '立即恢复',
                    onClick: () =>
                      isPhoneDevice()
                        ? quotaNavigate('/m/me')
                        : useQuotaStore.getState().openConfirmReset(),
                  }
                : {
                    label: '充值经费',
                    onClick: () =>
                      quotaNavigate(
                        isPhoneDevice() ? '/m/me' : '/settings/membership?tab=recharge',
                      ),
                  };
        // 绝对恢复时刻必须出现在文案里(大厂调研:不许写「稍后再试」)。
        const resetAt = formatResetAt(quota?.reset_at || ov?.token.window_reset_at);
        showQuotaToast('exhausted', {
          action,
          body: resetAt
            ? `额度将于 ${resetAt} 恢复。`
            : undefined,
        });
      }, 150);
    };
    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
    };
    const onRecovered = () => {
      useQuotaStore.getState().clearExceeded();
      onRefresh();
    };
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
    window.addEventListener(BILLING_CHANGED_EVENT, onRefresh);
    window.addEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
    return () => {
      window.removeEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
      window.removeEventListener(BILLING_CHANGED_EVENT, onRefresh);
      window.removeEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!data || data.token.unlimited) return;
    // 延后一拍再判:overview 往往先于对话页 composer 挂载到达,立即判 stripCount
    // 会在对话页上抢跑出一条与额度条重复的阈值 toast(实测竞态)。
    const timer = window.setTimeout(() => {
      // 对话位挂着额度条 → 阈值提醒由条常显承接,不再叠 toast。
      if (useQuotaStore.getState().stripCount > 0) return;
      const day = data.token.window_started_at ?? localDateKey();
      const state = useQuotaStore.getState();
      const level = state.warnDay === day ? state.warnLevel : 0;
      const percent = data.token.percent;
      if (percent >= 80 && level < 2) {
        showQuotaToast('almost');
        state.markWarn(day, 2);
      } else if (percent >= 50 && level < 1) {
        showQuotaToast('half');
        state.markWarn(day, 1);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [data]);

  if (subscribeOpen || confirmResetOpen || confirmPaygOpen) everOpened.current = true;
  if (!everOpened.current) return null;

  return (
    <Suspense fallback={null}>
      <QuotaNotifier data={data} />
    </Suspense>
  );
}

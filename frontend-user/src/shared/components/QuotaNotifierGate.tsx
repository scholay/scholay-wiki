import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { localDateKey } from '@/shared/lib/daily-trend';
import {
  BILLING_CHANGED_EVENT,
  QUOTA_EXCEEDED_EVENT,
  QUOTA_RECOVERED_EVENT,
  type QuotaExceededDetail,
  type QuotaPayload,
} from '@/shared/lib/quota-events';
import {
  QUOTA_OVERVIEW_QUERY_KEY,
  type QuotaOverview,
} from '@/shared/lib/quota-overview';
import { useQuotaStore, QUOTA_DIALOG_SNOOZE_MS } from '@/stores/quota.store';
import { showQuotaToast } from './quota-toast';

const QuotaNotifier = lazy(() =>
  import('./QuotaNotifier').then((m) => ({ default: m.QuotaNotifier })),
);

/**
 * 额度通知的轻量常驻控制器。
 *
 * 事件监听、overview 刷新和阈值 toast 必须从首屏开始工作；支付、兑换、三层
 * Radix 弹窗等重 UI 则只在首次 6010 真正打开时下载。首次打开后保持挂载，
 * 让 Dialog 的 open→closed 清理完整发生，避免遗留 body pointer lock。
 */
export function QuotaNotifierGate() {
  const queryClient = useQueryClient();
  const resetOpen = useQuotaStore((s) => s.resetOpen);
  const openReset = useQuotaStore((s) => s.openReset);
  const [exceededMsg, setExceededMsg] = useState('');
  const [payloadQuota, setPayloadQuota] = useState<QuotaPayload | null>(null);
  const everOpened = useRef(false);

  const { data } = useQuery({
    queryKey: QUOTA_OVERVIEW_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: QuotaOverview }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const onExceeded = (event: Event) => {
      const detail = (event as CustomEvent<QuotaExceededDetail | undefined>).detail;
      setExceededMsg(detail?.message ?? '');
      setPayloadQuota(detail?.quota ?? null);
      void queryClient.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
      const state = useQuotaStore.getState();
      if (state.resetOpen) return;
      if (Date.now() - state.dismissedAt < QUOTA_DIALOG_SNOOZE_MS) {
        showQuotaToast('exhausted');
        return;
      }
      openReset();
    };
    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
    };
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
    window.addEventListener(BILLING_CHANGED_EVENT, onRefresh);
    window.addEventListener(QUOTA_RECOVERED_EVENT, onRefresh);
    return () => {
      window.removeEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
      window.removeEventListener(BILLING_CHANGED_EVENT, onRefresh);
      window.removeEventListener(QUOTA_RECOVERED_EVENT, onRefresh);
    };
  }, [openReset, queryClient]);

  useEffect(() => {
    if (!resetOpen) {
      setExceededMsg('');
      setPayloadQuota(null);
    }
  }, [resetOpen]);

  useEffect(() => {
    if (!data || data.token.unlimited) return;
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
  }, [data]);

  if (resetOpen) everOpened.current = true;
  if (!everOpened.current) return null;

  return (
    <Suspense fallback={null}>
      <QuotaNotifier
        data={data}
        exceededMsg={exceededMsg}
        payloadQuota={payloadQuota}
      />
    </Suspense>
  );
}

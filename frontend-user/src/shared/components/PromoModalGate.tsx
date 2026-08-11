import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePromoEligible } from '@/shared/api/promo';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { localDateKey } from '@/shared/lib/daily-trend';
import { QUOTA_EXCEEDED_EVENT } from '@/shared/lib/quota-events';
import { usePromoStore } from '@/stores/promo.store';
import { QUOTA_DIALOG_SNOOZE_MS, useQuotaStore } from '@/stores/quota.store';

const PromoModal = lazy(() =>
  import('./PromoModal').then((m) => ({ default: m.PromoModal })),
);

// 额度触发每个浏览器会话最多一次；组件因开发 StrictMode 重挂也不重置。
let quotaTriggeredThisSession = false;

/**
 * 常驻的推广资格/触发控制器。视觉弹窗只在 store 首次打开时下载，之后常驻以保证
 * Radix Dialog 能完成关闭清理。
 */
export function PromoModalGate() {
  const { cfg, refetchPromo, tierReady, visible } = usePromoEligible();
  const open = usePromoStore((s) => s.open);
  const openPromo = usePromoStore((s) => s.openPromo);
  const [shownDate, setShownDate] = useLocalStorage<string>('promo:auto-shown-date', '');
  const [dismissedDate] = useLocalStorage<string>('promo:dismissed-date', '');
  const autoRan = useRef(false);
  const everOpened = useRef(false);
  const retriedQRURL = useRef<string | undefined>(undefined);
  const [qrRetryNonce, setQRRetryNonce] = useState(0);

  const handleQRCodeError = useCallback(() => {
    const failedURL = cfg?.wechat_qr_url;
    if (!failedURL || retriedQRURL.current === failedURL) return;
    retriedQRURL.current = failedURL;
    void refetchPromo().finally(() => {
      // 若 summary 版本未变，仍用一次性 query 参数绕过浏览器的失败缓存重试。
      // 同一版本只重试一次，避免损坏历史数据造成请求循环。
      setQRRetryNonce((value) => value + 1);
    });
  }, [cfg?.wechat_qr_url, refetchPromo]);

  useEffect(() => {
    if (autoRan.current || cfg === undefined || !tierReady) return;
    autoRan.current = true;
    if (!visible) return;
    const today = localDateKey();
    if (shownDate === today || dismissedDate === today) return;
    setShownDate(today);
    openPromo('auto');
  }, [
    cfg,
    dismissedDate,
    openPromo,
    setShownDate,
    shownDate,
    tierReady,
    visible,
  ]);

  useEffect(() => {
    const onQuota = () => {
      if (!visible) return;
      const quota = useQuotaStore.getState();
      if (
        Date.now() - quota.dismissedAt < QUOTA_DIALOG_SNOOZE_MS ||
        quotaTriggeredThisSession
      ) {
        return;
      }
      quotaTriggeredThisSession = true;
      openPromo('quota');
    };
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
  }, [openPromo, visible]);

  if (open) everOpened.current = true;
  if (!everOpened.current) return null;

  return (
    <Suspense fallback={null}>
      <PromoModal
        cfg={cfg}
        visible={visible}
        qrRetryNonce={qrRetryNonce}
        onQRCodeError={handleQRCodeError}
      />
    </Suspense>
  );
}

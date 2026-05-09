/**
 * SettingsGate — 配置中心子页的密码二次验证 + 顶部状态条
 *
 * 行为:
 *   - 子组件用 SettingsProvider context 拿 isVerified / verifyEpoch / onRequestVerify
 *   - 任意子 Tab 触发 onRequestVerify → 弹 VerifyPasswordModal
 *   - 验证通过后 5 分钟内 isVerified=true,顶部显示绿色状态条 + 倒计时
 *   - 到期自动 false,verifyEpoch++ 触发子 Tab 重载脱敏数据
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Clock } from 'lucide-react';
import VerifyPasswordModal from '../VerifyPasswordModal';
import { SettingsProvider } from '../../pages/settings';
import { Button } from '../ui/button';

const VERIFY_TTL_MS = 5 * 60 * 1000;

interface Props {
  children: React.ReactNode;
}

export function SettingsGate({ children }: Props) {
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyEpoch, setVerifyEpoch] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 验证后启动倒计时 ticker(每秒刷新一次显示)
  useEffect(() => {
    if (isVerified) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isVerified]);

  useEffect(() => {
    return () => {
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
    };
  }, []);

  const handleVerified = useCallback(() => {
    const expire = Date.now() + VERIFY_TTL_MS;
    setIsVerified(true);
    setShowVerifyModal(false);
    setVerifyEpoch((n) => n + 1);
    setExpiresAt(expire);
    setNow(Date.now());

    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    expireTimerRef.current = setTimeout(() => {
      setIsVerified(false);
      setVerifyEpoch((n) => n + 1);
      expireTimerRef.current = null;
    }, VERIFY_TTL_MS);
  }, []);

  const handleRequestVerify = useCallback(() => {
    setShowVerifyModal(true);
  }, []);

  const handleEndEarly = useCallback(() => {
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
    setIsVerified(false);
    setVerifyEpoch((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ isVerified, verifyEpoch, onRequestVerify: handleRequestVerify }),
    [isVerified, verifyEpoch, handleRequestVerify],
  );

  const remainSec = isVerified ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
  const ss = String(remainSec % 60).padStart(2, '0');

  return (
    <SettingsProvider value={value}>
      {isVerified && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            已通过密码验证,可查看敏感字段
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 tabular-nums text-emerald-700">
              <Clock className="h-3.5 w-3.5" />
              剩余 {mm}:{ss}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-900"
              onClick={handleEndEarly}
            >
              立即结束
            </Button>
          </div>
        </div>
      )}
      {children}
      <VerifyPasswordModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerified={handleVerified}
      />
    </SettingsProvider>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 验证码倒计时 hook。start() 启动 60s 倒计时,重复调用直接重置。
 *
 *   const { seconds, isCounting, start } = useCountdown(60);
 *   start();
 *   // 渲染:isCounting ? `${seconds}s 后重发` : '获取验证码'
 */
export function useCountdown(initial = 60) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (n?: number) => {
      stop();
      setSeconds(n ?? initial);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    },
    [initial, stop]
  );

  useEffect(() => stop, [stop]);

  return { seconds, isCounting: seconds > 0, start, stop };
}

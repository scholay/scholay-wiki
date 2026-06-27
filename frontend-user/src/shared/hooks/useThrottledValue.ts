import { useEffect, useRef, useState } from 'react';

/**
 * 节流一个高频变化的值:在 intervalMs 窗口内最多让返回值更新一次(leading + trailing)。
 * 持续变化时按固定节奏推进,变化停止后用 trailing 补上最终值。
 *
 * 用途:流式 AI 回答的 markdown 正文。上游每帧(~60Hz)累积新字符,但 remark/rehype 全管线
 * (gfm + math + highlight + katex)重解析很贵;把可见更新降到 ~1000/intervalMs 次每秒,
 * 主线程重解析量级下降,消除长回答流式期间的打字卡顿。
 *
 * 与 useDebounce / useSettled 的区别:那两个在持续变化时永不更新(会让流式文本「卡住」不动);
 * throttle 保证持续变化期间也按节奏更新,只是降低频率。流式结束后调用方应直接用原始值(零延迟定稿)。
 */
export function useThrottledValue<T>(value: T, intervalMs = 100): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastEmit = useRef(0);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = value;

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastEmit.current;
    if (elapsed >= intervalMs) {
      // 距上次发射已过窗口 → 立即发射(leading)。
      lastEmit.current = now;
      setThrottled(value);
    } else if (timer.current == null) {
      // 窗口内已发射过 → 安排一个 trailing,在窗口末尾用「届时的最新值」发射。
      timer.current = setTimeout(() => {
        lastEmit.current = Date.now();
        timer.current = null;
        setThrottled(latest.current);
      }, intervalMs - elapsed);
    }
  }, [value, intervalMs]);

  // 卸载时清理挂起的 trailing。
  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    []
  );

  return throttled;
}

import { useEffect } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

/**
 * 把库的 scrollToBottom 注入外部 ref —— 让页面的"发送后滚到底"逻辑 (在 StickToBottom 外)
 * 能调到只在 StickToBottom 内部可用的 useStickToBottomContext。自身不渲染。
 * 桌面 ClawPage 与移动 MobileClawPage 共用。
 */
export function ScrollController({
  scrollRef,
}: {
  scrollRef: { current: (() => void) | null };
}) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    scrollRef.current = () => {
      void scrollToBottom();
    };
    return () => {
      scrollRef.current = null;
    };
  }, [scrollToBottom, scrollRef]);
  return null;
}

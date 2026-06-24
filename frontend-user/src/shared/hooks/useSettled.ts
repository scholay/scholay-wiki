import { useEffect, useState } from 'react';

/**
 * 「稳定后再出」——返回一个只在 value 静止 quietMs 之后才更新的快照,且**挂载瞬间不算稳定**。
 *
 * 用途:流式渲染(mermaid / SVG / HTML)。流式期间 value 每个 token 都在变,settled 一直 false,
 * 调用方据此显示稳定的 loader,绝不在「半截代码 ↔ 渲染图」之间反复横跳(页面抽搐)。
 * token 停 quietMs 后(本轮该块输出完整)settled 变 true、snapshot 落定,调用方此时一次性渲染。
 *
 * 与 useDebounce 的区别:useDebounce 初始即等于 value(挂载即"稳定"),会在流式首个 chunk 误判;
 * 本 hook 挂载先 false、必须真正静止 quietMs 才 true,故不会闪。历史消息(value 不变)= quietMs 后渲染。
 */
export function useSettled<T>(value: T, quietMs = 350): { value: T; settled: boolean } {
  const [snapshot, setSnapshot] = useState<T>(value);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => {
      setSnapshot(value);
      setSettled(true);
    }, quietMs);
    return () => clearTimeout(t);
  }, [value, quietMs]);

  return { value: snapshot, settled };
}

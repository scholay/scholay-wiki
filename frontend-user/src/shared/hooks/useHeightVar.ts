import { useCallback, useRef } from 'react';

/**
 * 把元素自身的像素高度持续写进它的一个 CSS 自定义属性 (`--<varName>`),
 * 供其后代用 `calc(var(--<varName>) * 比例)` 按"该元素高度的百分比"取值。
 *
 * 为什么不用纯 CSS 的容器查询单位 `cqh`:
 *   `cqh` 需要祖先声明 `container-type: size`, 而 size 容器要求该元素**两个方向都有确定尺寸**。
 *   在 flex-1 / min-h-0 这类「由 flex 解析高度」的嵌套链下, 浏览器常判定其 block-size 非确定,
 *   于是 `cqh` 解析为 0 → 形同未设 (实测踩到)。用 JS + ResizeObserver 直接量像素最稳。
 *
 * 为什么是 **callback ref** 而不是 useEffect+RefObject:
 *   被量的元素常处于条件渲染分支里 (例: 智能搜索"有对话才渲染"的对话框)。useEffect 只在
 *   组件挂载那一刻读一次 ref —— 若那时元素还没出现, observer 永远挂不上, 之后元素出现也不再测,
 *   变量始终为空 → 退回 fallback (偏大/不自适应)。callback ref 在元素**真正挂载/卸载时**被 React
 *   调用, 天然适配条件渲染: 元素一出现就立刻测量并 observe, 卸载时断开。
 *
 * 用法:
 *   const ref = useHeightVar<HTMLDivElement>('chat-area-h');   // varName 不带 -- 前缀
 *   <div ref={ref}>… 后代里 className="pb-[calc(var(--chat-area-h,100dvh)*0.3)]" …</div>
 *
 * 注意: 设置该 CSS 变量不会改变被观测元素自身尺寸 (变量只影响后代的 padding/min-height,
 * 即滚动内容高度, 不影响滚动视口本身高度), 故不会触发 ResizeObserver 回环。
 */
export function useHeightVar<T extends HTMLElement = HTMLElement>(
  varName: string,
): (el: T | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback(
    (el: T | null) => {
      // 先断开上一个被观测元素 (元素切换/卸载)
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!el) return;
      const cssVar = `--${varName}`;
      const apply = () => el.style.setProperty(cssVar, `${el.clientHeight}px`);
      apply();
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      cleanupRef.current = () => ro.disconnect();
    },
    [varName],
  );
}

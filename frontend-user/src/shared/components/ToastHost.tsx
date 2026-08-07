import { useEffect, useRef } from 'react';
import { Toaster } from 'sonner';

/**
 * 全站唯一的 toast 挂载点 —— sonner 的 `<Toaster>` 再加一条「点整条即关闭」。
 *
 * **为什么要补这一层**:sonner 1.7 只给了两条关闭路径 —— 右上角那枚 16px 的关闭键,
 * 以及横向划走(阈值 45px)。关闭键落在屏幕右上角、又只有 16px,鼠标要瞄准才点得中
 * (用户原话:「关闭按钮不好聚焦命中」);划走在触屏上顺手,但鼠标用户根本不会发现它。
 * 所以补第三条:**点 toast 上任意非交互区域即关**。原关闭键保留(它是「这东西可关」的
 * 可发现性线索),只是不再是唯一入口。
 *
 * **为什么走事件委托而不是给每条 toast 包一层**:sonner 不把 toast id 落到 DOM 上
 * (只有 React key),外部拿不到 id 就调不了 `toast.dismiss(id)`;但它给自带的关闭键留了
 * `[data-close-button]`(公开的样式钩子)。于是这里只做一件事 —— **把这次点击转发给那枚键**。
 * 退场动画、`onDismiss` 回调、loading 态与 `dismissible: false` 的豁免(那两种情况下 sonner
 * 自己把关闭键的 onClick 换成空函数),全部原样继承,我们一行状态机都不用复制。
 *
 * ⚠️ 唯一的盲区:`toast.custom(jsx)` 那一类 sonner **刻意不渲染关闭键**
 * (源码判据 `closeButton && !toast.jsx`),委托层对它无能为力。这类 toast 请在自己的
 * JSX 根节点上挂 `onClick={() => toast.dismiss(id)}` —— `toast.custom` 的渲染函数直接
 * 拿得到 id,见 [quota-toast.tsx](./quota-toast.tsx)(全站目前唯一的 custom toast)。
 */

// 自带点击语义的元素:动作按钮 / 链接 / 表单控件 / 关闭键本身。这些不抢 —— 它们各有各的去处,
// 抢过来会把「点动作按钮」变成「关掉 toast」。
const INTERACTIVE =
  'a, button, input, textarea, select, label, [role="button"], [role="link"], [contenteditable="true"]';

// 指针从按下到抬起的位移超过这个距离,视为「划走 / 拖着选字」而不是「点一下」。
// sonner 自己的滑动关闭阈值是 45px:落在 [10, 45) 这段的是「划了一半又收手」,那时它把 toast
// 弹回原位,我们也就不该替它关掉。
const CLICK_SLOP = 10;

export function ToastHost() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // 按下点。只在 toaster 子树内更新,并在每次 click 后清空 —— 免得上一次交互的坐标残留下来,
    // 把下一次(比如程序触发的)点击误判成拖动。
    let downAt: { x: number; y: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };

    const onClick = (e: MouseEvent) => {
      const from = downAt;
      downAt = null;

      const target = e.target instanceof Element ? e.target : null;
      const toastEl = target?.closest<HTMLElement>('[data-sonner-toast]');
      if (!toastEl) return;
      if (target?.closest(INTERACTIVE)) return; // 交互元素自己说了算
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP) return; // 划走/拖动
      if (window.getSelection()?.toString()) return; // 正在选中文字(复制报错信息)不算点击

      toastEl.querySelector<HTMLElement>('[data-close-button]')?.click();
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <Toaster
      ref={rootRef}
      position="top-right"
      richColors
      closeButton
      // 整条可点 → 给出 hover 手势(Tailwind v4 的 preflight 不给 button 默认 pointer,
      // 这里由 li 往下继承,内部按钮也跟着是手型,与「哪都能点」的新语义一致)。
      toastOptions={{ classNames: { toast: 'cursor-pointer' } }}
    />
  );
}

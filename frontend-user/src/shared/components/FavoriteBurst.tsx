import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useFavoriteBurst } from '@/stores/favorite-burst.store';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 收藏成功的 "+1" 浮起动画 —— 锚到指定 DOM(传 anchorRef)。
 *
 * **为什么用 Portal + position:fixed**:
 * 侧栏 SidebarContent 用了 ScrollArea(`overflow: hidden`),burst 若挂在
 * SidebarSection 内部用 `position: absolute` + 向上飘,**飘出 section 边界就被
 * ScrollArea viewport 裁掉,看不到动画**。这里改成挂到 document.body 的 portal,
 * 配合实时测量 anchor 的 getBoundingClientRect 计算屏幕坐标,完全摆脱祖先
 * overflow/stacking 干扰。
 *
 * **多次连点错位**:每个 burst 按 id `(id % 3 - 1) * 12` 取 x 偏移,视觉错开。
 *
 * 用法:
 *   const anchorRef = useRef<HTMLDivElement>(null);
 *   return (
 *     <div ref={anchorRef}>
 *       <SidebarSection ...>...</SidebarSection>
 *     </div>
 *     <FavoriteBurst anchorRef={anchorRef} />
 *   );
 */
interface FavoriteBurstProps {
  anchorRef: RefObject<HTMLElement | null>;
}

export function FavoriteBurst({ anchorRef }: FavoriteBurstProps) {
  const bursts = useFavoriteBurst((s) => s.bursts);
  // 注册为"可见 sink",但仅当 sidebar 展开时(收起 → anchor 宽度 0 不可见 → 不算)
  // 没有可见 sink 时 useFavoriteBurst.pushBurst 会 fallback 到 toast。
  const expanded = useSidebar((s) => s.expanded);
  useEffect(() => {
    if (!expanded) return;
    useFavoriteBurst.getState().addSink();
    return () => useFavoriteBurst.getState().removeSink();
  }, [expanded]);

  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // anchor 屏幕坐标 —— 初始 + 每次有新 burst + 滚动/resize 都重新测一遍
  useEffect(() => {
    const recompute = () => {
      const el = anchorRef.current;
      if (!el) {
        setPos((prev) => (prev === null ? prev : null)); // 值未变则复用旧引用,不触发重渲
        return;
      }
      const r = el.getBoundingClientRect();
      // ⚠️ 幂等 setState:坐标没变就返回旧引用,**绝不**每次都 new 一个对象。
      //   否则:本 effect 依赖 bursts.length,配合 scroll(capture)监听在页面有持续滚动/重排源
      //   (如聊天贴底动画、矩阵分析加载重排)时会 setPos→重渲→effect 再跑→setPos… 触发 React
      //   「Maximum update depth exceeded」的**静默**重渲风暴(prod 剥了该 warning,只见 CPU 打满,
      //   dev 下 2000+次/进页;智能模式 + 有暂存论文的重型工作区把每次重渲放大到 ~75% CPU)。
      setPos((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width
          ? prev
          : { top: r.top, left: r.left, width: r.width },
      );
    };
    recompute();
    // capture: true 让滚动事件包括内层 ScrollArea 的滚动也能触发
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
    // bursts.length 加进 deps 让有新 burst 时重测(用户可能滚动后再点收藏)
  }, [anchorRef, bursts.length]);

  if (!pos || bursts.length === 0) return null;

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-[9999]"
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        // 自身高度 0,burst 通过 transform 浮起,不参与布局
        height: 0,
      }}
    >
      <AnimatePresence>
        {bursts.map((id) => (
          <BurstItem key={id} id={id} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

function BurstItem({ id }: { id: number }) {
  const removeBurst = useFavoriteBurst((s) => s.removeBurst);

  // (id % 3 - 1) → -1 / 0 / 1 → 横向错位 -12 / 0 / 12 px
  const dx = ((id % 3) - 1) * 12;

  // 兜底:动画 onComplete 没触发(快速 unmount 等)就 1s 后强制清理
  useEffect(() => {
    const t = setTimeout(() => removeBurst(id), 1000);
    return () => clearTimeout(t);
  }, [id, removeBurst]);

  return (
    <motion.span
      // 起点:贴 section header 上沿稍下,缩放 0.6 不可见
      // 关键帧:bounce-in → 上飘 ~36px → 淡出
      initial={{ opacity: 0, x: dx, y: 8, scale: 0.6 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [8, -4, -22, -38],
        scale: [0.6, 1.05, 1, 0.9],
      }}
      transition={{
        duration: 0.85,
        times: [0, 0.18, 0.7, 1],
        ease: 'easeOut',
      }}
      onAnimationComplete={() => removeBurst(id)}
      // absolute relative to portal container(fixed at section's screen coord)
      // 居中 + 微妙红色阴影增强可读性
      className="absolute left-1/2 top-0 -translate-x-1/2 inline-flex h-5 px-2 items-center rounded-pill bg-brand-red text-white text-2xs font-bold tabular-nums"
    >
      +1
    </motion.span>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useStageFly, type RectLike } from '@/stores/stage-fly.store';

/**
 * 暂存「飞入」覆盖层 —— portal 到 body 的一枚绿色芯片,从左侧论文卡**飞入**右侧矩阵落点。
 *
 * 与 [[FavoriteBurst]] 同套 portal + framer-motion 位移套路,但这里是**跨栏**:源 rect 由
 * stagePaper 抓卡片 `data-paper-id` 给出(存 [[stage-fly.store]]),落点由 MatrixColumn 注册的
 * getTarget()(先把矩阵滚到底再返回底部落点 rect)在下一帧算出。用 x/y transform 位移(GPU 友好),
 * 不 tween top/left(触发 layout)。芯片抵达即淡出,与右侧新行的出现(auto-animate)完成交接。
 *
 * 挂载点:SearchPage 顶层挂一份即可(传统 / 智能两种暂存都经同一个 stagePaper choke point)。
 */
export function StageFlyLayer() {
  const fly = useStageFly((s) => s.fly);
  const getTarget = useStageFly((s) => s.getTarget);
  const endFly = useStageFly((s) => s.endFly);
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<RectLike | null>(null);

  useEffect(() => {
    if (!fly) {
      setTarget(null);
      return;
    }
    // reduced-motion:不做位移动画,直接收场(右侧新行照常出现)。
    if (reduce) {
      endFly(fly.id);
      return;
    }
    // 先清落点:连续暂存换 fly 时,避免用「新源 + 旧落点」渲染出一帧错位芯片
    // (render 里 target 为 null 即隐藏,等下面 rAF 量到新落点再现身)。
    setTarget(null);
    // 下一帧再量落点:让 MatrixColumn 先把矩阵滚到底,拿到滚动后的底部 rect。
    const raf = requestAnimationFrame(() => {
      const t = getTarget?.() ?? null;
      if (!t) {
        endFly(fly.id); // 落点没了(矩阵卸载等)→ 不飞
        return;
      }
      setTarget(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [fly, getTarget, endFly, reduce]);

  if (!fly || !target) return null;

  const dx = target.left - fly.from.left;
  const dy = target.top - fly.from.top;
  // 芯片宽度:取源卡与落点列的较小者,封顶 300(飞行中不 tween 宽度,避免 layout 抖动)。
  const width = Math.min(fly.from.width, target.width, 300);

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9998]">
      <motion.div
        key={fly.id}
        initial={{ x: 0, y: 0, opacity: 0, scale: 0.96 }}
        animate={{
          x: dx,
          y: dy,
          opacity: [0, 1, 1, 0],
          scale: [0.96, 1, 0.98, 0.9],
        }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1],
          times: [0, 0.16, 0.8, 1],
        }}
        onAnimationComplete={() => endFly(fly.id)}
        style={{ position: 'fixed', top: fly.from.top, left: fly.from.left, width }}
      >
        {/* StagedRow 同款绿色芯片:圆形对勾 + 标题截断 */}
        <div className="flex items-center gap-2 rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-2 shadow-[0_8px_24px_rgba(42,122,42,0.22)] backdrop-blur-sm">
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-pill bg-brand-green text-white">
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-subtle">
            {fly.title || '已暂存'}
          </span>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import {
  resolveStageFlyTarget,
  useStageFly,
  type RectLike,
} from '@/stores/stage-fly.store';

/**
 * 暂存「飞入」覆盖层 —— portal 芯片从论文卡飞入侧栏「暂存」文件夹
 * (无侧栏锚点时回落矩阵行)。SearchPage 挂一份即可。
 */
export function StageFlyLayer() {
  const fly = useStageFly((s) => s.fly);
  const endFly = useStageFly((s) => s.endFly);
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<RectLike | null>(null);

  useEffect(() => {
    if (!fly) {
      setTarget(null);
      return;
    }
    if (reduce) {
      endFly(fly.id);
      return;
    }
    setTarget(null);
    // 双 rAF:等暂存文件夹展开 / 新行落 DOM 后再量落点
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const t = resolveStageFlyTarget();
        if (!t) {
          endFly(fly.id);
          return;
        }
        setTarget(t);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [fly, endFly, reduce]);

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
          duration: 0.72,
          ease: [0.22, 1, 0.36, 1],
          times: [0, 0.12, 0.78, 1],
        }}
        onAnimationComplete={() => endFly(fly.id)}
        style={{
          position: 'fixed',
          top: fly.from.top,
          left: fly.from.left,
          width,
        }}
      >
        <div className="flex items-center gap-2 rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-2 shadow-lg backdrop-blur-sm">
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-pill bg-brand-green text-white">
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-subtle">
            {fly.title || '已暂存'}
          </span>
          <span className="shrink-0 text-2xs font-bold text-brand-green">
            → 暂存
          </span>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

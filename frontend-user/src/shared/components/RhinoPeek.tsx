import { useEffect, useRef, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RhinoPerchMark } from '@/shared/components/brand/RhinoPerchMark';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import {
  PERCH_PULL_OUT_PX,
  isRhinoNested,
  perchEmergeRest,
  registerRhinoPerch,
  unregisterRhinoPerch,
} from '@/shared/mascot/rhino-perch';
import { persistFloatingPos } from '@/shared/mascot/rhino-edge-dock';
import { cn } from '@/shared/lib/utils';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/**
 * In-page nest for 牛犀犀. Empty while the floating mascot is out;
 * occupied slot is the mascot itself (drag / click to pull out).
 */
export function RhinoPeek({
  playOnceKey,
  windowClassName = 'h-12 w-20',
  markClassName = 'h-16 w-auto',
  className,
}: {
  playOnceKey?: string;
  windowClassName?: string;
  markClassName?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const occupied = useRhinoAssistant(isRhinoNested);
  const setPerchPresent = useRhinoAssistant((s) => s.setPerchPresent);
  const showFromPerch = useRhinoAssistant((s) => s.showFromPerch);
  const leavingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = playOnceKey ?? 'rhino-perch';
    registerRhinoPerch(id, el);
    setPerchPresent(true);
    return () => {
      unregisterRhinoPerch(id);
      const st = useRhinoAssistant.getState();
      st.setPerchPresent(false);
      if (st.hidden && st.hideKind === 'perch') {
        const rect = el.getBoundingClientRect();
        persistFloatingPos(perchEmergeRest(rect, RHINO_DISPLAY_PX, 12));
        st.showFromPerch(false);
      }
    };
  }, [playOnceKey, setPerchPresent]);

  const pullOut = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const el = ref.current;
    if (el) {
      persistFloatingPos(
        perchEmergeRest(el.getBoundingClientRect(), RHINO_DISPLAY_PX, 12),
      );
    }
    showFromPerch(true);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || leavingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (leavingRef.current) return;
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < 36) return;
    d.moved = true;
    if (Math.hypot(dx, dy) >= PERCH_PULL_OUT_PX) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      dragRef.current = null;
      pullOut();
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (leavingRef.current) return;
    if (!d.moved) pullOut();
  };

  const mark = (
    <motion.div
      className="pointer-events-none absolute top-0 right-0 z-0"
      initial={reduce ? false : { y: 56, opacity: 0.25 }}
      animate={{ y: 0, opacity: 1 }}
      transition={
        reduce ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 20 }
      }
    >
      <RhinoPerchMark className={cn('-scale-x-100', markClassName)} />
    </motion.div>
  );

  return (
    <div
      ref={ref}
      className={cn('relative z-[61] overflow-hidden', windowClassName, className)}
    >
      {occupied ? (
        <button
          type="button"
          aria-label={`放出${RHINO_NAME}`}
          title={`放出${RHINO_NAME}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'absolute inset-0 touch-none cursor-grab outline-none',
            'active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/30',
          )}
        >
          {mark}
        </button>
      ) : null}
    </div>
  );
}

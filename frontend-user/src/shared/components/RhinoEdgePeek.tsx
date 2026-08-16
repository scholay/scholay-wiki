import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import {
  EDGE_HEIGHT_PX,
  EDGE_HIT_H,
  EDGE_HIT_W,
  EDGE_PEEK_PX,
  EDGE_WIDTH_PX,
  PULL_OUT_PX,
  clampEdgeTop,
  loadEdgeSide,
  loadEdgeTop,
  persistEdgeTop,
  persistFloatingPos,
  restPosFromEdgeTop,
  type RhinoEdgeSide,
} from '@/shared/mascot/rhino-edge-dock';
import {
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import { cn } from '@/shared/lib/utils';
import { RhinoHoverMenu, useRhinoHoverOpen } from './RhinoHoverMenu';

const SRC = '/brand/rhino-edge-stand.svg';
const MOVE_EPS_SQ = 64;
const VANISH_MS = 160;

/**
 * Hidden 牛犀犀 — docked to the left or right viewport edge.
 * Left uses the same standing art, mirrored. Vertical drag parks.
 * A short inward tug / click vanishes the art in place, then the
 * floating sprite jumps inward from the visible side.
 */
export function RhinoEdgePeek() {
  const hidden = useRhinoAssistant((s) => s.hidden);
  const showFromEdge = useRhinoAssistant((s) => s.showFromEdge);
  const reduce = !!useReducedMotion();
  const btnRef = useRef<HTMLButtonElement>(null);
  const pendingPanelRef = useRef<RhinoPanelMode | undefined>(undefined);
  const [side] = useState<RhinoEdgeSide>(() =>
    typeof window === 'undefined' ? 'right' : loadEdgeSide(),
  );
  const onLeft = side === 'left';
  const [top, setTop] = useState(() =>
    typeof window === 'undefined' ? 240 : loadEdgeTop(),
  );
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTop: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onResize = () => setTop((t) => clampEdgeTop(t));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const vanishThenEmerge = useCallback(
    (edgeTop: number, panel?: RhinoPanelMode) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      pendingPanelRef.current = panel;
      persistEdgeTop(edgeTop);
      persistFloatingPos(
        restPosFromEdgeTop(edgeTop, RHINO_DISPLAY_PX, 12, side),
      );
      if (reduce) {
        showFromEdge(panel);
        return;
      }
      setLeaving(true);
    },
    [reduce, showFromEdge, side],
  );

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(
      () => showFromEdge(pendingPanelRef.current),
      VANISH_MS,
    );
    return () => window.clearTimeout(id);
  }, [leaving, showFromEdge]);

  const hover = useRhinoHoverOpen(!dragging && !leaving);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || leavingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTop: top,
      moved: false,
    };
  };

  const inwardPull = (dx: number) => (onLeft ? dx : -dx);

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (leavingRef.current) return;
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < MOVE_EPS_SQ) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    const nextTop = clampEdgeTop(d.originTop + dy);
    setTop(nextTop);
    if (inwardPull(dx) >= PULL_OUT_PX) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      dragRef.current = null;
      setDragging(false);
      vanishThenEmerge(nextTop);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (leavingRef.current) return;
    const pulled = inwardPull(e.clientX - d.startX);
    const nextTop = clampEdgeTop(d.originTop + (e.clientY - d.startY));
    persistEdgeTop(nextTop);
    setTop(nextTop);
    setDragging(false);

    if (!d.moved || pulled >= PULL_OUT_PX) {
      vanishThenEmerge(nextTop);
    }
  };

  if (!hidden) return null;

  const hideX = onLeft ? -(EDGE_PEEK_PX + 8) : EDGE_PEEK_PX + 8;
  const enterX = onLeft ? -EDGE_PEEK_PX : EDGE_PEEK_PX;

  return (
    <motion.button
      ref={btnRef}
      type="button"
      aria-label={`放出${RHINO_NAME}`}
      title={`放出${RHINO_NAME}`}
      onPointerEnter={hover.onEnter}
      onPointerLeave={hover.onLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      initial={reduce ? false : { x: enterX, opacity: 1 }}
      animate={leaving ? { x: hideX, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : leaving
            ? { duration: VANISH_MS / 1000, ease: [0.4, 0, 1, 1] }
            : { type: 'spring', stiffness: 320, damping: 26 }
      }
      className={cn(
        'group/peek fixed z-[60]',
        onLeft ? 'left-0' : 'right-0',
        'pointer-events-auto touch-none select-none',
        'cursor-grab active:cursor-grabbing',
        dragging && 'cursor-grabbing',
        leaving && 'pointer-events-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
      style={{ top, width: EDGE_HIT_W, height: EDGE_HIT_H }}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 overflow-hidden',
          onLeft ? 'left-0' : 'right-0',
          reduce || dragging || leaving
            ? ''
            : 'transition-[width] duration-300 ease-out',
          'w-[var(--peek)] group-hover/peek:w-[var(--hover)] group-focus-visible/peek:w-[var(--hover)]',
        )}
        style={
          {
            height: EDGE_HEIGHT_PX,
            '--peek': `${EDGE_PEEK_PX}px`,
            '--hover': `${EDGE_WIDTH_PX}px`,
          } as CSSProperties
        }
      >
        <img
          src={SRC}
          alt=""
          draggable={false}
          width={EDGE_WIDTH_PX}
          height={EDGE_HEIGHT_PX}
          className={cn(
            'h-full w-auto max-w-none drop-shadow-md',
            onLeft && 'absolute right-0 -scale-x-100',
          )}
        />
      </span>
      <RhinoHoverMenu
        open={hover.open}
        onSelect={(mode) => vanishThenEmerge(top, mode)}
        portalAnchor={btnRef}
        portalSide={onLeft ? 'right' : 'left'}
        onPointerEnter={hover.onEnter}
        onPointerLeave={hover.onLeave}
      />
    </motion.button>
  );
}

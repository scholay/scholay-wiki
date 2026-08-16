import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useUnreadCount } from '@/shared/api/notifications';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useMascotSprite } from '@/shared/mascot/useMascotSprite';
import {
  NEST_SIT_LIFT_PX,
  PERCH_PULL_OUT_PX,
  isRhinoNested,
  perchEmergeRest,
  registerRhinoPerch,
  unregisterRhinoPerch,
} from '@/shared/mascot/rhino-perch';
import { persistFloatingPos } from '@/shared/mascot/rhino-edge-dock';
import { cn } from '@/shared/lib/utils';
import { useAuthStatus } from '@/stores/auth.store';
import {
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import {
  RhinoHoverMenu,
  RhinoUnreadBadge,
  useRhinoHoverOpen,
} from './RhinoHoverMenu';

/** Occupied nest sprite — same display size as the floating mascot. */
const NEST_SPRITE_PX = RHINO_DISPLAY_PX;

/** Sit faces right in art. If the nest is on the right of its row, flip to face in. */
function nestSitsOnRight(el: HTMLElement): boolean {
  const nest = el.getBoundingClientRect();
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const box = node.getBoundingClientRect();
    if (box.width >= nest.width * 2.5) {
      return nest.left + nest.width / 2 > box.left + box.width / 2;
    }
    node = node.parentElement;
  }
  return nest.left + nest.width / 2 > window.innerWidth / 2;
}

/**
 * Logo nest: vacant = original mark;
 * occupied = stand→sit, then sit-hold at the floating mascot's native size.
 * Drag / click pulls the mascot out.
 */
export function RhinoLogoNest({
  children,
  playOnceKey = 'scholay.logo-nest',
  className,
}: {
  children: ReactNode;
  playOnceKey?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const occupied = useRhinoAssistant(isRhinoNested);
  const setPerchPresent = useRhinoAssistant((s) => s.setPerchPresent);
  const showFromPerch = useRhinoAssistant((s) => s.showFromPerch);
  const hide = useRhinoAssistant((s) => s.hide);
  const { authenticated } = useAuthStatus();
  const unreadQ = useUnreadCount(authenticated);
  const unread = authenticated ? (unreadQ.data ?? 0) : 0;
  const hover = useRhinoHoverOpen(occupied);
  const { frameSrc, play } = useMascotSprite('idle-s');
  const ref = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLButtonElement>(null);
  const [faceLeft, setFaceLeft] = useState(false);
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
    registerRhinoPerch(playOnceKey, el);
    setPerchPresent(true);
    return () => {
      unregisterRhinoPerch(playOnceKey);
      const st = useRhinoAssistant.getState();
      st.setPerchPresent(false);
      if (st.hidden && st.hideKind === 'perch') {
        persistFloatingPos(
          perchEmergeRest(el.getBoundingClientRect(), RHINO_DISPLAY_PX, 12),
        );
        st.showFromPerch(false);
      }
    };
  }, [playOnceKey, setPerchPresent]);

  useLayoutEffect(() => {
    if (!occupied) return;
    const el = ref.current;
    if (!el) return;
    const sync = () => setFaceLeft(nestSitsOnRight(el));
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [occupied]);

  useEffect(() => {
    if (!occupied) return;
    let cancelled = false;
    void (async () => {
      if (reduce) {
        await play('sit-hold', { loop: true });
        return;
      }
      await play('sit-to-stand-s', { reverse: true, loop: false });
      if (cancelled) return;
      await play('sit-hold', { loop: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [occupied, play, reduce]);

  const persistEmerge = () => {
    const el = ref.current;
    if (!el) return;
    persistFloatingPos(
      perchEmergeRest(el.getBoundingClientRect(), RHINO_DISPLAY_PX, 12),
    );
  };

  const pullOut = (panel?: RhinoPanelMode) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    persistEmerge();
    showFromPerch(true, panel);
  };

  /** 巢内菜单「隐藏」:收进右上角导航条 chip(边缘/巢是归位,不算隐藏)。 */
  const hideToNav = () => {
    persistEmerge();
    hide('nav');
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

  return (
    <div
      ref={ref}
      className={cn(
        'relative z-[61] inline-flex shrink-0 items-center justify-center overflow-visible',
        occupied && 'pointer-events-auto',
        className,
      )}
      onPointerEnter={hover.onEnter}
      onPointerLeave={hover.onLeave}
    >
      {occupied ? (
        <>
          <div className="relative inline-flex items-center justify-center overflow-visible">
            <motion.span
              aria-hidden
              className="relative z-0 pointer-events-none"
              initial={reduce ? false : { opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }
              }
            >
              {children}
            </motion.span>
            {/* Native-size sprite, centered on the nest — not scaled to the mark. */}
            <button
              ref={spriteRef}
              type="button"
              aria-label={`放出${RHINO_NAME}`}
              title={`放出${RHINO_NAME}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={cn(
                'absolute left-1/2 top-1/2 z-[1]',
                'touch-none cursor-grab outline-none',
                'active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
              style={{
                width: NEST_SPRITE_PX,
                height: NEST_SPRITE_PX,
                transform: `translate(-50%, calc(-50% - ${NEST_SIT_LIFT_PX}px))`,
              }}
            >
              <img
                src={frameSrc}
                alt=""
                draggable={false}
                width={NEST_SPRITE_PX}
                height={NEST_SPRITE_PX}
                className={cn(
                  'pointer-events-none size-full select-none drop-shadow-md',
                  faceLeft && '-scale-x-100',
                )}
              />
              <RhinoUnreadBadge
                count={hover.open ? 0 : unread}
                className={
                  faceLeft
                    ? 'right-auto left-[18%] -translate-x-1/4'
                    : undefined
                }
              />
            </button>
          </div>
          <RhinoHoverMenu
            open={hover.open}
            onSelect={(mode) => pullOut(mode)}
            onHide={hideToNav}
            portalAnchor={spriteRef}
            onPointerEnter={hover.onEnter}
            onPointerLeave={hover.onLeave}
          />
        </>
      ) : (
        children
      )}
    </div>
  );
}

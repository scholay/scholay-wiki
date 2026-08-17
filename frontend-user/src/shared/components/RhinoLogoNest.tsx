import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useUnreadCount } from '@/shared/api/notifications';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useMascotSprite } from '@/shared/mascot/useMascotSprite';
import {
  CORNER_PERCH_ID,
  HOME_CARD_PERCH_ID,
  NEST_SIT_LIFT_PX,
  PERCH_PRIORITY_PAGE,
  PERCH_PULL_OUT_PX,
  getActivePerchId,
  isRhinoNestedAt,
  perchEmergeRest,
  registerRhinoPerch,
  unregisterRhinoPerch,
} from '@/shared/mascot/rhino-perch';
import { persistFloatingPos } from '@/shared/mascot/rhino-edge-dock';
import { cn } from '@/shared/lib/utils';
import { useAuthStatus } from '@/stores/auth.store';
import {
  RHINO_CLAW_GREET,
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import {
  RhinoHoverMenu,
  RhinoUnreadBadge,
  useRhinoHoverOpen,
} from './RhinoHoverMenu';
import { RhinoSpeechBubble } from './RhinoSpeechBubble';

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
 * Logo nest: vacant = sit-pose dashed outline (or empty for hidden corner);
 * occupied = stand→sit, then sit-hold. On 智能助手 the nest jumps, waves,
 * greets, then sits back.
 * Drag / click pulls the mascot out.
 */
export function RhinoLogoNest({
  children,
  playOnceKey = 'scholay.logo-nest',
  priority = PERCH_PRIORITY_PAGE,
  faceLeft: faceLeftProp,
  className,
  style,
}: {
  children: ReactNode;
  playOnceKey?: string;
  priority?: number;
  /** Force sit facing left (corner nest on the right edge). */
  faceLeft?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const onClaw =
    pathname === '/claw' ||
    pathname.startsWith('/claw/') ||
    pathname.startsWith('/m/claw');
  const occupied = useRhinoAssistant((s) =>
    isRhinoNestedAt(playOnceKey, s),
  );
  const showFromPerch = useRhinoAssistant((s) => s.showFromPerch);
  const hide = useRhinoAssistant((s) => s.hide);
  const speech = useRhinoAssistant((s) => s.speech);
  const dismissSpeech = useRhinoAssistant((s) => s.dismissSpeech);
  const maybeHomeGreet = useRhinoAssistant((s) => s.maybeHomeGreet);
  const tourGuiding = useRhinoAssistant((s) => s.tourGuiding);
  const { authenticated } = useAuthStatus();
  const unreadQ = useUnreadCount(authenticated);
  const unread = authenticated ? (unreadQ.data ?? 0) : 0;
  const hover = useRhinoHoverOpen(occupied);
  const { frameSrc, play } = useMascotSprite('idle-s');
  const ref = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLButtonElement>(null);
  const [faceLeftState, setFaceLeft] = useState(false);
  const leavingRef = useRef(false);
  const sittingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerRhinoPerch(playOnceKey, el, priority);
    return () => {
      const wasNestedHere =
        useRhinoAssistant.getState().hidden &&
        useRhinoAssistant.getState().hideKind === 'perch' &&
        getActivePerchId() === playOnceKey;
      unregisterRhinoPerch(playOnceKey);
      if (!wasNestedHere) return;
      if (getActivePerchId()) return;
      persistFloatingPos(
        perchEmergeRest(el.getBoundingClientRect(), RHINO_DISPLAY_PX, 12),
      );
      useRhinoAssistant.getState().showFromPerch(false);
    };
  }, [playOnceKey, priority]);

  // Nest stays mounted while the mascot is out; reset pull guard on each re-dock.
  useEffect(() => {
    if (occupied) leavingRef.current = false;
  }, [occupied]);

  useLayoutEffect(() => {
    if (faceLeftProp !== undefined) return;
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
  }, [faceLeftProp]);

  const faceLeft = faceLeftProp ?? faceLeftState;

  useEffect(() => {
    if (!occupied) {
      sittingRef.current = false;
      return;
    }
    const clawGreet = playOnceKey === CORNER_PERCH_ID && onClaw;
    let cancelled = false;
    void (async () => {
      if (reduce) {
        sittingRef.current = true;
        await play('sit-hold', { loop: true });
        if (clawGreet && !cancelled) {
          useRhinoAssistant.getState().speak(RHINO_CLAW_GREET, {
            id: 'claw-greet',
            ttlMs: 8_000,
          });
        }
        return;
      }
      if (clawGreet) {
        if (sittingRef.current) {
          await play('sit-to-stand-s', { loop: false });
          if (cancelled) return;
          sittingRef.current = false;
        }
        await play('pet-jump');
        if (cancelled) return;
        await play('wave-s');
        if (cancelled) return;
        useRhinoAssistant.getState().speak(RHINO_CLAW_GREET, {
          id: 'claw-greet',
          ttlMs: 8_000,
        });
        await play('sit-to-stand-s', { reverse: true, loop: false });
        if (cancelled) return;
        sittingRef.current = true;
        await play('sit-hold', { loop: true });
        return;
      }
      if (sittingRef.current) {
        await play('sit-hold', { loop: true });
        return;
      }
      await play('sit-to-stand-s', { reverse: true, loop: false });
      if (cancelled) return;
      sittingRef.current = true;
      await play('sit-hold', { loop: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [occupied, onClaw, playOnceKey, play, reduce]);

  // Sit clip is 9 frames @ 10fps. Greet after the sit lands, not after play()
  // (Strict Mode / clip swaps cancel that promise and used to swallow the bubble).
  useEffect(() => {
    if (!occupied || playOnceKey !== HOME_CARD_PERCH_ID) return;
    const id = window.setTimeout(
      () => maybeHomeGreet(),
      reduce ? 120 : 960,
    );
    return () => window.clearTimeout(id);
  }, [maybeHomeGreet, occupied, playOnceKey, reduce]);

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

  const sitSlotStyle = {
    width: NEST_SPRITE_PX,
    height: NEST_SPRITE_PX,
    transform: `translate(-50%, calc(-50% - ${NEST_SIT_LIFT_PX}px))`,
  } as const;

  return (
    <div
      ref={ref}
      className={cn(
        'relative z-[61] inline-flex shrink-0 items-center justify-center overflow-visible',
        occupied && 'pointer-events-auto',
        className,
      )}
      style={style}
      onPointerEnter={hover.onEnter}
      onPointerLeave={hover.onLeave}
    >
      {occupied ? (
        <>
          <div
            className="absolute left-1/2 top-1/2 overflow-visible"
            style={sitSlotStyle}
          >
            <motion.span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-0',
                faceLeft && '-scale-x-100',
              )}
              initial={reduce ? false : { opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }
              }
            >
              {children}
            </motion.span>
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
                'relative z-[1] size-full touch-none cursor-grab outline-none',
                'active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/30',
                tourGuiding && 'pointer-events-none opacity-0',
              )}
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
            open={hover.open && !speech}
            onSelect={(mode) => pullOut(mode)}
            onHide={hideToNav}
            portalAnchor={spriteRef}
            onPointerEnter={hover.onEnter}
            onPointerLeave={hover.onLeave}
          />
          <RhinoSpeechBubble
            open={Boolean(speech)}
            text={speech?.text ?? ''}
            portalAnchor={spriteRef}
            prompt={
              speech?.id === 'claw-greet'
                ? {
                    confirmLabel: '确认',
                    dismissLabel: '不用了',
                    seconds: 5,
                    onConfirm: () => {
                      dismissSpeech();
                      useRhinoAssistant.getState().requestClawTour();
                    },
                    onDismiss: () => dismissSpeech(),
                  }
                : undefined
            }
            onActivate={() => {
              dismissSpeech();
              pullOut('chat');
            }}
            onPointerEnter={hover.onEnter}
            onPointerLeave={hover.onLeave}
          />
        </>
      ) : (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2"
          style={sitSlotStyle}
        >
          <span className={cn('block size-full', faceLeft && '-scale-x-100')}>
            {children}
          </span>
        </span>
      )}
    </div>
  );
}

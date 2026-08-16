import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  CircleHelp,
  GripHorizontal,
  Headphones,
  LayoutGrid,
  MessageCircle,
  X,
} from 'lucide-react';
import { useUnreadCount } from '@/shared/api/notifications';
import { cn } from '@/shared/lib/utils';
import { useAuthStatus } from '@/stores/auth.store';
import { RhinoFeedbackBody } from './RhinoFeedbackBody';
import { RhinoHoverMenu, RhinoUnreadBadge } from './RhinoHoverMenu';
import { RhinoNotificationsBody } from './RhinoNotificationsBody';
import {
  isIdleOnceClip,
  locoClip,
  locoFps,
  pickRandomIdle,
  pickRandomIdleLoop,
  runClip,
} from '@/shared/mascot/rhino-clips';
import type { RhinoClipId } from '@/shared/mascot/rhino-clips';
import {
  isRhinoDir,
  resolveFacingDir,
  resolveGait,
  velocityFromSamples,
  type RhinoDir,
  type RhinoGait,
} from '@/shared/mascot/rhino-direction';
import {
  pickPoseClickAction,
  pickStandEmote,
  type RhinoPose,
} from '@/shared/mascot/rhino-pose';
import {
  RHINO_DISPLAY_PX,
  RHINO_PANEL_SPRITE_PX,
} from '@/shared/mascot/rhino-display-size';
import {
  DOCK_RUN_PX_S,
  NAV_HIDE_PX_S,
  RHINO_POS_KEY,
  edgeTopFromFloatingY,
  isAgainstLeftEdge,
  isAgainstRightEdge,
  loadEdgeSide,
  persistEdgeSide,
  persistEdgeTop,
  persistFloatingPos,
  type RhinoEdgeSide,
} from '@/shared/mascot/rhino-edge-dock';
import {
  PERCH_DIVE_PX_S,
  PERCH_RUN_PX_S,
  getLiveRhinoPerchRect,
  getRhinoPerchRect,
  isNearRhinoPerch,
  perchApproachPos,
  perchDivePos,
  perchDockPos,
  perchEmergeRest,
} from '@/shared/mascot/rhino-perch';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useMascotSprite } from '@/shared/mascot/useMascotSprite';
import {
  RHINO_PANEL_SIZE,
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import { RhinoChatBody } from './RhinoChatBody';
import { RhinoEdgePeek } from './RhinoEdgePeek';
import { RhinoHelpBody } from './RhinoHelpBody';
import { RhinoPanelStage } from './RhinoPanelStage';
import { RhinoSplitPane } from './RhinoSplitPane';

const POS_KEY = RHINO_POS_KEY;
const DIR_KEY = 'scholay.rhino-assistant.dir';
/** Hitbox matches fixed sprite display (assets pre-normalized to 256²). */
const SIZE = RHINO_DISPLAY_PX;
const MARGIN = 12;
const IDLE_ROTATE_MS = 30_000;
/**
 * 移动跟随:指令位(指针)即时更新,视觉位指数追赶 → 稍迟滞。
 * FOLLOW_RATE≈7 → 约 100–140ms 追上观感。单击不走这套。
 */
const FOLLOW_RATE = 7.2;
/** 追上判定(px);松手后小于此值才进待机 */
const CATCH_EPS = 2.5;

type Pos = { x: number; y: number };

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  return {
    x: MARGIN + 8,
    y: Math.max(MARGIN, window.innerHeight - SIZE - 96),
  };
}

function clampPos(p: Pos, w = SIZE, h = SIZE): Pos {
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, p.x)),
    y: Math.min(maxY, Math.max(MARGIN, p.y)),
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return defaultPos();
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return defaultPos();
    }
    return clampPos(parsed);
  } catch {
    return defaultPos();
  }
}

function emergeStartPos(rest: Pos, side: RhinoEdgeSide): Pos {
  if (typeof window === 'undefined') return rest;
  // Start on-screen at the docked edge's visible side, then jump inward.
  if (side === 'left') {
    return { x: MARGIN, y: rest.y };
  }
  return {
    x: Math.max(MARGIN, window.innerWidth - SIZE - MARGIN),
    y: rest.y,
  };
}

function perchEmergeStart(rect: DOMRect): Pos {
  return perchDockPos(rect, SIZE);
}

function initialFloatPos(): Pos {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const rest = loadPos();
  const st = useRhinoAssistant.getState();
  if (st.emergeFromEdge) {
    return emergeStartPos(rest, loadEdgeSide());
  }
  if (st.emergeFromPerch) {
    const rect = getRhinoPerchRect();
    if (rect) return perchEmergeStart(rect);
  }
  return rest;
}

function loadDir(): RhinoDir {
  try {
    const v = localStorage.getItem(DIR_KEY) ?? '';
    if (isRhinoDir(v)) return v;
  } catch {
    /* ignore */
  }
  return 'south';
}

/**
 * 悬浮小犀牛 —— 收起时独立拖拽互动;展开对话/功能/帮助时框进可拖动面板。
 * 隐藏后本体卸下：屏幕边缘 {@link RhinoEdgePeek}，或页面里的 {@link RhinoPeek} 巢。
 */
export function FloatingRhinoAssistant({
  featuresSlot,
}: {
  /** 功能面板内容(FeatureRailPanel),由 App 层注入以免 shared→features */
  featuresSlot?: ReactNode;
}) {
  const hidden = useRhinoAssistant((s) => s.hidden);
  const hideKind = useRhinoAssistant((s) => s.hideKind);
  const perchPresent = useRhinoAssistant((s) => s.perchPresent);
  const perchDismissed = useRhinoAssistant((s) => s.perchDismissed);
  const perchEnterConsumed = useRhinoAssistant((s) => s.perchEnterConsumed);
  const show = useRhinoAssistant((s) => s.show);
  const consumePerchEnter = useRhinoAssistant((s) => s.consumePerchEnter);
  const resetPerchDismissed = useRhinoAssistant((s) => s.resetPerchDismissed);

  // 归位的第二个触发点:加载新页面。换路由即重开本页的巢吸引
  // (被拉出过的犀牛在新页面再次自动归巢;同页内不反复吸回)。
  const { pathname } = useLocation();
  useEffect(() => {
    resetPerchDismissed();
  }, [pathname, resetPerchDismissed]);

  const prevPerchPresent = useRef(perchPresent);
  useEffect(() => {
    const justArrived = perchPresent && !prevPerchPresent.current;
    prevPerchPresent.current = perchPresent;
    // Only leave the edge when a nest appears — do not undo an explicit hide.
    if (
      justArrived &&
      !perchDismissed &&
      !perchEnterConsumed &&
      hidden &&
      hideKind === 'edge'
    ) {
      show();
    }
  }, [
    perchPresent,
    perchDismissed,
    perchEnterConsumed,
    hidden,
    hideKind,
    show,
  ]);

  useEffect(() => {
    if (!hidden || hideKind !== 'perch' || perchPresent) return;
    const id = window.setTimeout(() => {
      const st = useRhinoAssistant.getState();
      if (st.hidden && st.hideKind === 'perch' && !st.perchPresent) {
        st.hide('edge');
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [hidden, hideKind, perchPresent]);

  useEffect(() => {
    if (hidden && hideKind === 'perch' && perchPresent) {
      consumePerchEnter();
    }
  }, [hidden, hideKind, perchPresent, consumePerchEnter]);

  if (hidden) {
    // 真隐藏:收进右上角导航条 chip(UserSection 里的 RhinoNavChip 负责渲染)。
    if (hideKind === 'nav') return null;
    if (hideKind === 'perch' && perchPresent) return null;
    return <RhinoEdgePeek />;
  }
  return <FloatingRhinoLive featuresSlot={featuresSlot} />;
}

function FloatingRhinoLive({ featuresSlot }: { featuresSlot?: ReactNode }) {
  const reduce = useReducedMotion();
  const { authenticated } = useAuthStatus();
  const unreadQ = useUnreadCount();
  const unread = authenticated ? (unreadQ.data ?? 0) : 0;
  const { frameSrc, play } = useMascotSprite('pet-idle');
  const setAnchor = useRhinoAssistant((s) => s.setAnchor);
  const panel = useRhinoAssistant((s) => s.panel);
  const openPanel = useRhinoAssistant((s) => s.openPanel);
  const closePanel = useRhinoAssistant((s) => s.closePanel);
  const hide = useRhinoAssistant((s) => s.hide);
  const clearEmerge = useRhinoAssistant((s) => s.clearEmerge);
  const perchPresent = useRhinoAssistant((s) => s.perchPresent);
  const perchDismissed = useRhinoAssistant((s) => s.perchDismissed);
  const collapseNonce = useRhinoAssistant((s) => s.collapseNonce);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const collapseNonceSeen = useRef(collapseNonce);

  const [pos, setPos] = useState<Pos>(initialFloatPos);
  const emergingRef = useRef(
    typeof window !== 'undefined' &&
      (useRhinoAssistant.getState().emergeFromEdge ||
        useRhinoAssistant.getState().emergeFromPerch),
  );
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  /** Slip behind the in-page nest on the last dock beat. */
  const [diveBehindNest, setDiveBehindNest] = useState(false);
  /** 触控设备无 hover：常驻显示头顶菜单 */
  const [coarsePointer, setCoarsePointer] = useState(false);

  const dirRef = useRef<RhinoDir>(
    typeof window === 'undefined' ? 'south' : loadDir(),
  );
  const poseRef = useRef<RhinoPose>('stand');
  const gaitRef = useRef<RhinoGait>('idle');
  const speedEmaRef = useRef(0);
  const faceVelRef = useRef({ vx: 0, vy: 0 });
  /** 视觉位样本 → 朝向/走跑(比指针更准、天然带迟滞) */
  const visualSamplesRef = useRef<Array<{ t: number; x: number; y: number }>>(
    [],
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const busyRef = useRef(false);
  const draggingRef = useRef(false);
  /** 松手后仍在追指令位 */
  const coastingRef = useRef(false);
  const ambientIdleRef = useRef<RhinoClipId>('pet-idle');
  const idleTimerRef = useRef(0);
  const targetRef = useRef<Pos>(initialFloatPos());
  const visualRef = useRef<Pos>(initialFloatPos());
  const emergeRafRef = useRef(0);
  const emergeStartedRef = useRef(false);
  const dockArmedAtRef = useRef(0);
  const chaseRafRef = useRef(0);
  const chaseLastTRef = useRef(0);
  const dockingRef = useRef(false);
  const dockRafRef = useRef(0);
  const lastAnimKeyRef = useRef('');
  const playRef = useRef(play);
  playRef.current = play;
  const hoverLeaveTimerRef = useRef(0);
  /** 收起态：延迟单击姿势，以便识别双击进对话 */
  const pendingPoseTimerRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const expandToRef = useRef<(mode: RhinoPanelMode) => void>(() => {});

  const holdPoseIdle = useCallback(async () => {
    if (poseRef.current === 'sit') {
      ambientIdleRef.current = 'sit-hold';
      await play('sit-hold');
      return;
    }
    const next = pickRandomIdle(ambientIdleRef.current);
    ambientIdleRef.current = next;
    await play(next);
    if (isIdleOnceClip(next) && !draggingRef.current && !busyRef.current) {
      const loop = pickRandomIdleLoop(next);
      ambientIdleRef.current = loop;
      await play(loop);
    }
  }, [play]);

  const playAmbientIdle = useCallback(
    async (opts?: { force?: boolean }) => {
      if (
        !opts?.force &&
        (draggingRef.current || coastingRef.current || busyRef.current)
      ) {
        return;
      }
      // 坐姿不轮换站立表情池
      if (poseRef.current !== 'stand') {
        await holdPoseIdle();
        return;
      }
      try {
        await holdPoseIdle();
      } catch {
        /* interrupted */
      }
    },
    [holdPoseIdle],
  );

  const resetIdleRotateTimer = useCallback(() => {
    window.clearInterval(idleTimerRef.current);
    idleTimerRef.current = window.setInterval(() => {
      if (draggingRef.current || coastingRef.current || busyRef.current) return;
      if (poseRef.current !== 'stand') return;
      void playAmbientIdle();
    }, IDLE_ROTATE_MS);
  }, [playAmbientIdle]);

  /** 从右缘 / 页面巢内部跳出（站姿稿原地消失后再接精灵） */
  useEffect(() => {
    const st = useRhinoAssistant.getState();
    const fromPerch = st.emergeFromPerch;
    if (!emergingRef.current && !fromPerch) return;
    if (emergeStartedRef.current) return;
    emergeStartedRef.current = true;
    emergingRef.current = false;
    clearEmerge();
    busyRef.current = true;
    dockArmedAtRef.current = performance.now() + 1200;
    window.clearInterval(idleTimerRef.current);

    const perchRect = fromPerch ? getRhinoPerchRect() : null;
    const rest = perchRect
      ? clampPos(perchEmergeRest(perchRect, SIZE, MARGIN))
      : clampPos(loadPos());
    const start = perchRect
      ? perchEmergeStart(perchRect)
      : emergeStartPos(rest, loadEdgeSide());
    visualRef.current = start;
    targetRef.current = rest;
    setPos(start);

    void (async () => {
      try {
        await playRef.current('pet-jump');
      } catch {
        /* interrupted */
      }
      if (draggingRef.current || dockingRef.current) {
        busyRef.current = false;
        return;
      }
      busyRef.current = false;
      await playAmbientIdle({ force: true });
      resetIdleRotateTimer();
    })();

    const finishEmerge = (settled: Pos) => {
      visualRef.current = settled;
      targetRef.current = settled;
      persistFloatingPos(settled);
      const pending = useRhinoAssistant.getState().pendingPanel;
      if (!pending) return;
      useRhinoAssistant.setState({ pendingPanel: null });
      expandToRef.current(pending);
    };

    if (reduce) {
      setPos(rest);
      finishEmerge(rest);
      return;
    }

    const durationMs = fromPerch ? 380 : 420;
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - u) ** 3;
      const next = {
        x: start.x + (rest.x - start.x) * eased,
        y: start.y + (rest.y - start.y) * eased,
      };
      visualRef.current = next;
      setPos(next);
      if (u < 1) {
        emergeRafRef.current = requestAnimationFrame(tick);
        return;
      }
      emergeRafRef.current = 0;
      finishEmerge(rest);
    };
    emergeRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(emergeRafRef.current);
    // Mount-only: deps would retrigger, cancel the raf, and leave the sprite off-screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 保证站立(拖走前调用) */
  const ensureStanding = useCallback(async () => {
    if (poseRef.current === 'stand') return;
    busyRef.current = true;
    try {
      if (poseRef.current === 'sit') {
        await play('sit-to-stand-s'); // 坐→站
        poseRef.current = 'stand';
      }
    } finally {
      busyRef.current = false;
    }
  }, [play]);

  const runPoseClick = useCallback(async () => {
    if (busyRef.current || draggingRef.current) return;
    busyRef.current = true;
    window.clearInterval(idleTimerRef.current);
    const action = pickPoseClickAction(poseRef.current);
    try {
      if (action === 'jump') {
        await play('pet-jump');
        await playAmbientIdle({ force: true });
      } else if (action === 'sit') {
        // 站→坐:倒放 sit-to-stand
        await play('sit-to-stand-s', { reverse: true, loop: false });
        poseRef.current = 'sit';
        await play('sit-hold');
        ambientIdleRef.current = 'sit-hold';
      } else if (action === 'stand') {
        await play('sit-to-stand-s');
        poseRef.current = 'stand';
        await playAmbientIdle({ force: true });
      } else {
        // stand emote
        const emote = pickStandEmote(ambientIdleRef.current);
        await play(emote);
        if (poseRef.current === 'stand') {
          await playAmbientIdle({ force: true });
        }
      }
      resetIdleRotateTimer();
    } finally {
      busyRef.current = false;
      gaitRef.current = 'idle';
    }
  }, [play, playAmbientIdle, resetIdleRotateTimer]);

  const stopChase = useCallback(() => {
    cancelAnimationFrame(chaseRafRef.current);
    chaseRafRef.current = 0;
    chaseLastTRef.current = 0;
  }, []);

  const boxSize = useCallback(() => {
    const mode = panelRef.current;
    if (!mode) return { w: SIZE, h: SIZE };
    const s = RHINO_PANEL_SIZE[mode];
    return { w: s.w, h: s.h };
  }, []);

  const finishMoveSettle = useCallback(async () => {
    if (dockingRef.current) return;
    coastingRef.current = false;
    draggingRef.current = false;
    setDragging(false);
    visualSamplesRef.current = [];
    speedEmaRef.current = 0;
    faceVelRef.current = { vx: 0, vy: 0 };
    lastAnimKeyRef.current = '';
    const { w, h } = boxSize();
    const settled = clampPos(visualRef.current, w, h);
    visualRef.current = settled;
    targetRef.current = settled;
    setPos(settled);
    setAnchor(settled);
    localStorage.setItem(POS_KEY, JSON.stringify(settled));
    localStorage.setItem(DIR_KEY, dirRef.current);
    gaitRef.current = 'idle';
    poseRef.current = 'stand';
    await playAmbientIdle({ force: true });
    resetIdleRotateTimer();
  }, [boxSize, playAmbientIdle, resetIdleRotateTimer, setAnchor]);

  /** 视觉追指令;朝向/步态用视觉速度 */
  const startChase = useCallback(() => {
    if (chaseRafRef.current) return;
    chaseLastTRef.current = performance.now();
    const tick = (now: number) => {
      const prevT = chaseLastTRef.current || now;
      const dt = Math.min(0.05, Math.max(0.001, (now - prevT) / 1000));
      chaseLastTRef.current = now;

      const target = targetRef.current;
      const visual = visualRef.current;
      const k = 1 - Math.exp(-FOLLOW_RATE * dt);
      const { w, h } = (() => {
        const mode = panelRef.current;
        if (!mode) return { w: SIZE, h: SIZE };
        const s = RHINO_PANEL_SIZE[mode];
        return { w: s.w, h: s.h };
      })();
      const next = clampPos(
        {
          x: visual.x + (target.x - visual.x) * k,
          y: visual.y + (target.y - visual.y) * k,
        },
        w,
        h,
      );
      visualRef.current = next;
      setPos(next);

      visualSamplesRef.current.push({ t: now, x: next.x, y: next.y });
      const cut = now - 140;
      while (
        visualSamplesRef.current.length > 2 &&
        visualSamplesRef.current[0].t < cut
      ) {
        visualSamplesRef.current.shift();
      }

      const { vx, vy, speed, peak } = velocityFromSamples(
        visualSamplesRef.current,
        100,
      );
      speedEmaRef.current = speedEmaRef.current * 0.62 + speed * 0.38;
      const gaitSpeed = Math.max(speedEmaRef.current, peak * 0.85);
      faceVelRef.current = {
        vx: faceVelRef.current.vx * 0.65 + vx * 0.35,
        vy: faceVelRef.current.vy * 0.65 + vy * 0.35,
      };

      const canLoco =
        poseRef.current === 'stand' &&
        !busyRef.current &&
        (draggingRef.current || coastingRef.current);

      if (canLoco) {
        const nextDir = resolveFacingDir(
          dirRef.current,
          faceVelRef.current.vx,
          faceVelRef.current.vy,
          { minSpeed: 28, hysteresisDeg: 3 },
        );
        dirRef.current = nextDir;
        const nextGait = resolveGait(gaitRef.current, gaitSpeed);
        gaitRef.current = nextGait;

        if (nextGait === 'run' || nextGait === 'walk') {
          const key = `${nextGait}:${nextDir}`;
          if (key !== lastAnimKeyRef.current || nextGait === 'run') {
            lastAnimKeyRef.current = key;
            if (nextGait === 'run') {
              void playRef.current(
                runClip(nextDir, faceVelRef.current.vx, faceVelRef.current.vy),
                { fps: locoFps('run', gaitSpeed) },
              );
            } else {
              void playRef.current(locoClip(nextDir), {
                fps: locoFps('walk', gaitSpeed),
              });
            }
          }
        }
      }

      const dist = Math.hypot(target.x - next.x, target.y - next.y);
      const stillMoving = draggingRef.current || coastingRef.current;
      if (stillMoving && (draggingRef.current || dist > CATCH_EPS)) {
        chaseRafRef.current = requestAnimationFrame(tick);
        return;
      }

      // 松手且追上
      chaseRafRef.current = 0;
      if (coastingRef.current) {
        void finishMoveSettle();
      }
    };
    chaseRafRef.current = requestAnimationFrame(tick);
  }, [finishMoveSettle]);

  useEffect(() => {
    setAnchor(pos);
  }, [pos, setAnchor]);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        const mode = panelRef.current;
        const dim = mode ? RHINO_PANEL_SIZE[mode] : { w: SIZE, h: SIZE };
        const next = clampPos(p, dim.w, dim.h);
        visualRef.current = next;
        targetRef.current = next;
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stopChase();
      cancelAnimationFrame(dockRafRef.current);
      cancelAnimationFrame(emergeRafRef.current);
      window.clearTimeout(hoverLeaveTimerRef.current);
      window.clearTimeout(pendingPoseTimerRef.current);
    };
  }, [stopChase]);

  useEffect(() => {
    resetIdleRotateTimer();
    const onBlur = () => {
      if (draggingRef.current || busyRef.current) return;
      void playAmbientIdle({ force: true });
      resetIdleRotateTimer();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onBlur();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(idleTimerRef.current);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playAmbientIdle, resetIdleRotateTimer]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // 指令/视觉都以当前视觉位为原点,避免迟滞残留造成跳变
    const origin = visualRef.current;
    targetRef.current = origin;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    // 展开态:犀牛只可点互动,整窗拖动走标题栏
    if (panelRef.current) return;
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < 36) return;

    if (!d.moved) {
      d.moved = true;
      if (dockingRef.current) {
        cancelAnimationFrame(dockRafRef.current);
        dockRafRef.current = 0;
        dockingRef.current = false;
        busyRef.current = false;
        setDiveBehindNest(false);
      }
      draggingRef.current = true;
      coastingRef.current = false;
      setDragging(true);
      window.clearInterval(idleTimerRef.current);
      visualSamplesRef.current = [];
      speedEmaRef.current = 0;
      faceVelRef.current = { vx: 0, vy: 0 };
      lastAnimKeyRef.current = '';
      gaitRef.current = 'idle';
      if (poseRef.current !== 'stand') {
        void ensureStanding();
      }
      startChase();
    }

    // 只更新指令位;视觉位由 chase 迟滞追赶(单击不进这里)
    targetRef.current = clampPos({
      x: d.originX + dx,
      y: d.originY + dy,
    });
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (d.moved) {
      if (panelRef.current) return;
      const dockReady = performance.now() >= dockArmedAtRef.current;
      // 归位·靠近吸附:松手时挨着页面巢 → 跑进巢里坐下(与左右贴边同级)。
      if (dockReady) {
        const nestRect = getLiveRhinoPerchRect();
        if (
          nestRect &&
          (isNearRhinoPerch(visualRef.current, SIZE, nestRect) ||
            isNearRhinoPerch(targetRef.current, SIZE, nestRect)) &&
          runDockToPerch()
        ) {
          return;
        }
      }
      const tx = targetRef.current.x;
      const vx = visualRef.current.x;
      if (
        dockReady &&
        (isAgainstLeftEdge(tx, MARGIN) || isAgainstLeftEdge(vx, MARGIN))
      ) {
        runDockToEdge('left');
        return;
      }
      if (
        dockReady &&
        (isAgainstRightEdge(tx, SIZE, MARGIN) ||
          isAgainstRightEdge(vx, SIZE, MARGIN))
      ) {
        runDockToEdge('right');
        return;
      }
      // 松手:指令位停住,视觉继续追上后再待机 —— 单击不受影响
      draggingRef.current = false;
      coastingRef.current = true;
      startChase();
      return;
    }
    // 展开态：单击仍互动姿势
    if (panelRef.current) {
      await runPoseClick();
      return;
    }
    // 收起态：双击直接进对话；单击延迟姿势以免抢双击
    const now = performance.now();
    const DBLCLICK_MS = 280;
    if (now - lastTapAtRef.current < DBLCLICK_MS) {
      window.clearTimeout(pendingPoseTimerRef.current);
      pendingPoseTimerRef.current = 0;
      lastTapAtRef.current = 0;
      expandTo('chat');
      return;
    }
    lastTapAtRef.current = now;
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = window.setTimeout(() => {
      pendingPoseTimerRef.current = 0;
      void runPoseClick();
    }, DBLCLICK_MS);
  };

  /** 展开面板:整窗可拖(标题栏),位置贴当前犀牛 */
  const expandTo = (mode: RhinoPanelMode) => {
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = 0;
    lastTapAtRef.current = 0;
    setHovered(false);
    window.clearInterval(idleTimerRef.current);
    stopChase();
    draggingRef.current = false;
    coastingRef.current = false;
    setDragging(false);

    // 已展开：只换模式，不重算位置、不重挂外壳
    if (panelRef.current) {
      openPanel(mode);
      return;
    }

    const { w, h } = RHINO_PANEL_SIZE[mode];
    const origin = visualRef.current;
    const next = clampPos(
      {
        x: origin.x - (w - SIZE) / 2,
        y: origin.y - (h - SIZE) + 16,
      },
      w,
      h,
    );
    visualRef.current = next;
    targetRef.current = next;
    setPos(next);
    setAnchor(next);
    openPanel(mode);
    void playAmbientIdle({ force: true });
  };
  expandToRef.current = expandTo;

  const collapsePanel = () => {
    const mode = panelRef.current;
    if (!mode) return;
    const { w, h } = RHINO_PANEL_SIZE[mode];
    const rhino = clampPos({
      x: pos.x + (w - SIZE) / 2,
      y: pos.y + h - SIZE - 8,
    });
    visualRef.current = rhino;
    targetRef.current = rhino;
    setPos(rhino);
    setAnchor(rhino);
    localStorage.setItem(POS_KEY, JSON.stringify(rhino));
    closePanel();
    resetIdleRotateTimer();
  };

  /** 靠近左/右缘松手：跑步冲进边缘再收纳 */
  const runDockToEdge = useCallback(
    (side: RhinoEdgeSide) => {
      if (dockingRef.current) return;
      dockingRef.current = true;
      window.clearTimeout(pendingPoseTimerRef.current);
      pendingPoseTimerRef.current = 0;
      lastTapAtRef.current = 0;
      stopChase();
      draggingRef.current = false;
      coastingRef.current = false;
      setDragging(false);

      const start = visualRef.current;
      persistEdgeSide(side);
      persistEdgeTop(edgeTopFromFloatingY(start.y, SIZE));
      persistFloatingPos(start);

      if (reduce) {
        hide();
        return;
      }

      const towardLeft = side === 'left';
      dirRef.current = towardLeft ? 'west' : 'east';
      gaitRef.current = 'run';
      void playRef.current(
        runClip(dirRef.current, towardLeft ? -220 : 220, 8),
        { loop: true, fps: locoFps('run', DOCK_RUN_PX_S) },
      );

      const destX = towardLeft
        ? -SIZE * 0.2
        : window.innerWidth - SIZE * 0.18;
      const dist = Math.max(36, Math.abs(destX - start.x));
      const durationMs = Math.max(320, (dist / DOCK_RUN_PX_S) * 1000);
      const t0 = performance.now();

      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / durationMs);
        const eased = u * u;
        const next = {
          x: start.x + (destX - start.x) * eased,
          y: start.y,
        };
        visualRef.current = next;
        targetRef.current = next;
        setPos(next);
        if (u < 1) {
          dockRafRef.current = requestAnimationFrame(tick);
          return;
        }
        dockRafRef.current = 0;
        hide();
      };
      dockRafRef.current = requestAnimationFrame(tick);
    },
    [hide, reduce, stopChase],
  );

  /** 归位入巢:页面加载自动触发,或拖近巢松手吸附。跑到巢下、钻进巢后坐下。 */
  const runDockToPerch = useCallback((): boolean => {
    const rect = getLiveRhinoPerchRect();
    if (!rect) return false;
    if (dockingRef.current) return false;
    dockingRef.current = true;
    busyRef.current = true;
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = 0;
    lastTapAtRef.current = 0;
    stopChase();
    draggingRef.current = false;
    coastingRef.current = false;
    setDragging(false);
    setDiveBehindNest(false);

    const start = visualRef.current;
    persistFloatingPos(start);

    if (reduce) {
      hide('perch');
      return true;
    }

    const approach = perchApproachPos(rect, SIZE);
    const dive = perchDivePos(rect, SIZE);

    const runSegment = (
      from: Pos,
      to: Pos,
      speed: number,
      onDone: () => void,
    ) => {
      const vx = to.x - from.x;
      const vy = to.y - from.y;
      const dist = Math.hypot(vx, vy);
      if (dist < 12) {
        visualRef.current = to;
        targetRef.current = to;
        setPos(to);
        onDone();
        return;
      }
      dirRef.current = resolveFacingDir(dirRef.current, vx, vy, {
        minSpeed: 1,
        hysteresisDeg: 0,
      });
      gaitRef.current = 'run';
      void playRef.current(runClip(dirRef.current, vx, vy), {
        loop: true,
        fps: locoFps('run', speed),
      });
      const durationMs = Math.max(80, (dist / speed) * 1000);
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!dockingRef.current) return;
        const u = Math.min(1, (now - t0) / durationMs);
        const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        const next = {
          x: from.x + vx * eased,
          y: from.y + vy * eased,
        };
        visualRef.current = next;
        targetRef.current = next;
        setPos(next);
        if (u < 1) {
          dockRafRef.current = requestAnimationFrame(tick);
          return;
        }
        dockRafRef.current = 0;
        onDone();
      };
      dockRafRef.current = requestAnimationFrame(tick);
    };

    runSegment(start, approach, PERCH_RUN_PX_S, () => {
      if (!dockingRef.current) return;
      setDiveBehindNest(true);
      runSegment(approach, dive, PERCH_DIVE_PX_S, () => {
        if (!dockingRef.current) return;
        hide('perch');
      });
    });
    return true;
  }, [hide, reduce, stopChase]);

  /** 隐藏(非归位):跑向右上角,收进导航条 chip(hover 出菜单,点击释放)。 */
  const runDockToNav = useCallback(() => {
    if (dockingRef.current) return;
    dockingRef.current = true;
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = 0;
    lastTapAtRef.current = 0;
    stopChase();
    draggingRef.current = false;
    coastingRef.current = false;
    setDragging(false);

    const start = visualRef.current;
    persistFloatingPos(start);

    if (reduce) {
      hide('nav');
      return;
    }

    // Run toward the top-right corner, then slip off-screen into the nav.
    const dest = {
      x: window.innerWidth - SIZE * 0.55,
      y: -SIZE * 0.55,
    };
    const vx = dest.x - start.x;
    const vy = dest.y - start.y;
    dirRef.current = resolveFacingDir(dirRef.current, vx, vy, {
      minSpeed: 1,
      hysteresisDeg: 0,
    });
    gaitRef.current = 'run';
    void playRef.current(runClip(dirRef.current, vx, vy), {
      loop: true,
      fps: locoFps('run', NAV_HIDE_PX_S),
    });

    const dist = Math.max(36, Math.hypot(vx, vy));
    const durationMs = Math.max(160, (dist / NAV_HIDE_PX_S) * 1000);
    const t0 = performance.now();
    const tick = (now: number) => {
      if (!dockingRef.current) return;
      const u = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - u) * (1 - u);
      const next = {
        x: start.x + vx * eased,
        y: start.y + vy * eased,
      };
      visualRef.current = next;
      targetRef.current = next;
      setPos(next);
      if (u < 1) {
        dockRafRef.current = requestAnimationFrame(tick);
        return;
      }
      dockRafRef.current = 0;
      hide('nav');
    };
    dockRafRef.current = requestAnimationFrame(tick);
  }, [hide, reduce, stopChase]);

  /** Menu hide tucks the mascot into the top-right nav — edges/nest stay 归位. */
  const hideRhino = () => {
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = 0;
    lastTapAtRef.current = 0;
    if (panelRef.current) collapsePanel();
    runDockToNav();
  };

  useEffect(() => {
    if (!perchPresent || perchDismissed || panel) return;
    let cancelled = false;
    let retryId = 0;
    const tryEnter = () => {
      if (cancelled) return;
      const st = useRhinoAssistant.getState();
      if (st.perchDismissed || st.panel || st.hidden) return;
      if (emergingRef.current || draggingRef.current || dockingRef.current) {
        retryId = window.setTimeout(tryEnter, 240);
        return;
      }
      if (!runDockToPerch()) {
        retryId = window.setTimeout(tryEnter, 240);
      }
    };
    const id = window.setTimeout(tryEnter, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      window.clearTimeout(retryId);
    };
  }, [perchPresent, perchDismissed, panel, runDockToPerch]);

  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      collapsePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // collapsePanel closes over latest pos/panel; rebind when panel opens/changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [panel]);

  useEffect(() => {
    if (collapseNonce === collapseNonceSeen.current) return;
    collapseNonceSeen.current = collapseNonce;
    if (panelRef.current) collapsePanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [collapseNonce]);

  const onPanelPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const origin = visualRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
  };

  const onPanelPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const mode = panelRef.current;
    if (!mode) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < 16) return;
    d.moved = true;
    setDragging(true);
    const { w, h } = RHINO_PANEL_SIZE[mode];
    const next = clampPos({ x: d.originX + dx, y: d.originY + dy }, w, h);
    visualRef.current = next;
    targetRef.current = next;
    setPos(next);
    setAnchor(next);
  };

  const onPanelPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d.moved) {
      setDragging(false);
      localStorage.setItem(POS_KEY, JSON.stringify(visualRef.current));
    }
  };

  const showHeadChrome =
    !panel && (hovered || coarsePointer) && !dragging;

  const onHeadEnter = () => {
    if (panelRef.current) return;
    window.clearTimeout(hoverLeaveTimerRef.current);
    setHovered(true);
  };

  const onHeadLeave = () => {
    window.clearTimeout(hoverLeaveTimerRef.current);
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 220);
  };

  const panelMeta = panel ? RHINO_PANEL_SIZE[panel] : null;

  const rhinoInStage =
    panel === 'chat' ||
    panel === 'features' ||
    panel === 'help' ||
    panel === 'feedback' ||
    panel === 'notifications';
  const spritePx = rhinoInStage ? RHINO_PANEL_SPRITE_PX : RHINO_DISPLAY_PX;

  const panelTabs: Array<{
    id: RhinoPanelMode;
    label: string;
    icon: typeof MessageCircle;
  }> = [
    { id: 'chat', label: '闲聊', icon: MessageCircle },
    { id: 'features', label: '功能', icon: LayoutGrid },
    { id: 'help', label: '帮助', icon: CircleHelp },
    { id: 'feedback', label: '反馈', icon: Headphones },
  ];
  if (authenticated) {
    panelTabs.push({ id: 'notifications', label: '通知', icon: Bell });
  }

  const rhinoSprite = (
    <button
      type="button"
      aria-label={
        unread > 0
          ? `${RHINO_NAME}，${unread} 条未读通知，单击互动，双击打开对话`
          : `${RHINO_NAME}，单击互动，双击打开对话`
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'relative flex items-center justify-center overflow-visible touch-none select-none',
        'rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        rhinoInStage ? 'cursor-pointer' : 'size-full cursor-grab active:cursor-grabbing',
        !panel && dragging && 'scale-105',
      )}
      style={
        rhinoInStage
          ? { width: RHINO_PANEL_SPRITE_PX, height: RHINO_PANEL_SPRITE_PX }
          : undefined
      }
    >
      <img
        src={frameSrc}
        alt=""
        draggable={false}
        width={spritePx}
        height={spritePx}
        className="pointer-events-none size-full object-contain drop-shadow-md"
      />
      <RhinoUnreadBadge count={showHeadChrome ? 0 : unread} compact={rhinoInStage} />
    </button>
  );

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0',
        diveBehindNest ? 'z-[50]' : 'z-[60]',
      )}
    >
      <AnimatePresence>
        {panel ? (
          <motion.button
            key="rhino-scrim"
            type="button"
            aria-label={`关闭${RHINO_NAME}面板`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.2 }}
            className={cn(
              'pointer-events-auto absolute inset-0 z-0',
              'bg-foreground/40 backdrop-blur-[2px]',
            )}
            onClick={collapsePanel}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {panel && panelMeta ? (
          <motion.div
            key="rhino-panel"
            className="pointer-events-none absolute inset-0 z-10"
            initial={reduce ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.18 }}
          >
            <motion.div
              data-tour="rhino-assistant"
              role="dialog"
              aria-modal="true"
              aria-label={panelMeta.title}
              initial={reduce ? false : { opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={cn(
                'pointer-events-auto absolute flex flex-col overflow-hidden',
                'rounded-lg border border-border/80 bg-background/95 shadow-lg backdrop-blur-sm',
              )}
              style={{
                left: pos.x,
                top: pos.y,
                width: panelMeta.w,
                height: panelMeta.h,
              }}
            >
              <header
                onPointerDown={onPanelPointerDown}
                onPointerMove={onPanelPointerMove}
                onPointerUp={onPanelPointerUp}
                onPointerCancel={onPanelPointerUp}
                className={cn(
                  'flex shrink-0 cursor-grab items-center gap-2 border-b border-border/70 px-2.5 py-2',
                  'touch-none select-none active:cursor-grabbing',
                  dragging && 'cursor-grabbing',
                )}
              >
                <GripHorizontal className="size-3.5 shrink-0 text-subtle" strokeWidth={2} />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  {panelMeta.title}
                </p>
                <button
                  type="button"
                  aria-label={`收起为${RHINO_NAME}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    collapsePanel();
                  }}
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md text-subtle',
                    'hover:bg-muted hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                  )}
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </header>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <RhinoSplitPane
                  className="h-full min-h-0"
                  menu={panelTabs.map((tab) => ({
                    id: tab.id,
                    label: tab.label,
                    icon: tab.icon,
                    badge:
                      tab.id === 'notifications' && unread > 0 ? (
                        <span
                          aria-hidden
                          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-pill bg-brand-red px-1 text-2xs font-bold tabular-nums text-background"
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      ) : undefined,
                  }))}
                  activeId={panel}
                  onSelect={(id) => {
                    if (id !== panel) expandTo(id as RhinoPanelMode);
                  }}
                >
                  <div className="relative h-full min-h-0">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={panel}
                        role="tabpanel"
                        aria-label={panelMeta.title}
                        initial={
                          reduce
                            ? { opacity: 0 }
                            : { opacity: 0, y: 8 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          reduce
                            ? { opacity: 0 }
                            : { opacity: 0, y: -6 }
                        }
                        transition={{
                          duration: reduce ? 0.1 : 0.18,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden"
                      >
                        {panel === 'chat' && <RhinoChatBody />}
                        {panel === 'features' && (
                          <RhinoPanelStage className="h-full">
                            {featuresSlot ?? (
                              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                暂无功能入口
                              </p>
                            )}
                          </RhinoPanelStage>
                        )}
                        {panel === 'help' && (
                          <RhinoPanelStage className="h-full">
                            <RhinoHelpBody />
                          </RhinoPanelStage>
                        )}
                        {panel === 'feedback' && (
                          <RhinoPanelStage className="h-full">
                            <RhinoFeedbackBody />
                          </RhinoPanelStage>
                        )}
                        {panel === 'notifications' && (
                          <RhinoPanelStage className="h-full">
                            <RhinoNotificationsBody />
                          </RhinoPanelStage>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </RhinoSplitPane>
              </div>
            </motion.div>

            {/* 小犀牛停在对话框外侧：左下角旁 */}
            <div
              className="pointer-events-auto absolute z-20"
              style={{
                // 贴在对话框左下外侧，略叠进边框一点更近
                left: Math.max(4, pos.x - RHINO_PANEL_SPRITE_PX + 28),
                top: Math.max(
                  4,
                  pos.y + panelMeta.h - RHINO_PANEL_SPRITE_PX + 18,
                ),
                width: RHINO_PANEL_SPRITE_PX,
                height: RHINO_PANEL_SPRITE_PX,
              }}
            >
              {rhinoSprite}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rhino-alone"
            data-tour="rhino-assistant"
            initial={
              reduce || emergingRef.current
                ? false
                : { opacity: 0, scale: 0.96 }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto absolute"
            style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
            onPointerEnter={onHeadEnter}
            onPointerLeave={onHeadLeave}
          >
            <RhinoHoverMenu
              open={showHeadChrome}
              onSelect={expandTo}
              onHide={hideRhino}
            />

            {rhinoSprite}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

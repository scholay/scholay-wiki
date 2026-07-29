import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  CircleHelp,
  EyeOff,
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
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useMascotSprite } from '@/shared/mascot/useMascotSprite';
import {
  RHINO_PANEL_SIZE,
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import { RhinoChatBody } from './RhinoChatBody';
import { RhinoHelpBody } from './RhinoHelpBody';
import { RhinoPanelStage } from './RhinoPanelStage';

const POS_KEY = 'scholay.rhino-assistant.pos';
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
 * 隐藏后卸载本体，入口在顶栏头像旁 {@link RhinoDockChip}。
 */
export function FloatingRhinoAssistant({
  featuresSlot,
}: {
  /** 功能面板内容(FeatureRailPanel),由 App 层注入以免 shared→features */
  featuresSlot?: ReactNode;
}) {
  const hidden = useRhinoAssistant((s) => s.hidden);
  if (hidden) return null;
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
  const collapseNonce = useRhinoAssistant((s) => s.collapseNonce);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const collapseNonceSeen = useRef(collapseNonce);

  const [pos, setPos] = useState<Pos>(() =>
    typeof window === 'undefined' ? { x: 24, y: 24 } : loadPos(),
  );
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
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
  const targetRef = useRef<Pos>(
    typeof window === 'undefined' ? { x: 24, y: 24 } : loadPos(),
  );
  const visualRef = useRef<Pos>(
    typeof window === 'undefined' ? { x: 24, y: 24 } : loadPos(),
  );
  const chaseRafRef = useRef(0);
  const chaseLastTRef = useRef(0);
  const lastAnimKeyRef = useRef('');
  const playRef = useRef(play);
  playRef.current = play;
  const hoverLeaveTimerRef = useRef(0);
  /** 收起态：延迟单击姿势，以便识别双击进对话 */
  const pendingPoseTimerRef = useRef(0);
  const lastTapAtRef = useRef(0);

  const holdPoseIdle = useCallback(async () => {
    if (poseRef.current === 'lie') {
      ambientIdleRef.current = 'sleep-e';
      await play('sleep-e');
      return;
    }
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
      // 坐/躺不轮换站立表情池
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

  /** 保证站立(拖走前调用) */
  const ensureStanding = useCallback(async () => {
    if (poseRef.current === 'stand') return;
    busyRef.current = true;
    try {
      if (poseRef.current === 'lie') {
        await play('lie-to-sit-s'); // 躺→坐
        poseRef.current = 'sit';
      }
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
        if (poseRef.current === 'lie') {
          await play('lie-to-sit-s');
          poseRef.current = 'sit';
        }
        await play('sit-to-stand-s');
        poseRef.current = 'stand';
        await playAmbientIdle({ force: true });
      } else if (action === 'lie') {
        // 坐→躺:倒放 lie-to-sit
        if (poseRef.current === 'stand') {
          await play('sit-to-stand-s', { reverse: true, loop: false });
          poseRef.current = 'sit';
        }
        await play('lie-to-sit-s', { reverse: true, loop: false });
        poseRef.current = 'lie';
        await play('sleep-e');
        ambientIdleRef.current = 'sleep-e';
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

  /** 收纳到顶栏头像旁 */
  const hideRhino = () => {
    window.clearTimeout(pendingPoseTimerRef.current);
    pendingPoseTimerRef.current = 0;
    lastTapAtRef.current = 0;
    if (panelRef.current) collapsePanel();
    stopChase();
    draggingRef.current = false;
    coastingRef.current = false;
    setDragging(false);
    hide();
  };

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
    { id: 'chat', label: '对话', icon: MessageCircle },
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
        'relative flex items-center justify-center touch-none select-none',
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
      {unread > 0 && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-10 inline-flex items-center justify-center',
            'rounded-pill bg-brand-red font-bold tabular-nums text-background shadow-sm',
            rhinoInStage
              ? 'right-0 top-0 h-3.5 min-w-3.5 px-1 text-[9px] leading-none'
              : 'right-1.5 top-1.5 h-5 min-w-5 px-1.5 text-2xs leading-none',
          )}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
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
            </motion.div>

            {/* 模式切换：对话框左侧外侧竖向卡片 */}
            <nav
              aria-label={`${RHINO_NAME}面板切换`}
              className="pointer-events-auto absolute z-20 flex w-[76px] flex-col gap-1"
              style={{
                left: Math.max(4, pos.x - 84),
                top: pos.y,
              }}
            >
              {panelTabs.map((tab) => {
                const Icon = tab.icon;
                const active = panel === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-label={tab.label}
                    aria-pressed={active}
                    onClick={() => {
                      if (tab.id !== panel) expandTo(tab.id);
                    }}
                    className={cn(
                      'relative flex items-center gap-1 rounded-md border px-2 py-1.5',
                      'shadow-sm backdrop-blur-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                      active
                        ? 'border-brand-red/35 bg-background text-brand-red'
                        : 'border-border/80 bg-background/95 text-muted-foreground hover:border-border hover:bg-background hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="truncate text-[10px] font-semibold leading-none">
                      {tab.label}
                    </span>
                    {tab.id === 'notifications' && unread > 0 && (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 size-1.5 rounded-pill bg-brand-red"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

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
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto absolute"
            style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
            onPointerEnter={onHeadEnter}
            onPointerLeave={onHeadLeave}
          >
            {/* Hover 即显：悬在头顶上方，避免挡住角色 */}
            <div className="absolute bottom-full left-1/2 z-10 mb-1 flex -translate-x-1/2 items-center justify-center">
              <AnimatePresence>
                {showHeadChrome && (
                  <motion.div
                    key="rhino-menu-row"
                    role="menu"
                    aria-label={`${RHINO_NAME}菜单`}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className={cn(
                      'flex flex-col gap-0.5 whitespace-nowrap',
                      'rounded-xl border border-border/80 bg-background/95 p-0.5',
                      'shadow-md backdrop-blur-sm',
                    )}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      {(
                        [
                          {
                            id: 'chat',
                            label: '对话',
                            icon: MessageCircle,
                            onClick: () => expandTo('chat'),
                          },
                          {
                            id: 'features',
                            label: '功能',
                            icon: LayoutGrid,
                            onClick: () => expandTo('features'),
                          },
                          {
                            id: 'help',
                            label: '帮助',
                            icon: CircleHelp,
                            onClick: () => expandTo('help'),
                          },
                        ] as const
                      ).map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              item.onClick();
                            }}
                            className={cn(
                              'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2',
                              'text-2xs font-semibold text-foreground transition-colors',
                              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                            )}
                          >
                            <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-0.5 border-t border-border/50 pt-0.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          expandTo('feedback');
                        }}
                        className={cn(
                          'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2',
                          'text-2xs font-semibold text-foreground transition-colors',
                          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                        )}
                      >
                        <Headphones className="size-3.5 shrink-0" strokeWidth={2} />
                        反馈
                      </button>
                      {authenticated && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            expandTo('notifications');
                          }}
                          className={cn(
                            'relative inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2',
                            'text-2xs font-semibold text-foreground transition-colors',
                            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                          )}
                        >
                          <Bell className="size-3.5 shrink-0" strokeWidth={2} />
                          通知
                          {unread > 0 && (
                            <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-pill bg-brand-red px-1 text-[10px] font-bold leading-none text-background tabular-nums">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          hideRhino();
                        }}
                        className={cn(
                          'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2',
                          'text-2xs font-semibold text-foreground transition-colors',
                          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                        )}
                      >
                        <EyeOff className="size-3.5 shrink-0" strokeWidth={2} />
                        隐藏
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {rhinoSprite}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

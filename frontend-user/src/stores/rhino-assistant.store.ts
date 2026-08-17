import { create } from 'zustand';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';

export type RhinoPanelMode =
  | 'chat'
  | 'features'
  | 'help'
  | 'feedback'
  | 'notifications';

export interface RhinoPos {
  x: number;
  y: number;
}

/**
 * perch = 归位(页面标题巢 / 右下角隐形巢);
 * edge = 左右缘 peek,仍是栖息态;
 * nav = 真正的隐藏 —— 收进右上角导航条 chip。
 */
export type RhinoHideKind = 'edge' | 'perch' | 'nav';

const HIDDEN_KEY = 'scholay.rhino-assistant.hidden';
const HIDE_KIND_KEY = 'scholay.rhino-assistant.hide-kind';
const DISMISSED_KEY = 'scholay.rhino-assistant.perch-dismissed';
const HOME_GREET_KEY = 'scholay.rhino-assistant.intro-bubble';

export const RHINO_HOME_GREET = `你好我是${RHINO_NAME}@scholay，有问题，尽管问!`;
export const RHINO_CLAW_GREET = 'hi，需要我帮忙吗?';

export type RhinoSpeech = {
  id: string;
  text: string;
};

let speechTimer = 0;

function loadHomeGreeted(): boolean {
  try {
    return localStorage.getItem(HOME_GREET_KEY) === '1';
  } catch {
    return false;
  }
}

function persistHomeGreeted() {
  try {
    localStorage.setItem(HOME_GREET_KEY, '1');
  } catch {
    /* ignore */
  }
}

function loadHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function persistHidden(hidden: boolean) {
  try {
    localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function loadHideKind(): RhinoHideKind {
  try {
    const v = localStorage.getItem(HIDE_KIND_KEY);
    return v === 'perch' || v === 'nav' ? v : 'edge';
  } catch {
    return 'edge';
  }
}

function persistHideKind(kind: RhinoHideKind | null) {
  try {
    if (!kind) localStorage.removeItem(HIDE_KIND_KEY);
    else localStorage.setItem(HIDE_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
}

function loadPerchDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function persistPerchDismissed(dismissed: boolean) {
  try {
    localStorage.setItem(DISMISSED_KEY, dismissed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

interface RhinoAssistantState {
  /** Hitbox / panel top-left */
  anchor: RhinoPos;
  /** null = collapsed to bare rhino */
  panel: RhinoPanelMode | null;
  /** Docked to a screen edge or in-page perch — floating mascot not shown */
  hidden: boolean;
  hideKind: RhinoHideKind;
  /** In-page peek nest is mounted (smart empty state, etc.) */
  perchPresent: boolean;
  /** 游离: user left 归位 (click / drag). Nests no longer attract. */
  perchDismissed: boolean;
  /** First-load run-into-nest already happened */
  perchEnterConsumed: boolean;
  /** Next floating mount should jump inward from the docked edge */
  emergeFromEdge: boolean;
  /** Next floating mount should step out of the in-page perch */
  emergeFromPerch: boolean;
  /** Increment to start homepage novice tour (from help panel) */
  tourNonce: number;
  /** Increment to start 智能助手 empty-state spotlight tour. */
  clawTourNonce: number;
  /** Nest sprite is inside the spotlight popover; nest looks vacant. */
  tourGuiding: boolean;
  /** Increment to request collapse with position restore (from nested bodies) */
  collapseNonce: number;
  /** Nest menu picked a panel — open it after the emerge animation */
  pendingPanel: RhinoPanelMode | null;
  /** User is dragging the floating mascot (not the open panel). */
  dragActive: boolean;
  /** Home card enter: clip the mascot at the card edge. */
  homeEnterClip: 'none' | 'bottom' | 'right' | 'inside';
  /** Next home visit: spawn above the card and run into the nest. */
  homeEnterPending: boolean;
  /** Rhino is overlapping the home card (drag or enter) — card fill goes translucent. */
  homeUnderCard: boolean;
  /** Proactive speech bubble currently showing. */
  speech: RhinoSpeech | null;
  /** First homepage sit still owes the intro bubble. */
  homeGreetPending: boolean;

  setAnchor: (pos: RhinoPos) => void;
  setDragActive: (active: boolean) => void;
  setHomeUnderCard: (under: boolean) => void;
  setHomeEnterClip: (clip: 'none' | 'bottom' | 'right' | 'inside') => void;
  openPanel: (mode: RhinoPanelMode) => void;
  closePanel: () => void;
  hide: (kind?: RhinoHideKind) => void;
  show: () => void;
  showFromEdge: (panel?: RhinoPanelMode) => void;
  showFromPerch: (dismissNest?: boolean, panel?: RhinoPanelMode) => void;
  consumePerchEnter: () => void;
  /** Title-nest pages may attract again; corner 归位 does not reclaim 游离. */
  resetPerchDismissed: () => void;
  setPerchPresent: (present: boolean) => void;
  clearEmerge: () => void;
  requestTour: () => void;
  requestClawTour: () => void;
  setTourGuiding: (guiding: boolean) => void;
  requestCollapse: () => void;
  /** Arrive on homepage: unhide and play the card-enter from the home spawn. */
  beginHomeEnter: () => void;
  consumeHomeEnter: () => void;
  speak: (text: string, opts?: { id?: string; ttlMs?: number }) => void;
  dismissSpeech: () => void;
  /** First homepage sit: greet once, then persist so it never repeats. */
  maybeHomeGreet: () => void;
}

export const useRhinoAssistant = create<RhinoAssistantState>((set) => ({
  anchor: { x: 24, y: 24 },
  panel: null,
  hidden: typeof window === 'undefined' ? false : loadHidden(),
  hideKind: typeof window === 'undefined' ? 'edge' : loadHideKind(),
  perchPresent: false,
  perchDismissed:
    typeof window === 'undefined'
      ? false
      : loadHidden() && loadHideKind() === 'perch'
        ? false
        : loadPerchDismissed(),
  perchEnterConsumed: false,
  emergeFromEdge: false,
  emergeFromPerch: false,
  tourNonce: 0,
  clawTourNonce: 0,
  tourGuiding: false,
  collapseNonce: 0,
  pendingPanel: null,
  dragActive: false,
  homeEnterClip: 'none',
  homeEnterPending: false,
  homeUnderCard: false,
  speech: null,
  homeGreetPending: typeof window === 'undefined' ? false : !loadHomeGreeted(),

  setAnchor: (pos) => set({ anchor: pos }),
  setDragActive: (active) => set({ dragActive: active }),
  setHomeUnderCard: (under) => set({ homeUnderCard: under }),
  setHomeEnterClip: (clip) => set({ homeEnterClip: clip }),
  openPanel: (mode) => set({ panel: mode }),
  closePanel: () => set({ panel: null }),
  hide: (kind = 'edge') => {
    if (kind !== 'perch') window.clearTimeout(speechTimer);
    persistHidden(true);
    persistHideKind(kind);
    if (kind === 'perch') persistPerchDismissed(false);
    set((s) => ({
      hidden: true,
      hideKind: kind,
      panel: null,
      pendingPanel: null,
      emergeFromEdge: false,
      emergeFromPerch: false,
      dragActive: false,
      homeEnterClip: 'none',
      homeEnterPending: false,
      homeUnderCard: false,
      speech: kind === 'perch' ? s.speech : null,
      perchEnterConsumed: kind === 'perch' ? true : s.perchEnterConsumed,
      perchDismissed: kind === 'perch' ? false : s.perchDismissed,
    }));
  },
  show: () => {
    persistHidden(false);
    persistHideKind(null);
    set({ hidden: false, emergeFromEdge: false, emergeFromPerch: false });
  },
  showFromEdge: (panel) => {
    persistHidden(false);
    persistHideKind(null);
    set({
      hidden: false,
      emergeFromEdge: true,
      emergeFromPerch: false,
      pendingPanel: panel ?? null,
    });
  },
  showFromPerch: (dismissNest = false, panel) => {
    window.clearTimeout(speechTimer);
    persistHidden(false);
    persistHideKind(null);
    set((s) => {
      const perchDismissed = dismissNest || s.perchDismissed;
      persistPerchDismissed(perchDismissed);
      return {
        hidden: false,
        emergeFromPerch: true,
        emergeFromEdge: false,
        perchDismissed,
        pendingPanel: panel ?? null,
        speech: null,
      };
    });
  },
  consumePerchEnter: () => set({ perchEnterConsumed: true }),
  resetPerchDismissed: () => {
    persistPerchDismissed(false);
    set({ perchDismissed: false });
  },
  setPerchPresent: (present) => set({ perchPresent: present }),
  clearEmerge: () => set({ emergeFromEdge: false, emergeFromPerch: false }),
  requestTour: () => set((s) => ({ tourNonce: s.tourNonce + 1 })),
  requestClawTour: () => set((s) => ({ clawTourNonce: s.clawTourNonce + 1 })),
  setTourGuiding: (tourGuiding) => set({ tourGuiding }),
  requestCollapse: () => set((s) => ({ collapseNonce: s.collapseNonce + 1 })),
  beginHomeEnter: () => {
    persistHidden(false);
    persistHideKind(null);
    persistPerchDismissed(false);
    set({
      hidden: false,
      perchDismissed: false,
      perchEnterConsumed: false,
      homeEnterPending: true,
      emergeFromEdge: false,
      emergeFromPerch: false,
      homeEnterClip: 'none',
      homeGreetPending: !loadHomeGreeted(),
    });
  },
  consumeHomeEnter: () => set({ homeEnterPending: false }),
  speak: (text, opts) => {
    window.clearTimeout(speechTimer);
    const id = opts?.id ?? `speech-${Date.now()}`;
    set({ speech: { id, text } });
    const ttl = opts?.ttlMs ?? 10_000;
    if (ttl <= 0) return;
    speechTimer = window.setTimeout(() => {
      set((s) => (s.speech?.id === id ? { speech: null } : {}));
    }, ttl);
  },
  dismissSpeech: () => {
    window.clearTimeout(speechTimer);
    set({ speech: null });
  },
  maybeHomeGreet: () => {
    const s = useRhinoAssistant.getState();
    if (!s.homeGreetPending || s.speech) return;
    if (loadHomeGreeted()) {
      set({ homeGreetPending: false });
      return;
    }
    persistHomeGreeted();
    set({ homeGreetPending: false });
    s.speak(RHINO_HOME_GREET, { id: 'home-greet', ttlMs: 12_000 });
  },
}));

/** 各模式同档；切换不跳窗（对话左右分栏需要更宽） */
const PANEL_W = 560;
const PANEL_H = 420;

export const RHINO_PANEL_SIZE: Record<
  RhinoPanelMode,
  { w: number; h: number; title: string }
> = {
  chat: { w: PANEL_W, h: PANEL_H, title: RHINO_NAME },
  features: { w: PANEL_W, h: PANEL_H, title: '功能' },
  help: { w: PANEL_W, h: PANEL_H, title: '帮助' },
  feedback: { w: PANEL_W, h: PANEL_H, title: '反馈' },
  notifications: { w: PANEL_W, h: PANEL_H, title: '通知' },
};

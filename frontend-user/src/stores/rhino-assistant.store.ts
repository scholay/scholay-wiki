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
 * edge / perch = 归位(左右缘 peek / 页面巢),仍是可见的栖息态;
 * nav = 真正的隐藏 —— 收进右上角导航条 chip(hover 出菜单,点击释放)。
 */
export type RhinoHideKind = 'edge' | 'perch' | 'nav';

const HIDDEN_KEY = 'scholay.rhino-assistant.hidden';
const HIDE_KIND_KEY = 'scholay.rhino-assistant.hide-kind';

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
  /** User pulled the mascot out — nest is gone for this page load */
  perchDismissed: boolean;
  /** First-load run-into-nest already happened */
  perchEnterConsumed: boolean;
  /** Next floating mount should jump inward from the docked edge */
  emergeFromEdge: boolean;
  /** Next floating mount should step out of the in-page perch */
  emergeFromPerch: boolean;
  /** Increment to start homepage novice tour (from help panel) */
  tourNonce: number;
  /** Increment to request collapse with position restore (from nested bodies) */
  collapseNonce: number;
  /** Nest menu picked a panel — open it after the emerge animation */
  pendingPanel: RhinoPanelMode | null;

  setAnchor: (pos: RhinoPos) => void;
  openPanel: (mode: RhinoPanelMode) => void;
  closePanel: () => void;
  hide: (kind?: RhinoHideKind) => void;
  show: () => void;
  showFromEdge: (panel?: RhinoPanelMode) => void;
  showFromPerch: (dismissNest?: boolean, panel?: RhinoPanelMode) => void;
  consumePerchEnter: () => void;
  /** New page load = fresh homing chance: the nest may auto-attract again */
  resetPerchDismissed: () => void;
  setPerchPresent: (present: boolean) => void;
  clearEmerge: () => void;
  requestTour: () => void;
  requestCollapse: () => void;
}

export const useRhinoAssistant = create<RhinoAssistantState>((set) => ({
  anchor: { x: 24, y: 24 },
  panel: null,
  hidden: typeof window === 'undefined' ? false : loadHidden(),
  hideKind: typeof window === 'undefined' ? 'edge' : loadHideKind(),
  perchPresent: false,
  perchDismissed: false,
  perchEnterConsumed: false,
  emergeFromEdge: false,
  emergeFromPerch: false,
  tourNonce: 0,
  collapseNonce: 0,
  pendingPanel: null,

  setAnchor: (pos) => set({ anchor: pos }),
  openPanel: (mode) => set({ panel: mode }),
  closePanel: () => set({ panel: null }),
  hide: (kind = 'edge') => {
    persistHidden(true);
    persistHideKind(kind);
    set((s) => ({
      hidden: true,
      hideKind: kind,
      panel: null,
      pendingPanel: null,
      emergeFromEdge: false,
      emergeFromPerch: false,
      perchEnterConsumed: kind === 'perch' ? true : s.perchEnterConsumed,
      // Entering the nest (auto or drag-snap) re-opens homing on this page.
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
    persistHidden(false);
    persistHideKind(null);
    set((s) => ({
      hidden: false,
      emergeFromPerch: true,
      emergeFromEdge: false,
      perchDismissed: dismissNest || s.perchDismissed,
      pendingPanel: panel ?? null,
    }));
  },
  consumePerchEnter: () => set({ perchEnterConsumed: true }),
  resetPerchDismissed: () => set({ perchDismissed: false }),
  setPerchPresent: (present) => set({ perchPresent: present }),
  clearEmerge: () => set({ emergeFromEdge: false, emergeFromPerch: false }),
  requestTour: () => set((s) => ({ tourNonce: s.tourNonce + 1 })),
  requestCollapse: () => set((s) => ({ collapseNonce: s.collapseNonce + 1 })),
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

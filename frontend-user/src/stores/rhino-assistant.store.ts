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

const HIDDEN_KEY = 'scholay.rhino-assistant.hidden';

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

interface RhinoAssistantState {
  /** Hitbox / panel top-left */
  anchor: RhinoPos;
  /** null = collapsed to bare rhino */
  panel: RhinoPanelMode | null;
  /** Docked next to topnav avatar — floating mascot not shown */
  hidden: boolean;
  /** Increment to start homepage novice tour (from help panel) */
  tourNonce: number;
  /** Increment to request collapse with position restore (from nested bodies) */
  collapseNonce: number;

  setAnchor: (pos: RhinoPos) => void;
  openPanel: (mode: RhinoPanelMode) => void;
  closePanel: () => void;
  hide: () => void;
  show: () => void;
  requestTour: () => void;
  requestCollapse: () => void;
}

export const useRhinoAssistant = create<RhinoAssistantState>((set) => ({
  anchor: { x: 24, y: 24 },
  panel: null,
  hidden: typeof window === 'undefined' ? false : loadHidden(),
  tourNonce: 0,
  collapseNonce: 0,

  setAnchor: (pos) => set({ anchor: pos }),
  openPanel: (mode) => set({ panel: mode }),
  closePanel: () => set({ panel: null }),
  hide: () => {
    persistHidden(true);
    set({ hidden: true, panel: null });
  },
  show: () => {
    persistHidden(false);
    set({ hidden: false });
  },
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

/**
 * 侧边栏状态 Store (Zustand)
 *
 * 完整替代 contexts/SidebarContext.js：
 *   - 侧边栏配置管理
 *   - 移动端响应式检测（resize 监听）
 *   - 移动端打开时 body overflow 锁定
 */

import { create } from 'zustand';

interface SidebarConfig {
  showHistory: boolean;
  historyType: string;
  historyItems: any[];
  currentItemId: string | null;
  onSelectItem: ((id: string) => void) | null;
  onDeleteItem: ((id: string) => void) | null;
  onRenameItem: ((id: string, title: string) => void) | null;
  onNewItem: (() => void) | null;
  historyLoading: boolean;
}

const DEFAULT_CONFIG: SidebarConfig = {
  showHistory: false,
  historyType: 'conversation',
  historyItems: [],
  currentItemId: null,
  onSelectItem: null,
  onDeleteItem: null,
  onRenameItem: null,
  onNewItem: null,
  historyLoading: false,
};

interface SidebarStore {
  sidebarConfig: SidebarConfig;
  isMobileOpen: boolean;
  isMobile: boolean;
  updateSidebarConfig: (config: Partial<SidebarConfig>) => void;
  resetSidebarConfig: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsMobile: (v: boolean) => void;
}

/* ----------------------------------------------------------------
 * body overflow 锁定
 * ---------------------------------------------------------------- */

function updateBodyOverflow(isMobileOpen: boolean, isMobile: boolean) {
  document.body.style.overflow =
    isMobileOpen && isMobile ? 'hidden' : '';
}

/* ----------------------------------------------------------------
 * Store 定义
 * ---------------------------------------------------------------- */

export const useSidebarStore = create<SidebarStore>()((set, get) => ({
  sidebarConfig: { ...DEFAULT_CONFIG },
  isMobileOpen: false,
  isMobile: typeof window !== 'undefined' ? window.innerWidth <= 768 : false,

  updateSidebarConfig: (config) =>
    set((s) => ({ sidebarConfig: { ...s.sidebarConfig, ...config } })),

  resetSidebarConfig: () => set({ sidebarConfig: { ...DEFAULT_CONFIG } }),

  openMobileSidebar: () => {
    set({ isMobileOpen: true });
    updateBodyOverflow(true, get().isMobile);
  },

  closeMobileSidebar: () => {
    set({ isMobileOpen: false });
    updateBodyOverflow(false, get().isMobile);
  },

  toggleMobileSidebar: () => {
    const next = !get().isMobileOpen;
    set({ isMobileOpen: next });
    updateBodyOverflow(next, get().isMobile);
  },

  setIsMobile: (v) => {
    set({ isMobile: v });
    updateBodyOverflow(get().isMobileOpen, v);
  },
}));

/* ----------------------------------------------------------------
 * resize 监听器（模块加载时自动启动）
 * ---------------------------------------------------------------- */

if (typeof window !== 'undefined') {
  const onResize = () => {
    const isMobile = window.innerWidth <= 768;
    const state = useSidebarStore.getState();
    if (state.isMobile !== isMobile) {
      state.setIsMobile(isMobile);
    }
  };
  window.addEventListener('resize', onResize);
}

/* 选择器 */
export const useSidebarConfig = () => useSidebarStore((s) => s.sidebarConfig);
export const useIsMobile = () => useSidebarStore((s) => s.isMobile);

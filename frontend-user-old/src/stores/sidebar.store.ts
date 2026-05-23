import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

interface SidebarConfig {
  showHistory: boolean;
  historyType: string;
  historyItems: any[];
  currentItemId: string | number | null;
  onSelectItem: ((id: string | number) => void) | null;
  onDeleteItem: ((id: string | number) => void) | null;
  onRenameItem: ((id: string | number, name: string) => void) | null;
  onNewItem: (() => void) | null;
  historyLoading: boolean;
}

interface SidebarStore {
  sidebarConfig: SidebarConfig;
  isMobileOpen: boolean;
  isMobile: boolean;

  updateSidebarConfig: (config: Partial<SidebarConfig>) => void;
  resetSidebarConfig: () => void;
  setIsMobile: (val: boolean) => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
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

export const useSidebarStore = create<SidebarStore>((set) => ({
  sidebarConfig: { ...DEFAULT_CONFIG },
  isMobileOpen: false,
  isMobile: window.innerWidth <= 768,

  updateSidebarConfig: (config) =>
    set((state) => ({
      sidebarConfig: { ...state.sidebarConfig, ...config },
    })),

  resetSidebarConfig: () => set({ sidebarConfig: { ...DEFAULT_CONFIG } }),

  setIsMobile: (val) => set({ isMobile: val }),

  openMobileSidebar: () => set({ isMobileOpen: true }),

  closeMobileSidebar: () => set({ isMobileOpen: false }),

  toggleMobileSidebar: () =>
    set((state) => ({ isMobileOpen: !state.isMobileOpen })),
}));

// Debounced resize listener (runs outside React, with proper cleanup support)
let _resizeCleanup: (() => void) | null = null;

function initResizeListener() {
  if (_resizeCleanup) return; // already initialized
  let rafId: number | null = null;
  const handleResize = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const mobile = window.innerWidth <= 768;
      if (useSidebarStore.getState().isMobile !== mobile) {
        useSidebarStore.setState({ isMobile: mobile });
      }
      rafId = null;
    });
  };
  window.addEventListener('resize', handleResize, { passive: true });
  _resizeCleanup = () => {
    window.removeEventListener('resize', handleResize);
    if (rafId) cancelAnimationFrame(rafId);
  };
}

// Auto-init on first import (safe for SSR: guarded by typeof window)
if (typeof window !== 'undefined') {
  initResizeListener();
}

// Body overflow management
useSidebarStore.subscribe((state) => {
  document.body.style.overflow =
    state.isMobileOpen && state.isMobile ? 'hidden' : '';
});

export const useSidebar = () =>
  useSidebarStore(
    useShallow((s) => ({
      sidebarConfig: s.sidebarConfig,
      updateSidebarConfig: s.updateSidebarConfig,
      resetSidebarConfig: s.resetSidebarConfig,
      isMobile: s.isMobile,
      isMobileOpen: s.isMobileOpen,
      openMobileSidebar: s.openMobileSidebar,
      closeMobileSidebar: s.closeMobileSidebar,
      toggleMobileSidebar: s.toggleMobileSidebar,
    })),
  );

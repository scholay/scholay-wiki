import { create } from 'zustand';

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

// Resize listener (runs outside React)
function handleResize() {
  const mobile = window.innerWidth <= 768;
  if (useSidebarStore.getState().isMobile !== mobile) {
    useSidebarStore.setState({ isMobile: mobile });
  }
}
window.addEventListener('resize', handleResize);

// Body overflow management
useSidebarStore.subscribe((state) => {
  document.body.style.overflow =
    state.isMobileOpen && state.isMobile ? 'hidden' : '';
});

export const useSidebar = () => {
  const sidebarConfig = useSidebarStore((s) => s.sidebarConfig);
  const updateSidebarConfig = useSidebarStore((s) => s.updateSidebarConfig);
  const resetSidebarConfig = useSidebarStore((s) => s.resetSidebarConfig);
  const isMobile = useSidebarStore((s) => s.isMobile);
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen);
  const openMobileSidebar = useSidebarStore((s) => s.openMobileSidebar);
  const closeMobileSidebar = useSidebarStore((s) => s.closeMobileSidebar);
  const toggleMobileSidebar = useSidebarStore((s) => s.toggleMobileSidebar);

  return {
    sidebarConfig,
    updateSidebarConfig,
    resetSidebarConfig,
    isMobile,
    isMobileOpen,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
  };
};

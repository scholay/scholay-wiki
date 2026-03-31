/**
 * Compatibility layer – delegates entirely to the Zustand sidebar store.
 * SidebarProvider is now a no-op wrapper (side effects run in store module).
 */
import React from 'react';
import { useSidebarStore } from '../stores/sidebar.store';

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

export const SidebarProvider = ({ children }) => children;

/**
 * SidebarBridge — 桥接层
 *
 * 让使用旧 useSidebar() 的页面自动读取 Zustand sidebarStore。
 * 当所有页面迁移到 useSidebarStore 后可删除此文件。
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useSidebarStore } from '../../shared/stores/sidebarStore';

interface SidebarContextValue {
  sidebarConfig: ReturnType<typeof useSidebarStore>['sidebarConfig'];
  updateSidebarConfig: ReturnType<typeof useSidebarStore>['updateSidebarConfig'];
  resetSidebarConfig: ReturnType<typeof useSidebarStore>['resetSidebarConfig'];
  isMobile: boolean;
  isMobileOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarBridgeProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const sidebarConfig = useSidebarStore((s) => s.sidebarConfig);
  const isMobile = useSidebarStore((s) => s.isMobile);
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen);
  const updateSidebarConfig = useSidebarStore((s) => s.updateSidebarConfig);
  const resetSidebarConfig = useSidebarStore((s) => s.resetSidebarConfig);
  const openMobileSidebar = useSidebarStore((s) => s.openMobileSidebar);
  const closeMobileSidebar = useSidebarStore((s) => s.closeMobileSidebar);
  const toggleMobileSidebar = useSidebarStore((s) => s.toggleMobileSidebar);

  const value = useMemo<SidebarContextValue>(
    () => ({
      sidebarConfig,
      updateSidebarConfig,
      resetSidebarConfig,
      isMobile,
      isMobileOpen,
      openMobileSidebar,
      closeMobileSidebar,
      toggleMobileSidebar,
    }),
    [
      sidebarConfig,
      isMobile,
      isMobileOpen,
      updateSidebarConfig,
      resetSidebarConfig,
      openMobileSidebar,
      closeMobileSidebar,
      toggleMobileSidebar,
    ]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarBridgeProvider');
  }
  return context;
};

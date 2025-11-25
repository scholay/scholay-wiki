import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const SidebarContext = createContext();

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
};

export const SidebarProvider = ({ children }) => {
  // 侧边栏配置状态
  const [sidebarConfig, setSidebarConfig] = useState({
    showHistory: false,
    historyType: 'conversation',
    historyItems: [],
    currentItemId: null,
    onSelectItem: null,
    onDeleteItem: null,
    onRenameItem: null,
    onNewItem: null,
    historyLoading: false,
  });

  // 移动端侧边栏状态
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 检测是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 移动端打开侧边栏时禁止body滚动
  useEffect(() => {
    if (isMobileOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen, isMobile]);

  // 更新侧边栏配置
  const updateSidebarConfig = useCallback((config) => {
    setSidebarConfig(prev => ({
      ...prev,
      ...config,
    }));
  }, []);

  // 重置侧边栏配置（用于无历史记录的页面）
  const resetSidebarConfig = useCallback(() => {
    setSidebarConfig({
      showHistory: false,
      historyType: 'conversation',
      historyItems: [],
      currentItemId: null,
      onSelectItem: null,
      onDeleteItem: null,
      onRenameItem: null,
      onNewItem: null,
      historyLoading: false,
    });
  }, []);

  // 打开移动端侧边栏
  const openMobileSidebar = useCallback(() => {
    setIsMobileOpen(true);
  }, []);

  // 关闭移动端侧边栏
  const closeMobileSidebar = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  // 切换移动端侧边栏
  const toggleMobileSidebar = useCallback(() => {
    setIsMobileOpen(prev => !prev);
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        sidebarConfig,
        updateSidebarConfig,
        resetSidebarConfig,
        isMobile,
        isMobileOpen,
        openMobileSidebar,
        closeMobileSidebar,
        toggleMobileSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};


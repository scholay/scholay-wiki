import React, { createContext, useContext, useState, useCallback } from 'react';

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

  return (
    <SidebarContext.Provider
      value={{
        sidebarConfig,
        updateSidebarConfig,
        resetSidebarConfig,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};


import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import AppSidebar from './AppSidebar';

/**
 * MainLayout - 主布局组件
 * 包含持久化的侧边栏，内容区域通过 Outlet 渲染子路由
 * 这样在路由切换时侧边栏不会重新挂载，避免闪烁
 * 
 * 各个页面通过 useSidebar hook 来控制侧边栏的行为
 */
const MainLayout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { sidebarConfig } = useSidebar();
  
  // 侧边栏折叠状态 - 从 localStorage 持久化
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  // 保存侧边栏状态到 localStorage
  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', newState);
      return newState;
    });
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {/* 持久化的侧边栏 - 只在登录时显示 */}
      {isAuthenticated && (
        <AppSidebar
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showHistory={sidebarConfig.showHistory}
          historyType={sidebarConfig.historyType}
          historyItems={sidebarConfig.historyItems}
          currentItemId={sidebarConfig.currentItemId}
          onSelectItem={sidebarConfig.onSelectItem}
          onDeleteItem={sidebarConfig.onDeleteItem}
          onRenameItem={sidebarConfig.onRenameItem}
          onNewItem={sidebarConfig.onNewItem}
          historyLoading={sidebarConfig.historyLoading}
        />
      )}
      
      {/* 子路由内容 - 通过 context 传递 sidebarCollapsed 状态 */}
      <Outlet context={{ sidebarCollapsed, isAuthenticated }} />
    </>
  );
};

export default MainLayout;


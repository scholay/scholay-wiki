import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import AppSidebar from './AppSidebar';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

/**
 * MainLayout - 主布局组件
 * 包含持久化的侧边栏，内容区域通过 Outlet 渲染子路由
 * 这样在路由切换时侧边栏不会重新挂载，避免闪烁
 * 
 * 各个页面通过 useSidebar hook 来控制侧边栏的行为
 */
const MainLayout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { sidebarConfig, isMobile } = useSidebar();
  const location = useLocation();
  
  // 侧边栏折叠状态 - 从 localStorage 持久化
  // 未登录用户默认收起侧边栏
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    // 如果有保存的值，使用保存的值
    if (saved !== null) {
    return saved === 'true';
    }
    // 默认收起（未登录用户）
    return true;
  });
  
  // 当用户登录状态变化时，如果没有保存过偏好，则根据登录状态设置默认值
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    // 只有在没有保存过偏好时才自动设置
    if (saved === null) {
      // 未登录用户默认收起，已登录用户默认展开
      setSidebarCollapsed(!isAuthenticated);
    }
  }, [isAuthenticated]);
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

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
  
  const handleShowLogin = () => {
    setShowAuthModal(true);
  };
  
  const handleLoginSuccess = () => {
    setShowAuthModal(false);
  };

  // 判断是否应该渲染侧边栏组件
  // 登录状态或特定页面时渲染侧边栏
  const shouldRenderSidebar = isAuthenticated || 
    location.pathname === '/search-results' || 
    location.pathname === '/advanced-search' || 
    location.pathname === '/chat' ||
    location.pathname === '/peer-review';

  return (
    <>
      {/* 持久化的侧边栏 */}
      {shouldRenderSidebar && (
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
          isAuthenticated={isAuthenticated}
          onShowLogin={handleShowLogin}
        />
      )}
      
      {/* 子路由内容 - 通过 context 传递 sidebarCollapsed 状态 */}
      <Outlet context={{ sidebarCollapsed: shouldRenderSidebar ? sidebarCollapsed : false, isAuthenticated }} />
      
      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}
    </>
  );
};

export default MainLayout;



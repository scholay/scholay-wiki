/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * MainLayout - 主布局组件
 * 
 * 布局结构：
 * ┌─────────────────────────────────────────┐
 * │  TopNavBar (通用顶部栏)                   │
 * ├─────────────────────────────────────────┤
 * │                                         │
 * │  Content (正文区域，由子路由渲染)          │
 * │                                         │
 * └─────────────────────────────────────────┘
 * 
 * - 顶部栏和正文区域使用 flex 布局，顶部栏固定高度，正文占据剩余空间
 * - 抽屉式侧边栏通过 Portal 渲染，不影响主布局
 * - 某些页面可以选择不显示通用顶部栏（通过 hideTopNav 参数）
 */

import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../stores/sidebar.store';
import TopNavBar from './TopNavBar';
import DrawerSidebar from './DrawerSidebar';
import SharedFooter from './SharedFooter';
import './styles/MainLayout.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

const MainLayout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { sidebarConfig } = useSidebar();
  const location = useLocation();
  
  // 抽屉侧边栏打开状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleOpenDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);
  
  const handleShowLogin = useCallback(() => {
    setShowAuthModal(true);
  }, []);
  
  const handleLoginSuccess = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  const showTopNav = !location.pathname.startsWith('/paper/');

  return (
    <div className="main-layout">
      {/* 顶部导航栏 - 固定高度 */}
      {showTopNav && (
        <TopNavBar
          user={user}
          isAuthenticated={isAuthenticated}
          onMenuClick={handleOpenDrawer}
          onShowLogin={handleShowLogin}
          onLogout={handleLogout}
        />
      )}

      {/* 正文区域 - 占据剩余空间 */}
      <div className={`main-layout-content ${showTopNav ? 'with-top-nav' : ''}`}>
        <Outlet context={{ 
          isAuthenticated,
          onShowLogin: handleShowLogin,
          showTopNav: showTopNav,
          onOpenDrawer: handleOpenDrawer
        }} />
      </div>

      {/* 抽屉式侧边栏 - 通过 Portal 渲染 */}
      <DrawerSidebar
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        sidebarConfig={sidebarConfig}
      />
      
      {/* 全局底部导航栏 - 法律链接和版权信息 */}
      <SharedFooter />

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
    </div>
  );
};

export default MainLayout;

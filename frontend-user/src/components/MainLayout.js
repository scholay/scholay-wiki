/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * MainLayout - 主布局组件（Ant Design 版）
 * 
 * 布局结构：
 * ┌─────────────────────────────────────────┐
 * │  TopNavBar (通用顶部栏)                   │
 * ├─────────────────────────────────────────┤
 * │                                         │
 * │  Content (正文区域，由子路由渲染)          │
 * │                                         │
 * └─────────────────────────────────────────┘
 */

import React, { useState, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Layout } from 'antd';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import TopNavBar from './TopNavBar';
import DrawerSidebar from './DrawerSidebar';
import SharedFooter from './SharedFooter';

const { Content } = Layout;

const AuthModal = lazy(() => import('./AuthModal'));

const MainLayout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { sidebarConfig } = useSidebar();
  const location = useLocation();
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleOpenDrawer = () => setIsDrawerOpen(true);
  const handleCloseDrawer = () => setIsDrawerOpen(false);
  const handleLogout = () => logout();
  const handleShowLogin = () => setShowAuthModal(true);
  const handleLoginSuccess = () => setShowAuthModal(false);

  const isPaperDetailPage = location.pathname.startsWith('/paper/');
  const showTopNav = !isPaperDetailPage;

  return (
    <Layout
      style={{
        minHeight: '100vh',
        height: '100vh',
        background: 'var(--background)',
        overflow: 'hidden',
      }}
    >
      {showTopNav && (
        <TopNavBar
          user={user}
          isAuthenticated={isAuthenticated}
          onMenuClick={handleOpenDrawer}
          onShowLogin={handleShowLogin}
          onLogout={handleLogout}
        />
      )}

      <Content
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Outlet context={{ 
          isAuthenticated,
          onShowLogin: handleShowLogin,
          showTopNav,
          onOpenDrawer: handleOpenDrawer,
        }} />
      </Content>

      <DrawerSidebar
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        showHistory={sidebarConfig.showHistory}
        historyType={sidebarConfig.historyType}
        historyItems={sidebarConfig.historyItems}
        currentItemId={sidebarConfig.currentItemId}
        onSelectItem={sidebarConfig.onSelectItem}
        onDeleteItem={sidebarConfig.onDeleteItem}
        onRenameItem={sidebarConfig.onRenameItem}
        historyLoading={sidebarConfig.historyLoading}
      />
      
      <SharedFooter />

      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}
    </Layout>
  );
};

export default MainLayout;

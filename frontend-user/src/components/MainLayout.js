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

import React, { useState, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
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

  const handleOpenDrawer = () => {
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
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

  // 根据当前路径生成面包屑
  const getBreadcrumbs = () => {
    const path = location.pathname;
    const breadcrumbs = [{ label: '首页', path: '/' }];
    
    if (path === '/search-results') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('mode') === 'ai') {
        breadcrumbs.push({ label: '智能分析' });
      } else {
        breadcrumbs.push({ label: '学术检索' });
      }
    } else if (path === '/assistant') {
      breadcrumbs.push({ label: '精品AI工具' });
    } else if (path === '/chat') {
      breadcrumbs.push({ label: '精品AI工具', path: '/assistant' });
      breadcrumbs.push({ label: 'AI 聊天' });
    } else if (path === '/peer-review') {
      breadcrumbs.push({ label: '精品AI工具', path: '/assistant' });
      breadcrumbs.push({ label: '同行评审' });
    } else if (path === '/settings') {
      breadcrumbs.push({ label: '设置' });
    } else if (path.startsWith('/paper/')) {
      breadcrumbs.push({ label: '论文详情' });
    } else if (path === '/pricing') {
      breadcrumbs.push({ label: '订阅方案' });
    } else if (path === '/fund-center') {
      breadcrumbs.push({ label: '基金中心' });
    } else if (path === '/feedback') {
      breadcrumbs.push({ label: '意见反馈' });
    } else if (path === '/about') {
      breadcrumbs.push({ label: '关于我们' });
    }
    
    // 首页不显示面包屑
    if (path === '/') {
      return [];
    }
    
    return breadcrumbs;
  };

  // 根据路由决定是否显示通用顶部栏
  // paper 详情页有自己的 pd-top-header，不需要显示 MainLayout 的 TopNavBar
  const isPaperDetailPage = location.pathname.startsWith('/paper/');
  const showTopNav = !isPaperDetailPage;

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
          breadcrumbs={getBreadcrumbs()}
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
        showHistory={sidebarConfig.showHistory}
        historyType={sidebarConfig.historyType}
        historyItems={sidebarConfig.historyItems}
        currentItemId={sidebarConfig.currentItemId}
        onSelectItem={sidebarConfig.onSelectItem}
        onDeleteItem={sidebarConfig.onDeleteItem}
        onRenameItem={sidebarConfig.onRenameItem}
        historyLoading={sidebarConfig.historyLoading}
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

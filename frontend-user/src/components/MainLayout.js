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

import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import TopNavBar from './TopNavBar';
import SharedFooter from './SharedFooter';
import './styles/MainLayout.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./auth/AuthModal'));

const MainLayout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const scrollRef = useRef(null);

  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  /*
   * 路由切换时把本布局的滚动容器复位到顶部。
   *
   * 为什么不只依赖全局的 <ScrollToTop />：App.js 的外层 <Suspense fallback={null}>
   * 在任意 lazy 路由挂起时会把整棵子树替换为 null —— 那一瞬间 `.main-layout-scroll`
   * 并不在 DOM 里，全局 ScrollToTop 的查询会落空。等到新页面挂载完成，
   * `scrollTop` 已经保留在前一页留下的数值。
   *
   * 把重置放进 MainLayout 内部，就绑定到容器自身的挂载生命周期：
   *   - 无论是同一容器被复用（pathname 变），还是 Suspense 后重新挂载，
   *     这个 effect 都会携带最新 pathname 命中一次，拿到的 ref 一定有效。
   *
   * 两次 rAF 兜底：若 Suspense 恢复后的首帧又带来布局抖动（例如长内容重建
   * 使浏览器觉得要"恢复"滚动位置），下一帧再复位一次。
   */
  useEffect(() => {
    if (location.hash) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname, location.hash]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);
  
  const handleShowLogin = useCallback(() => {
    setShowAuthModal(true);
  }, []);
  
  const handleLoginSuccess = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  const showTopNav = !location.pathname.startsWith('/paper/') && !location.pathname.startsWith('/author/');

  // 功能性页面：禁用外层滚动，让页面内部自行管理滚动
  const isFullHeightPage = ['/search-results', '/assistant', '/chat', '/peer-review', '/latex-writer'].some(
    p => location.pathname.startsWith(p)
  );

  return (
    <div className="main-layout">
      {/* 顶部导航栏 - 固定高度 */}
      {showTopNav && (
        <TopNavBar
          user={user}
          isAuthenticated={isAuthenticated}
          onShowLogin={handleShowLogin}
          onLogout={handleLogout}
        />
      )}

      {/* 正文区域 - 占据剩余空间，内部可滚动 */}
      <div className={`main-layout-content ${showTopNav ? 'with-top-nav' : ''}`}>
        <div ref={scrollRef} className={`main-layout-scroll ${isFullHeightPage ? 'no-scroll' : ''}`}>
          <div className={`main-layout-page ${isFullHeightPage ? 'full-height' : ''}`}>
            <Outlet context={{
              isAuthenticated,
              onShowLogin: handleShowLogin,
              showTopNav: showTopNav,
            }} />
          </div>
          <SharedFooter />
        </div>
      </div>

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

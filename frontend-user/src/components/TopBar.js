/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSidebar } from '../contexts/SidebarContext';
import { useAuth } from '../utils/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import api from '../services/api';
import './TopBar.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

/**
 * TopBar - 通用顶部栏组件
 * 包含：菜单按钮、页面标题、用户状态等
 */
const TopBar = ({ 
  title = '',           // 页面标题（可选）
  showTitle = false,    // 是否显示标题
  children,             // 自定义内容（放在中间区域）
  rightContent,         // 自定义右侧内容
  className = ''        // 额外的样式类
}) => {
  const navigate = useNavigate();
  const { openSidebar } = useSidebar();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme } = useTheme();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const userMenuRef = useRef(null);
  const avatarRef = useRef(null);

  // 获取订阅信息
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await api.get('/user/subscription/my');
        if (response.data.code === 0) {
          setSubscription(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      }
    };

    if (isAuthenticated) {
      fetchSubscription();
    }
  }, [isAuthenticated]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu &&
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target) &&
          avatarRef.current &&
          !avatarRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // 获取用户头像首字母
  const getUserInitial = () => {
    if (!user) return '?';
    const displayName = user.username || user.email || user.phone;
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
  };

  // 获取用户显示名称
  const getUserDisplayName = () => {
    if (!user) return '';
    return user.username || user.email?.split('@')[0] || user.phone || '用户';
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate('/');
  };

  return (
    <>
      <div className={`top-bar ${className}`}>
        {/* 左侧：菜单按钮 */}
        <div className="top-bar-left">
          <button
            className="top-bar-menu-btn"
            onClick={openSidebar}
            aria-label="打开菜单"
          >
            <Menu size={22} />
          </button>
          
          {/* 页面标题 */}
          {showTitle && title && (
            <h1 className="top-bar-title">{title}</h1>
          )}
        </div>

        {/* 中间区域：自定义内容 */}
        <div className="top-bar-center">
          {children}
        </div>

        {/* 右侧：用户状态 */}
        <div className="top-bar-right">
          {/* 自定义右侧内容 */}
          {rightContent}
          
          {/* 主题切换 */}
          <div className="top-bar-theme-toggle">
            <ThemeToggle />
          </div>

          {/* 用户状态 */}
          {isAuthenticated ? (
            <div 
              ref={avatarRef}
              className="top-bar-user"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="top-bar-avatar">
                {getUserInitial()}
              </div>
            </div>
          ) : (
            <button
              className="top-bar-login-btn"
              onClick={() => setShowAuthModal(true)}
            >
              登录
            </button>
          )}
        </div>
      </div>

      {/* 用户菜单弹窗 */}
      {showUserMenu && isAuthenticated && ReactDOM.createPortal(
        <div
          ref={userMenuRef}
          className="top-bar-user-menu"
        >
          <div className={`user-menu-header ${subscription?.plan_code === 'pro' ? 'premium-pro' : ''} ${subscription?.plan_code === 'max' ? 'premium-max' : ''}`}>
            <div className="user-avatar-large">
              {getUserInitial()}
            </div>
            <div className="user-info-text">
              <div className="user-name">{getUserDisplayName()}</div>
              {subscription && (
                <span className={`subscription-badge ${subscription.plan_code}`}>
                  {subscription.plan_name}
                </span>
              )}
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <div className="user-menu-options">
            <button
              className="user-menu-item"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>个人资料</span>
            </button>

            <button
              className="user-menu-item"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings?tab=subscription');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="8" width="18" height="12" rx="2" ry="2"/>
                <path d="M3 8v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>管理订阅</span>
            </button>

            <button
              className="user-menu-item"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings?tab=invitation');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span>邀请推广</span>
            </button>

            <div className="user-menu-divider"></div>

            <button
              className="user-menu-item logout-item"
              onClick={handleLogout}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>退出登录</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default TopBar;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * TopNavBar - 通用顶部导航栏组件
 * 
 * 功能：
 * 1. 左侧：菜单按钮（点击打开侧边栏）+ Logo
 * 2. 中间：面包屑导航 或 自定义内容
 * 3. 右侧：未登录显示登录按钮，已登录显示用户头像
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import { NormalSearchIcon } from './SearchIcons';
import MessageDropdown from './MessageDropdown';
import api, { messageAPI } from '../services/api';
import wsClient from '../services/websocket';
import logger from '../utils/logger';
import './styles/TopNavBar.css';
import './MessageDropdown.css';

const TopNavBar = ({
  user,
  isAuthenticated,
  onMenuClick,
  onShowLogin,
  onLogout,
  // 额外的右侧按钮
  rightButtons,
  // 是否显示菜单按钮
  showMenuButton = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  // 站内信相关状态
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const userMenuRef = useRef(null);
  const avatarRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  // 获取未读消息数量
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await messageAPI.getUnreadCount();
      if (response.data.code === 0) {
        setUnreadMessageCount(response.data.data.count || 0);
      }
    } catch (error) {
      logger.error('Failed to fetch unread message count:', error);
    }
  }, []);

  // 监听 WebSocket 未读数更新（实时更新小红点）
  useEffect(() => {
    const unsubscribe = wsClient.on('unreadCount', (data) => {
      logger.debug('[TopNavBar] WebSocket unread count update:', data);
      if (data && typeof data.count === 'number') {
        setUnreadMessageCount(data.count);
      }
    });
    return unsubscribe;
  }, []);

  // 获取未读消息
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
  }, [user, fetchUnreadCount]);


  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      const messageModal = document.querySelector('.msg-modal-overlay');
      
      if (showUserMenu &&
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target) &&
          avatarRef.current &&
          !avatarRef.current.contains(event.target) &&
          (!messageModal || !messageModal.contains(event.target))) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // 更新菜单位置
  const updateMenuPosition = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  };

  useEffect(() => {
    if (showUserMenu) {
      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition);
      return () => {
        window.removeEventListener('resize', updateMenuPosition);
        window.removeEventListener('scroll', updateMenuPosition);
      };
    }
  }, [showUserMenu]);

  // 获取用户头像首字母
  const getUserInitial = () => {
    if (!user) return '?';
    const displayName = user.username || user.email;
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
  };

  // 获取用户显示名（简短，用于顶部导航）
  const getUserDisplayName = () => {
    if (!user) return '用户';
    // 优先使用用户名
    if (user.username) return user.username;
    // 其次使用邮箱前缀
    if (user.email) {
      const emailPrefix = user.email.split('@')[0];
      return emailPrefix.length > 10 ? emailPrefix.substring(0, 10) + '...' : emailPrefix;
    }
    // 手机号隐藏中间4位
    if (user.phone) {
      return user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    }
    // 微信名
    if (user.wechat_name) return user.wechat_name;
    // GitHub 用户名
    if (user.github_login) return user.github_login;
    return '用户';
  };

  const handleAvatarClick = () => {
    setShowUserMenu(!showUserMenu);
  };

  return (
    <>
      <header className="top-nav-bar">
        {/* 左侧区域：菜单按钮 + 导航菜单 */}
        <div className="top-nav-left navbar-left">
          {showMenuButton && (
            <button
              className="top-nav-menu-btn"
              onClick={onMenuClick}
              aria-label="打开菜单"
            >
              <Menu size={22} />
            </button>
          )}
          
          {/* 主导航菜单 */}
          <nav className="top-nav-menu">
            <Link 
              to="/" 
              className={`nav-menu-item ${location.pathname === '/' || location.pathname === '/search-results' ? 'active' : ''}`}
            >
              <NormalSearchIcon size={18} />
              <span>学术搜索</span>
            </Link>
            <Link 
              to="/assistant" 
              className={`nav-menu-item ${location.pathname === '/assistant' || location.pathname.startsWith('/chat') || location.pathname.startsWith('/peer-review') ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>精品AI工具</span>
            </Link>
          </nav>
        </div>

        {/* 右侧区域 */}
        <div className="top-nav-right navbar-right">
          {/* 额外的右侧按钮 */}
          {rightButtons}

          {/* 用户区域 */}
          {isAuthenticated ? (
            // 已登录：显示用户头像 + 用户名
            <div
              ref={avatarRef}
              className="top-nav-user"
              onClick={handleAvatarClick}
            >
              <div className="top-nav-avatar">
                {getUserInitial()}
                {/* 未读消息红点 */}
                {unreadMessageCount > 0 && (
                  <span className={`um-avatar-badge ${unreadMessageCount > 99 ? '' : unreadMessageCount > 9 ? '' : 'dot'}`}>
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount > 9 ? unreadMessageCount : ''}
                  </span>
                )}
              </div>
              <span className="top-nav-username">{getUserDisplayName()}</span>
            </div>
          ) : (
            // 未登录：显示价格方案、主题切换、登录按钮
            <div className="auth-buttons">
              {/* 桌面端显示的按钮 */}
              <button
                onClick={() => navigate('/pricing')}
                className="btn-auth btn-pricing desktop-only"
              >
                价格方案
              </button>
              <div className="desktop-only">
                <ThemeToggle />
              </div>
              <button
                onClick={onShowLogin}
                className="btn-auth btn-login-register desktop-only"
              >
                登录 / 注册
              </button>
              {/* 移动端显示的按钮 */}
              <button
                onClick={onShowLogin}
                className="btn-auth btn-login-mobile mobile-only"
              >
                登录
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 用户菜单弹窗 - 卡片分层式设计 */}
      {showUserMenu && isAuthenticated && ReactDOM.createPortal(
        <div
          ref={userMenuRef}
          className="top-nav-user-menu"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
            zIndex: 10000
          }}
        >
          {/* 卡片1: 用户信息 */}
          <div className="um-card um-user-card">
            <div className="um-user-info">
              <div className="um-avatar">
                {getUserInitial()}
              </div>
              <div className="um-user-detail">
                <span className="um-username">{getUserDisplayName()}</span>
                <span className="um-plan-badge free">FREE</span>
              </div>
            </div>
          </div>

          {/* 消息通知入口 */}
          <div className="um-card um-message-card">
            <MessageDropdown
              unreadCount={unreadMessageCount}
              onUnreadCountChange={(countOrFn) => {
                if (typeof countOrFn === 'function') {
                  setUnreadMessageCount(countOrFn);
                } else {
                  setUnreadMessageCount(countOrFn);
                }
              }}
            />
          </div>

          {/* 底部操作区域 */}
          <div className="um-footer">
            <div className="um-theme-toggle">
              <ThemeToggle />
            </div>
            <button
              className="um-footer-btn um-settings-btn"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>设置</span>
            </button>
            <button
              className="um-footer-btn um-logout-btn"
              onClick={() => {
                setShowUserMenu(false);
                if (onLogout) {
                  onLogout();
                }
                navigate('/');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>退出</span>
            </button>
          </div>
        </div>,
        document.body
      )}

    </>
  );
};

export default TopNavBar;

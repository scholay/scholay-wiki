/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * TopNavBar - 通用顶部导航栏组件（Ant Design 版）
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Dropdown, Badge, Button, Space } from 'antd';
import {
  MenuOutlined,
  SettingOutlined,
  LogoutOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import MessageDropdown from './MessageDropdown';
import { messageApi as messageAPI } from 'features/settings/api/settingsApi';
import wsClient from '../services/websocket';
import logger from '../utils/logger';
import './MessageDropdown.css';

const TopNavBar = ({
  user,
  isAuthenticated,
  onMenuClick,
  onShowLogin,
  onLogout,
  rightButtons,
  showMenuButton = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme: currentTheme } = useTheme();
  const isDark = currentTheme === 'dark';
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

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

  useEffect(() => {
    const unsubscribe = wsClient.on('unreadCount', (data) => {
      logger.debug('[TopNavBar] WebSocket unread count update:', data);
      if (data && typeof data.count === 'number') {
        setUnreadMessageCount(data.count);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
  }, [user, fetchUnreadCount]);

  const getUserInitial = () => {
    if (!user) return '?';
    const displayName = user.username || user.email;
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (!user) return '用户';
    if (user.username) return user.username;
    if (user.email) {
      const emailPrefix = user.email.split('@')[0];
      return emailPrefix.length > 10 ? emailPrefix.substring(0, 10) + '...' : emailPrefix;
    }
    if (user.phone) {
      return user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    }
    if (user.wechat_name) return user.wechat_name;
    if (user.github_login) return user.github_login;
    return '用户';
  };

  const navItems = useMemo(() => [
    {
      key: 'search',
      to: '/search',
      icon: <SearchOutlined style={{ fontSize: 16 }} />,
      label: '学术搜索',
      active: location.pathname === '/search' || location.pathname === '/search-results',
    },
    {
      key: 'assistant',
      to: '/assistant',
      icon: <ToolOutlined style={{ fontSize: 16 }} />,
      label: '精品AI工具',
      active: location.pathname === '/assistant' || location.pathname.startsWith('/chat') || location.pathname.startsWith('/peer-review'),
    },
  ], [location.pathname]);

  const userDropdownItems = useMemo(() => ({
    items: [
      {
        key: 'user-info',
        type: 'group',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
            <div className="tnb-avatar-lg">{getUserInitial()}</div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{getUserDisplayName()}</span>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'messages',
        label: (
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
        ),
      },
      { type: 'divider' },
      {
        key: 'theme',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <ThemeToggle />
            <span>主题切换</span>
          </div>
        ),
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: '设置',
        onClick: () => navigate('/settings'),
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        danger: true,
        onClick: () => {
          if (onLogout) onLogout();
          navigate('/search');
        },
      },
    ],
  }), [unreadMessageCount, navigate, onLogout, user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="tnb-header">
        {/* 左侧：菜单按钮 + 导航 */}
        <div className="tnb-left">
          {showMenuButton && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={onMenuClick}
              className="tnb-menu-btn"
              aria-label="打开菜单"
            />
          )}

          {/* 桌面端导航菜单 */}
          <nav className="tnb-nav">
            {navItems.map(item => (
              <Link
                key={item.key}
                to={item.to}
                className={`tnb-nav-item ${item.active ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* 右侧 */}
        <div className="tnb-right">
          <Space size={8}>
            {rightButtons}

            {isAuthenticated ? (
              <Dropdown
                menu={userDropdownItems}
                trigger={['click']}
                placement="bottomRight"
                overlayClassName="tnb-user-dropdown"
                overlayStyle={{ minWidth: 280 }}
              >
                <div className="tnb-user-trigger">
                  <Badge
                    count={unreadMessageCount}
                    size="small"
                    offset={[-2, 2]}
                    overflowCount={99}
                  >
                    <div className="tnb-avatar">{getUserInitial()}</div>
                  </Badge>
                  <span className="tnb-username">{getUserDisplayName()}</span>
                </div>
              </Dropdown>
            ) : (
              <Space size={8}>
                <span className="tnb-desktop-only">
                  <ThemeToggle />
                </span>
                <Button
                  type="primary"
                  onClick={onShowLogin}
                  className="tnb-login-btn tnb-desktop-only"
                >
                  登录 / 注册
                </Button>
                <Button
                  type="primary"
                  size="small"
                  onClick={onShowLogin}
                  className="tnb-login-btn tnb-mobile-only"
                  shape="round"
                >
                  登录
                </Button>
              </Space>
            )}
          </Space>
        </div>
      </header>

      <style>{`
        /* ===== TopNavBar 内联样式 ===== */
        .tnb-header {
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          background: transparent;
          flex-shrink: 0;
          z-index: 100;
        }

        .tnb-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tnb-menu-btn {
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary, #666)'} !important;
          width: 36px;
          height: 36px;
          border-radius: 8px !important;
        }
        .tnb-menu-btn:hover {
          color: ${isDark ? '#fff' : 'var(--text-primary, #1a1a1a)'} !important;
          background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} !important;
        }

        .tnb-nav {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 8px;
        }

        .tnb-nav-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 14px;
          font-weight: 500;
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'};
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .tnb-nav-item:hover {
          color: ${isDark ? '#fff' : '#1a1a1a'};
          background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
        }
        .tnb-nav-item.active {
          color: ${isDark ? '#fff' : 'var(--primary-solid, #10a37f)'};
          background: ${isDark ? 'rgba(16,163,127,0.2)' : 'rgba(16,163,127,0.1)'};
        }

        .tnb-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tnb-user-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 4px 12px 4px 4px;
          border-radius: 20px;
          transition: all 0.2s ease;
        }
        .tnb-user-trigger:hover {
          background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
        }

        .tnb-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary-solid, #10a37f) 0%, var(--primary-dark, #0d8a6a) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          border: 2px solid rgba(16,163,127,0.3);
          transition: all 0.2s ease;
        }
        .tnb-user-trigger:hover .tnb-avatar {
          transform: scale(1.05);
          box-shadow: 0 2px 12px rgba(16,163,127,0.4);
          border-color: rgba(16,163,127,0.5);
        }

        .tnb-avatar-lg {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary-solid, #10a37f) 0%, var(--primary-dark, #0d8a6a) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 17px;
          font-weight: 600;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(16,163,127,0.3);
        }

        .tnb-username {
          font-size: 14px;
          font-weight: 500;
          color: ${isDark ? 'rgba(255,255,255,0.9)' : '#1a1a1a'};
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tnb-login-btn {
          border-radius: 12px !important;
          font-weight: 500 !important;
        }

        .tnb-desktop-only { display: inline-flex; }
        .tnb-mobile-only { display: none !important; }

        /* Dropdown 样式覆盖 */
        .tnb-user-dropdown .ant-dropdown-menu {
          padding: 8px;
          border-radius: 16px !important;
          min-width: 280px;
        }
        .tnb-user-dropdown .ant-dropdown-menu-item {
          border-radius: 10px;
        }
        .tnb-user-dropdown .ant-dropdown-menu-item-group-title {
          padding: 8px 12px;
        }

        /* ===== 响应式 ===== */
        @media (max-width: 768px) {
          .tnb-header {
            padding: 0 12px;
            height: 52px;
          }
          .tnb-nav {
            display: none;
          }
          .tnb-username {
            display: none;
          }
          .tnb-avatar {
            width: 30px;
            height: 30px;
            font-size: 12px;
          }
          .tnb-user-trigger {
            padding: 4px;
          }
          .tnb-desktop-only {
            display: none !important;
          }
          .tnb-mobile-only {
            display: inline-flex !important;
          }
        }

        @media (max-width: 375px) {
          .tnb-login-btn.tnb-mobile-only {
            padding: 4px 14px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
    </>
  );
};

export default TopNavBar;

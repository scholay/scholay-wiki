import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './AppSidebar.css';

const AppSidebar = ({ user, onLogout, children, collapsed, onToggleCollapse }) => {
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const userMenuRef = useRef(null);
  const avatarRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu &&
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // 获取用户头像首字母
  const getUserInitial = () => {
    if (!user || !user.email) return '?';
    return user.email.charAt(0).toUpperCase();
  };

  // 更新菜单位置
  const updateMenuPosition = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        left: collapsed ? rect.left : rect.left
      });
    }
  };

  // 当显示菜单时更新位置
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
  }, [showUserMenu, collapsed]);

  // Logo点击处理
  const handleLogoClick = () => {
    if (collapsed) {
      onToggleCollapse();
    } else {
      navigate('/');
    }
  };

  return (
    <div className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 顶部Logo和用户信息区域 */}
      <div className="app-sidebar-header">
        <div className="sidebar-header-top">
          <div
            className={`sidebar-logo ${collapsed ? 'collapsed-logo' : ''}`}
            onClick={handleLogoClick}
            onMouseEnter={() => collapsed && setLogoHovered(true)}
            onMouseLeave={() => collapsed && setLogoHovered(false)}
            style={{ cursor: 'pointer' }}
            title={collapsed ? '展开侧边栏' : '返回首页'}
          >
            {collapsed && logoHovered ? (
              // 展开图标
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="10" y1="8" x2="6" y2="12"/>
                <line x1="10" y1="16" x2="6" y2="12"/>
              </svg>
            ) : (
              <Logo width={32} height={32} variant="color" />
            )}
          </div>

          {/* 收起按钮 - 展开状态显示 */}
          <button
            className={`sidebar-collapse-btn ${collapsed ? 'hidden' : ''}`}
            onClick={onToggleCollapse}
            title="收起侧边栏"
            style={{ pointerEvents: collapsed ? 'none' : 'auto' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <line x1="14" y1="8" x2="18" y2="12"/>
              <line x1="14" y1="16" x2="18" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="sidebar-user-section">
          <div
            ref={avatarRef}
            className="sidebar-user-info"
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={collapsed ? user?.email : ''}
          >
            <div className="user-avatar">
              {getUserInitial()}
            </div>
            {!collapsed && (
              <div className="user-email-wrapper">
                <span className="user-email">{user?.email || '未登录'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 侧边栏内容区域 - 可自定义，收起时隐藏 */}
      {!collapsed && (
        <div className="app-sidebar-content">
          {children}
        </div>
      )}

      {/* 用户菜单弹窗 - 使用Portal渲染到body，避免被遮挡 */}
      {showUserMenu && ReactDOM.createPortal(
        <div
          ref={userMenuRef}
          className={`user-menu-popup ${collapsed ? 'collapsed-menu' : ''}`}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 10000
          }}
        >
              <div className="user-menu-header">
                <div className="user-avatar-large">
                  {getUserInitial()}
                </div>
                <div className="user-info-text">
                  <div className="user-name">{user?.username || user?.email?.split('@')[0] || '用户'}</div>
                  <div className="user-email-small">{user?.email}</div>
                </div>
              </div>

              <div className="user-menu-divider"></div>

              <div className="user-menu-options">
                <button
                  className="user-menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/profile');
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
                    navigate('/settings');
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  <span>设置</span>
                </button>

                <div className="user-menu-divider"></div>

                <button
                  className="user-menu-item logout-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    if (onLogout) {
                      onLogout();
                    }
                  }}
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
    </div>
  );
};

export default AppSidebar;

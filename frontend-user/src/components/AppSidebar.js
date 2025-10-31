import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from './Logo';
import './AppSidebar.css';

const AppSidebar = ({
  user,
  onLogout,
  children,
  collapsed,
  onToggleCollapse,
  // 历史记录相关 props
  showHistory = false,
  historyType = 'conversation', // 'conversation' 或 'search'
  historyItems = [],
  currentItemId = null,
  onSelectItem = null,
  onDeleteItem = null,
  onNewItem = null,
  historyLoading = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
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

  // 更新菜单位置 - 向上弹出
  const updateMenuPosition = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      // 菜单向上弹出，所以bottom应该是avatar的top位置
      setMenuPosition({
        bottom: window.innerHeight - rect.top + 8, // 距离底部的距离
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

  // 格式化时间
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  // 处理删除
  const handleDelete = (e, itemId) => {
    e.stopPropagation();
    if (!window.confirm(historyType === 'conversation' ? '确定删除这个对话吗?' : '确定删除这条搜索记录吗?')) return;

    if (onDeleteItem) {
      onDeleteItem(itemId);
    }
  };

  // 判断当前页面
  const isSearchPage = location.pathname === '/search-results';
  const isAdvancedSearchPage = location.pathname === '/advanced-search';

  return (
    <div className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 顶部Logo区域 */}
      <div className="app-sidebar-header">
        <div className="sidebar-header-top">
          <div
            className={`sidebar-logo ${collapsed ? 'collapsed-logo' : ''}`}
            onClick={handleLogoClick}
            onMouseEnter={() => collapsed && setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            style={{ cursor: 'pointer' }}
            title={collapsed ? '展开侧边栏' : '返回首页'}
          >
            {collapsed && logoHovered ? (
              // 收起状态且hover时显示展开图标
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
              </svg>
            ) : (
              // 默认显示Logo
              <Logo width={20} height={20} variant="color" />
            )}
          </div>

          {/* 收起按钮 - 展开状态显示 */}
          <button
            className={`sidebar-collapse-btn ${collapsed ? 'hidden' : ''}`}
            onClick={onToggleCollapse}
            title="收起侧边栏"
            style={{ pointerEvents: collapsed ? 'none' : 'auto' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* 功能导航 - 始终显示 */}
      <div className="sidebar-section navigation-section">
        <div className="navigation-items">
          <button
            className={`nav-item ${isSearchPage ? 'active' : ''}`}
            onClick={() => navigate('/search-results?query=')}
            title="普通搜索"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <circle cx="11.5" cy="14.5" r="2.5"/>
              <path d="m13.25 16.25 1.5 1.5"/>
            </svg>
            <span>普通搜索</span>
          </button>

          <button
            className={`nav-item ${isAdvancedSearchPage ? 'active' : ''}`}
            onClick={() => navigate('/advanced-search')}
            title="高级搜索"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
              <path d="M11 8l1.5 3 3 .5-2.5 2 .5 3-2.5-1.5L8.5 16.5l.5-3-2.5-2 3-.5z" fill="currentColor" strokeWidth="1"/>
            </svg>
            <span>高级搜索</span>
          </button>
        </div>
      </div>

      {/* 侧边栏内容区域 - 历史记录部分 */}
      {!collapsed && (
        <div className="app-sidebar-content">

          {/* 第二部分: 历史记录 (仅在搜索页面显示) */}
          {showHistory && (
            <>
              <div className="sidebar-divider"></div>
              <div className="sidebar-section history-section">
                <div className="section-header">
                  <div className="section-title">
                    {historyType === 'conversation' ? '对话历史' : '搜索历史'}
                  </div>
                  {onNewItem && (
                    <button
                      className="btn-new-item"
                      onClick={onNewItem}
                      title={historyType === 'conversation' ? '新建对话' : '新建搜索'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </button>
                  )}
                </div>

                <div className="history-list">
                  {historyLoading ? (
                    <div className="history-loading">加载中...</div>
                  ) : historyItems.length === 0 ? (
                    <div className="history-empty">
                      暂无{historyType === 'conversation' ? '对话' : '搜索'}记录
                    </div>
                  ) : (
                    historyItems.map((item) => (
                      <div
                        key={item.id}
                        className={`history-item ${currentItemId === item.id ? 'active' : ''}`}
                        onClick={() => onSelectItem && onSelectItem(item.id)}
                      >
                        <div className="history-item-content">
                          <div className="history-item-title">
                            {item.title || item.query || '未命名'}
                          </div>
                          {item.updated_at && (
                            <div className="history-item-time">
                              {formatDate(item.updated_at)}
                            </div>
                          )}
                        </div>
                        {onDeleteItem && (
                          <button
                            className="btn-delete-item"
                            onClick={(e) => handleDelete(e, item.id)}
                            title="删除"
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* 保留原有的children,以便向后兼容 */}
          {children}
        </div>
      )}

      {/* 底部用户信息区域 */}
      <div className="sidebar-user-section sidebar-footer">
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

      {/* 用户菜单弹窗 - 使用Portal渲染到body，向上弹出 */}
      {showUserMenu && ReactDOM.createPortal(
        <div
          ref={userMenuRef}
          className={`user-menu-popup ${collapsed ? 'collapsed-menu' : ''}`}
          style={{
            position: 'fixed',
            bottom: `${menuPosition.bottom}px`,
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

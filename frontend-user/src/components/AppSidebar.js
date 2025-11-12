import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { NormalSearchIcon, AdvancedSearchIcon } from './SearchIcons';
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
  onRenameItem = null, // 重命名回调
  onNewItem = null,
  historyLoading = false,
  disableActiveState = false // 是否禁用选中状态
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const userMenuRef = useRef(null);
  const avatarRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [subscription, setSubscription] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(true); // 历史记录展开状态
  const [hoveredItem, setHoveredItem] = useState(null); // 记录当前 hover 的项目
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [openHistoryMenuId, setOpenHistoryMenuId] = useState(null); // 记录哪个历史项的菜单是打开的
  const [historyMenuPosition, setHistoryMenuPosition] = useState({ top: 0, left: 0 });
  const [editingItemId, setEditingItemId] = useState(null); // 正在编辑的历史项ID
  const [editingValue, setEditingValue] = useState(''); // 编辑中的值
  const [originalValue, setOriginalValue] = useState(''); // 原始值，用于比较是否有变化
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 显示删除确认弹窗
  const [deleteTargetId, setDeleteTargetId] = useState(null); // 要删除的项ID
  const logoRef = useRef(null);
  const navItemRefs = useRef({});
  const hoverTimeoutRef = useRef(null); // 用于延迟清除 hoveredItem
  const historyMenuRef = useRef(null);
  const historyMenuButtonRefs = useRef({}); // 记录每个三点按钮的ref
  const editInputRef = useRef(null); // 编辑输入框的ref

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

    if (user) {
      fetchSubscription();
    }
  }, [user]);


  // 点击外部关闭用户菜单和历史项菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 关闭用户菜单
      if (showUserMenu &&
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }

      // 关闭历史项菜单
      if (openHistoryMenuId !== null &&
          historyMenuRef.current &&
          !historyMenuRef.current.contains(event.target) &&
          !Object.values(historyMenuButtonRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenHistoryMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu, openHistoryMenuId]);

  // 获取用户头像首字母
  const getUserInitial = () => {
    if (!user) return '?';
    // 优先使用用户名，如果没有则使用邮箱
    const displayName = user.username || user.email;
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
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

  // 更新tooltip位置
  const updateTooltipPosition = (refElement) => {
    if (refElement) {
      const rect = refElement.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12
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

  // 当进入编辑模式时，自动聚焦并选中输入框
  useEffect(() => {
    if (editingItemId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingItemId]);

  // Logo点击处理
  const handleLogoClick = () => {
    if (collapsed) {
      onToggleCollapse();
    } else {
      navigate('/');
    }
  };

  // 处理 hover 进入，立即设置 hoveredItem
  const handleMouseEnter = (item, refElement) => {
    // 清除任何待处理的 timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredItem(item);
    if (item === 'logo') {
      setLogoHovered(true);
    }
    if (refElement) {
      updateTooltipPosition(refElement);
    }
  };

  // 处理 hover 离开，延迟清除 hoveredItem
  const handleMouseLeave = () => {
    // 设置一个短暂的延迟（50ms），如果在此期间进入另一个项目，则取消清除
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setLogoHovered(false);
      hoverTimeoutRef.current = null;
    }, 50);
  };

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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

  // 打开历史项菜单
  const handleOpenHistoryMenu = (e, itemId) => {
    e.stopPropagation();
    const buttonRef = historyMenuButtonRefs.current[itemId];
    if (buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      setHistoryMenuPosition({
        top: rect.top,
        left: rect.left - 160 // 菜单宽度约160px，显示在按钮左侧
      });
      setOpenHistoryMenuId(itemId);
    }
  };

  // 处理菜单操作
  const handleHistoryMenuAction = (action, itemId) => {
    setOpenHistoryMenuId(null);

    switch (action) {
      case 'rename':
        // 进入重命名模式
        const item = historyItems.find(h => h.id === itemId);
        if (item) {
          const currentTitle = item.title || item.query || '未命名';
          setEditingItemId(itemId);
          setEditingValue(currentTitle);
          setOriginalValue(currentTitle);
        }
        break;
      case 'delete':
        // 显示自定义删除确认弹窗
        setDeleteTargetId(itemId);
        setShowDeleteConfirm(true);
        break;
      default:
        break;
    }
  };

  // 处理重命名提交
  const handleRenameSubmit = (itemId) => {
    const newTitle = editingValue.trim();

    // 只有当标题非空且与原始值不同时才提交
    if (newTitle && newTitle !== '' && newTitle !== originalValue) {
      // 调用重命名回调
      if (onRenameItem) {
        onRenameItem(itemId, newTitle);
      }
    }

    // 清除编辑状态
    setEditingItemId(null);
    setEditingValue('');
    setOriginalValue('');
  };

  // 处理重命名取消
  const handleRenameCancel = () => {
    setEditingItemId(null);
    setEditingValue('');
    setOriginalValue('');
  };

  // 确认删除
  const handleConfirmDelete = () => {
    if (deleteTargetId !== null && onDeleteItem) {
      onDeleteItem(deleteTargetId);
    }
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
  };

  // 取消删除
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
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
            ref={logoRef}
            className={`sidebar-logo ${collapsed ? 'collapsed-logo' : ''}`}
            onClick={handleLogoClick}
            onMouseEnter={() => {
              if (collapsed) {
                handleMouseEnter('logo', logoRef.current);
              }
            }}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: 'pointer' }}
          >
            {collapsed && hoveredItem ? (
              // 收起状态且hover任何项时显示展开图标
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
              </svg>
            ) : (
              // 始终显示18x18的icon.png,无论展开还是收起
              <img src="/logo.png" alt="Scholay" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
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
            ref={(el) => (navItemRefs.current['normal-search'] = el)}
            className={`nav-item ${isSearchPage ? 'active' : ''}`}
            onClick={() => navigate('/search-results?query=')}
            onMouseEnter={() => {
              if (collapsed) {
                handleMouseEnter('normal-search', navItemRefs.current['normal-search']);
              }
            }}
            onMouseLeave={handleMouseLeave}
          >
            <NormalSearchIcon size={20} />
            <span>普通搜索</span>
          </button>

          <button
            ref={(el) => (navItemRefs.current['advanced-search'] = el)}
            className={`nav-item ${isAdvancedSearchPage ? 'active' : ''}`}
            onClick={() => navigate('/advanced-search')}
            onMouseEnter={() => {
              if (collapsed) {
                handleMouseEnter('advanced-search', navItemRefs.current['advanced-search']);
              }
            }}
            onMouseLeave={handleMouseLeave}
          >
            <AdvancedSearchIcon size={20} />
            <span>高级搜索</span>
          </button>

          <button
            ref={(el) => (navItemRefs.current['chat'] = el)}
            className={`nav-item ${location.pathname === '/chat' ? 'active' : ''}`}
            onClick={() => navigate('/chat')}
            onMouseEnter={() => {
              if (collapsed) {
                handleMouseEnter('chat', navItemRefs.current['chat']);
              }
            }}
            onMouseLeave={handleMouseLeave}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>AI 对话</span>
          </button>
        </div>
      </div>

      {/* 侧边栏内容区域 - 历史记录部分 */}
      {!collapsed && (
        <div className="app-sidebar-content">

          {/* 第二部分: 历史记录 (仅在搜索页面显示) */}
          {showHistory && (
            <div className="sidebar-section history-section">
              {/* 可折叠的分区标题 */}
              <button
                className="history-toggle"
                onClick={() => setHistoryExpanded(!historyExpanded)}
              >
                <span className="history-title">记录</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`toggle-icon ${historyExpanded ? 'expanded' : ''}`}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* 历史记录列表 - 根据展开状态显示 */}
              {historyExpanded && (
                <div className="history-list">
                  {historyLoading ? (
                    <div className="history-loading">加载中...</div>
                  ) : historyItems.length > 0 ? (
                    historyItems.map((item) => (
                      <div
                        key={item.id}
                        className={`history-item ${!disableActiveState && currentItemId === item.id ? 'active' : ''} ${openHistoryMenuId === item.id ? 'menu-open' : ''}`}
                        onClick={() => onSelectItem && onSelectItem(item.id)}
                      >
                        <div className="history-item-main">
                          {editingItemId === item.id ? (
                            // 编辑模式：显示输入框
                            <input
                              ref={editInputRef}
                              type="text"
                              className="history-item-edit-input"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleRenameSubmit(item.id);
                                } else if (e.key === 'Escape') {
                                  handleRenameCancel();
                                }
                              }}
                              onBlur={() => handleRenameSubmit(item.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            // 正常模式：显示标题
                            <div className="history-item-title">
                              {item.title || item.query || '未命名'}
                            </div>
                          )}
                        </div>

                        {onDeleteItem && editingItemId !== item.id && (
                          <button
                            ref={(el) => (historyMenuButtonRefs.current[item.id] = el)}
                            className="btn-history-menu"
                            onClick={(e) => handleOpenHistoryMenu(e, item.id)}
                            title="更多操作"
                          >
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M15.498 8.50159C16.3254 8.50159 16.9959 9.17228 16.9961 9.99963C16.9961 10.8271 16.3256 11.4987 15.498 11.4987C14.6705 11.4987 14 10.8271 14 9.99963C14.0002 9.17228 14.6706 8.50159 15.498 8.50159Z"></path>
                              <path d="M4.49805 8.50159C5.32544 8.50159 5.99689 9.17228 5.99707 9.99963C5.99707 10.8271 5.32555 11.4987 4.49805 11.4987C3.67069 11.4985 3 10.827 3 9.99963C3.00018 9.17239 3.6708 8.50176 4.49805 8.50159Z"></path>
                              <path d="M10.0003 8.50159C10.8276 8.50176 11.4982 9.17239 11.4984 9.99963C11.4984 10.827 10.8277 11.4985 10.0003 11.4987C9.17283 11.4987 8.50131 10.8271 8.50131 9.99963C8.50149 9.17228 9.17294 8.50159 10.0003 8.50159Z"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  ) : null}
                </div>
              )}
            </div>
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
          onMouseEnter={() => {
            if (collapsed) {
              handleMouseEnter('user', avatarRef.current);
            }
          }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="user-avatar">
            {getUserInitial()}
          </div>
          {!collapsed && (
            <div className="user-email-wrapper">
              <span className="user-email">{user?.username || user?.email?.split('@')[0] || '未登录'}</span>
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
              <div className={`user-menu-header ${subscription && subscription.plan_code === 'pro' ? 'premium-pro' : ''} ${subscription && subscription.plan_code === 'max' ? 'premium-max' : ''}`}>
                <div className="user-avatar-large">
                  {getUserInitial()}
                </div>
                <div className="user-info-text">
                  <div className="user-name">{user?.username || user?.email?.split('@')[0] || '用户'}</div>
                  <div className="user-email-small">{user?.email}</div>
                  {subscription && (
                    <div className="user-subscription-badge">
                      <span className={`subscription-plan-badge ${subscription.plan_code}`}>
                        {subscription.plan_name}
                      </span>
                    </div>
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
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
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

                <button
                  className="user-menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/settings?tab=account');
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  <span>账户管理</span>
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

      {/* Tooltip Portal - 渲染到body，确保在最上层 */}
      {collapsed && hoveredItem && ReactDOM.createPortal(
        <div
          className="sidebar-tooltip-portal"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateY(-50%)',
            background: '#000000',
            color: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 99999,
            boxShadow: 'none',
            animation: 'tooltipFadeIn 0.15s ease',
            border: 'none'
          }}
        >
          {hoveredItem === 'logo' && '展开侧边栏'}
          {hoveredItem === 'normal-search' && '普通搜索'}
          {hoveredItem === 'advanced-search' && '高级搜索'}
          {hoveredItem === 'chat' && 'AI 对话'}
          {hoveredItem === 'user' && (user?.username || user?.email?.split('@')[0] || '用户')}
        </div>,
        document.body
      )}

      {/* 历史记录菜单弹窗 - 使用Portal渲染到body */}
      {openHistoryMenuId !== null && ReactDOM.createPortal(
        <div
          ref={historyMenuRef}
          className="history-menu-popup"
          style={{
            position: 'fixed',
            top: `${historyMenuPosition.top}px`,
            left: `${historyMenuPosition.left}px`,
            zIndex: 10000
          }}
        >
          <button
            className="history-menu-item"
            onClick={() => handleHistoryMenuAction('rename', openHistoryMenuId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            <span>重命名</span>
          </button>

          <div className="history-menu-divider"></div>

          <button
            className="history-menu-item delete-item"
            onClick={() => handleHistoryMenuAction('delete', openHistoryMenuId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>删除</span>
          </button>
        </div>,
        document.body
      )}

      {/* 自定义删除确认弹窗 */}
      {showDeleteConfirm && ReactDOM.createPortal(
        <div className="delete-confirm-overlay" onClick={handleCancelDelete}>
          <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="delete-confirm-title">
              {historyType === 'conversation' ? '删除对话' : '删除搜索记录'}
            </h3>
            <p className="delete-confirm-message">
              {historyType === 'conversation'
                ? '确定要删除这个对话吗？此操作将永久删除该对话及其所有消息，无法恢复。'
                : '确定要删除这条搜索记录吗？此操作将永久删除该记录，无法恢复。'}
            </p>
            <div className="delete-confirm-actions">
              <button className="btn-cancel" onClick={handleCancelDelete}>
                取消
              </button>
              <button className="btn-confirm-delete" onClick={handleConfirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppSidebar;

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * DrawerSidebar - 悬浮抽屉式侧边栏
 * 默认隐藏，通过顶部菜单按钮点击后从左侧滑出
 * 点击遮罩层或导航项后自动关闭
 */

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { NormalSearchIcon } from './SearchIcons';
import Logo from './Logo';
import { X } from 'lucide-react';
import './styles/DrawerSidebar.css';

const DrawerSidebar = ({
  isOpen,
  onClose,
  // 历史记录相关 props
  showHistory = false,
  historyType = 'conversation',
  historyItems = [],
  currentItemId = null,
  onSelectItem = null,
  onDeleteItem = null,
  onRenameItem = null,
  historyLoading = false,
  disableActiveState = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [openHistoryMenuId, setOpenHistoryMenuId] = useState(null);
  const [historyMenuPosition, setHistoryMenuPosition] = useState({ top: 0, left: 0 });
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const historyMenuRef = useRef(null);
  const historyMenuButtonRefs = useRef({});
  const editInputRef = useRef(null);
  const sidebarRef = useRef(null);

  // 点击外部关闭历史项菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openHistoryMenuId !== null &&
          historyMenuRef.current &&
          !historyMenuRef.current.contains(event.target) &&
          !Object.values(historyMenuButtonRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenHistoryMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openHistoryMenuId]);

  // 当进入编辑模式时，自动聚焦并选中输入框
  useEffect(() => {
    if (editingItemId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingItemId]);

  // 打开时禁止body滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // 判断当前页面
  const isSearchPage = location.pathname === '/' || location.pathname === '/search-results';
  const isAssistantPage = location.pathname === '/assistant' || location.pathname === '/chat' || location.pathname === '/peer-review';

  // 处理导航点击并关闭侧边栏
  const handleNavClick = (path) => {
    navigate(path);
    onClose();
  };

  // 处理历史项点击并关闭侧边栏
  const handleHistoryItemClick = (itemId) => {
    if (onSelectItem) {
      onSelectItem(itemId);
    }
    onClose();
  };

  // 打开历史项菜单
  const handleOpenHistoryMenu = (e, itemId) => {
    e.stopPropagation();
    const buttonRef = historyMenuButtonRefs.current[itemId];
    if (buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      setHistoryMenuPosition({
        top: rect.top,
        left: rect.right + 8
      });
      setOpenHistoryMenuId(itemId);
    }
  };

  // 处理菜单操作
  const handleHistoryMenuAction = (action, itemId) => {
    setOpenHistoryMenuId(null);

    switch (action) {
      case 'rename':
        const item = historyItems.find(h => h.id === itemId);
        if (item) {
          const currentTitle = item.title || item.query || '未命名';
          setEditingItemId(itemId);
          setEditingValue(currentTitle);
          setOriginalValue(currentTitle);
        }
        break;
      case 'delete':
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
    if (newTitle && newTitle !== '' && newTitle !== originalValue) {
      if (onRenameItem) {
        onRenameItem(itemId, newTitle);
      }
    }
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

  // 如果不打开，不渲染
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
      {/* 遮罩层 */}
      <div 
        className="drawer-overlay"
        onClick={onClose}
      />

      {/* 侧边栏主体 */}
      <div 
        ref={sidebarRef}
        className="drawer-sidebar"
      >
        {/* 顶部区域 */}
        <div className="drawer-header">
          <div className="drawer-logo" onClick={() => handleNavClick('/')}>
            <Logo size={24} />
            <span>Scholay</span>
          </div>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="关闭菜单"
          >
            <X size={22} />
          </button>
        </div>

        {/* 导航区域 */}
        <div className="drawer-nav-section">
          <div className="drawer-nav-items">
            <button
              className={`drawer-nav-item ${isSearchPage ? 'active' : ''}`}
              onClick={() => handleNavClick('/')}
            >
              <NormalSearchIcon size={20} />
              <span>学术搜索</span>
            </button>

            <button
              className={`drawer-nav-item ${isAssistantPage ? 'active' : ''}`}
              onClick={() => handleNavClick('/assistant')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>精品AI工具</span>
            </button>
          </div>
        </div>

        {/* 历史记录区域 */}
        {showHistory && (
          <div className="drawer-history-section">
            <button
              className="drawer-history-toggle"
              onClick={() => setHistoryExpanded(!historyExpanded)}
            >
              <span className="drawer-history-title">记录</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={`drawer-toggle-icon ${historyExpanded ? 'expanded' : ''}`}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {historyExpanded && (
              <div className="drawer-history-list">
                {historyLoading ? (
                  <div className="drawer-history-loading">加载中...</div>
                ) : historyItems.length > 0 ? (
                  historyItems.map((item) => (
                    <div
                      key={item.id}
                      className={`drawer-history-item ${!disableActiveState && currentItemId === item.id ? 'active' : ''} ${openHistoryMenuId === item.id ? 'menu-open' : ''}`}
                      onClick={() => handleHistoryItemClick(item.id)}
                    >
                      <div className="drawer-history-item-main">
                        {editingItemId === item.id ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="drawer-history-edit-input"
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
                          <div className="drawer-history-item-title">
                            {item.title || item.query || '未命名'}
                          </div>
                        )}
                      </div>

                      {onDeleteItem && editingItemId !== item.id && (
                        <button
                          ref={(el) => (historyMenuButtonRefs.current[item.id] = el)}
                          className="drawer-history-menu-btn"
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
                ) : (
                  <div className="drawer-history-empty">暂无记录</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 历史记录菜单弹窗 */}
      {openHistoryMenuId !== null && (
        <div
          ref={historyMenuRef}
          className="drawer-history-menu-popup"
          style={{
            position: 'fixed',
            top: `${historyMenuPosition.top}px`,
            left: `${historyMenuPosition.left}px`,
            zIndex: 10002
          }}
        >
          <button
            className="drawer-menu-item"
            onClick={() => handleHistoryMenuAction('rename', openHistoryMenuId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            <span>重命名</span>
          </button>
          <div className="drawer-menu-divider"></div>
          <button
            className="drawer-menu-item delete-item"
            onClick={() => handleHistoryMenuAction('delete', openHistoryMenuId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>删除</span>
          </button>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="drawer-delete-overlay" onClick={handleCancelDelete}>
          <div className="drawer-delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-delete-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="drawer-delete-title">
              {historyType === 'conversation' ? '删除对话' : '删除搜索记录'}
            </h3>
            <p className="drawer-delete-message">
              {historyType === 'conversation'
                ? '确定要删除这个对话吗？此操作将永久删除该对话及其所有消息，无法恢复。'
                : '确定要删除这条搜索记录吗？此操作将永久删除该记录，无法恢复。'}
            </p>
            <div className="drawer-delete-actions">
              <button className="drawer-btn-cancel" onClick={handleCancelDelete}>
                取消
              </button>
              <button className="drawer-btn-confirm" onClick={handleConfirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

export default DrawerSidebar;

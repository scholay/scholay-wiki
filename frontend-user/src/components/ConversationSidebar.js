/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import { conversationAPI } from '../services/api';
import './ConversationSidebar.css';

const ConversationSidebar = ({ currentConversationId, onSelectConversation, onNewConversation, collapsed, onToggleSidebar, onLogout }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  // Refresh when currentConversationId changes
  useEffect(() => {
    if (currentConversationId) {
      loadConversations();
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const response = await conversationAPI.getConversations(1, 50);
      if (response.data.code === 0 && response.data.data) {
        setConversations(response.data.data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, conversationId) => {
    e.stopPropagation();
    if (!window.confirm('确定删除这个对话吗？')) return;

    try {
      await conversationAPI.deleteConversation(conversationId);
      setConversations(conversations.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('删除失败');
    }
  };

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

  return (
    <div className={`conversation-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-top">
        {collapsed ? (
          <button className="icon-btn logo-btn" onClick={onToggleSidebar} title="展开侧边栏">
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="logo-gradient-sidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
              <path d="M24 10L34 20H29V34H19V20H14L24 10Z" fill="url(#logo-gradient-sidebar)"/>
              <rect x="14" y="36" width="20" height="2" rx="1" fill="url(#logo-gradient-sidebar)"/>
            </svg>
          </button>
        ) : (
          <div className="sidebar-header">
            <button className="logo logo-clickable" onClick={onToggleSidebar} title="收起侧边栏">
              <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id="logo-gradient-full" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="24" fill="url(#logo-gradient-full)" opacity="0.2"/>
                <path d="M24 10L34 20H29V34H19V20H14L24 10Z" fill="url(#logo-gradient-full)"/>
                <rect x="14" y="36" width="20" height="2" rx="1" fill="url(#logo-gradient-full)"/>
              </svg>
              <span className="logo-text">Scholar</span>
            </button>
          </div>
        )}

        <button
          className={`btn-new-chat ${collapsed ? 'icon-only' : ''}`}
          onClick={onNewConversation}
          title="新建对话"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          {!collapsed && <span>新建对话</span>}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="conversation-list">
            {loading ? (
              <div className="loading">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="empty-state">
                <p>暂无对话</p>
                <p className="hint">点击右上角 + 开始新对话</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-item ${currentConversationId === conversation.id ? 'active' : ''}`}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <div className="conversation-content">
                    <div className="conversation-title">{conversation.title}</div>
                    <div className="conversation-time">{formatDate(conversation.updated_at)}</div>
                  </div>
                  <button
                    className="btn-delete"
                    onClick={(e) => handleDelete(e, conversation.id)}
                    title="删除对话"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar-small">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="User" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="user-details">
                <div className="user-email-small">{user?.email || 'User'}</div>
              </div>
              <button className="btn-logout-small" onClick={onLogout} title="退出登录">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {collapsed && (
        <div className="sidebar-footer-collapsed">
          <button className="icon-btn user-icon-btn" title={user?.email || 'User'}>
            <div className="user-avatar-small">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="User" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default ConversationSidebar;

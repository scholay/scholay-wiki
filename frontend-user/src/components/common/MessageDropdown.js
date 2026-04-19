/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * MessageDropdown - 站内信组件
 * 
 * 功能：
 * 1. 菜单入口（显示未读数量）
 * 2. 点击打开独立的消息弹窗
 * 3. 消息列表、分类筛选、已读/未读
 * 4. 消息详情查看
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import DOMPurify from 'dompurify';
import { Bell, X, Mail, Gift, CreditCard, ExternalLink, Inbox, ChevronRight, Check } from 'lucide-react';
import { messageAPI } from '../services/payment.api';
import logger from '../utils/logger';
import './MessageDropdown.css';

// 格式化时间
const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

// 获取分类图标
const getCategoryIcon = (category, size = 16) => {
  switch (category) {
    case 'system': return <Bell size={size} />;
    case 'promotion': return <Gift size={size} />;
    case 'transaction': return <CreditCard size={size} />;
    default: return <Mail size={size} />;
  }
};

// 获取分类名称
const getCategoryName = (category) => {
  switch (category) {
    case 'system': return '系统通知';
    case 'promotion': return '活动推广';
    case 'transaction': return '交易通知';
    default: return '消息';
  }
};

// 消息详情弹窗
const MessageDetailModal = ({ message, onClose, onBack }) => {
  if (!message) return null;

  const renderContent = (content) => {
    if (!content) return null;
    let html = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.split('\n').map((line, i) => 
      `<p key="${i}">${line || '&nbsp;'}</p>`
    ).join('');
    return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
  };

  return (
    <div className="msg-detail-view">
      <div className="msg-detail-header">
        <button className="msg-back-btn" onClick={onBack}>
          <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          <span>返回</span>
        </button>
        <button className="msg-close-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="msg-detail-content">
        <div className="msg-detail-title">{message.title}</div>
        <div className="msg-detail-meta">
          <span className={`msg-category-tag ${message.category}`}>
            {getCategoryIcon(message.category, 14)}
            {getCategoryName(message.category)}
          </span>
          <span className="msg-detail-time">
            {message.send_at ? new Date(message.send_at).toLocaleString('zh-CN') : ''}
          </span>
        </div>
        <div className="msg-detail-body">
          {renderContent(message.content)}
        </div>
        {message.link_url && (
          <a 
            href={message.link_url} 
            target="_blank" 
            rel="noopener"
            className="msg-detail-link"
          >
            {message.link_text || '查看详情'}
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
};

// 消息列表弹窗（大弹窗）
const MessageListModal = ({ isOpen, onClose, onUnreadCountChange }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [filter, setFilter] = useState('all'); // all, unread
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const pageSize = 20;

  // 加载消息
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, pageSize };
      if (filter === 'unread') params.isRead = false;
      const response = await messageAPI.getMessages(params);
      if (response.data.code === 0) {
        setMessages(response.data.data.list || []);
        setTotal(response.data.data.total || 0);
      }
    } catch (error) {
      logger.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    if (isOpen) {
      loadMessages();
    }
  }, [isOpen, loadMessages]);

  // 标记全部已读
  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      const response = await messageAPI.markAllAsRead();
      if (response.data.code === 0) {
        setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
        if (onUnreadCountChange) onUnreadCountChange(0);
      }
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  // 点击消息
  const handleMessageClick = async (message) => {
    if (!message.is_read) {
      try {
        await messageAPI.markAsRead(message.id);
        setMessages(prev => prev.map(m => 
          m.id === message.id ? { ...m, is_read: true } : m
        ));
        if (onUnreadCountChange) onUnreadCountChange(prev => Math.max(0, prev - 1));
      } catch (error) {
        logger.error('Failed to mark as read:', error);
      }
    }
    setSelectedMessage(message);
  };

  // 删除消息
  const handleDeleteMessage = async (e, messageId) => {
    e.stopPropagation();
    try {
      await messageAPI.deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setTotal(prev => prev - 1);
    } catch (error) {
      logger.error('Failed to delete message:', error);
    }
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="msg-modal-overlay">
      <div className="msg-modal">
        {selectedMessage ? (
          <MessageDetailModal 
            message={selectedMessage} 
            onClose={onClose}
            onBack={() => setSelectedMessage(null)}
          />
        ) : (
          <>
            {/* 头部 */}
            <div className="msg-modal-header">
              <h2>
                <Bell size={22} />
                消息中心
              </h2>
              <button className="msg-close-btn" onClick={onClose}>
                <X size={22} />
              </button>
            </div>

            {/* 工具栏 */}
            <div className="msg-toolbar">
              <div className="msg-filters">
                <button 
                  className={`msg-filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => { setFilter('all'); setPage(1); }}
                >
                  全部消息
                </button>
                <button 
                  className={`msg-filter-btn ${filter === 'unread' ? 'active' : ''}`}
                  onClick={() => { setFilter('unread'); setPage(1); }}
                >
                  未读消息
                </button>
              </div>
              {unreadCount > 0 && (
                <button 
                  className="msg-mark-all-btn"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                >
                  <Check size={16} />
                  {markingAll ? '处理中...' : '全部已读'}
                </button>
              )}
            </div>

            {/* 消息列表 */}
            <div className="msg-list-container">
              {loading ? (
                <div className="msg-loading">
                  <div className="msg-spinner"></div>
                  <p>加载中...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="msg-empty">
                  <Inbox size={48} />
                  <p>{filter === 'unread' ? '没有未读消息' : '暂无消息'}</p>
                </div>
              ) : (
                <div className="msg-list">
                  {messages.map(message => (
                    <div 
                      key={message.id}
                      className={`msg-item ${!message.is_read ? 'unread' : ''}`}
                      onClick={() => handleMessageClick(message)}
                    >
                      <div className={`msg-icon ${message.category}`}>
                        {getCategoryIcon(message.category, 20)}
                      </div>
                      <div className="msg-content">
                        <div className="msg-item-header">
                          <span className="msg-title">{message.title}</span>
                          <span className="msg-time">{formatTime(message.send_at)}</span>
                        </div>
                        <div className="msg-preview">
                          {message.content?.replace(/\*\*/g, '').substring(0, 80)}
                          {message.content?.length > 80 ? '...' : ''}
                        </div>
                      </div>
                      {!message.is_read && <div className="msg-unread-dot"></div>}
                      <button 
                        className="msg-delete-btn"
                        onClick={(e) => handleDeleteMessage(e, message.id)}
                        title="删除"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 分页 */}
            {total > pageSize && (
              <div className="msg-pagination">
                <span className="msg-page-info">共 {total} 条消息</span>
                <div className="msg-page-btns">
                  <button 
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    上一页
                  </button>
                  <span className="msg-page-num">第 {page} 页</span>
                  <button 
                    disabled={page * pageSize >= total}
                    onClick={() => setPage(p => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

// 菜单入口组件（在头像弹窗中使用）
const MessageMenuEntry = ({ unreadCount, onClick }) => {
  return (
    <div className="um-message-entry" onClick={onClick}>
      <div className="um-message-entry-left">
        <Bell size={16} />
        <span>消息通知</span>
        {unreadCount > 0 && (
          <span className="um-entry-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </div>
      <ChevronRight size={18} className="um-message-entry-arrow" />
    </div>
  );
};

// 主组件
const MessageDropdown = ({ onUnreadCountChange, unreadCount = 0 }) => {
  const [showModal, setShowModal] = useState(false);

  const handleOpenModal = () => {
    setShowModal(true);
  };

  return (
    <>
      <MessageMenuEntry 
        unreadCount={unreadCount}
        onClick={handleOpenModal}
      />
      <MessageListModal 
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUnreadCountChange={onUnreadCountChange}
      />
    </>
  );
};

// 导出未读数量 hook
export const useUnreadCount = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await messageAPI.getUnreadCount();
      if (response.data.code === 0) {
        setUnreadCount(response.data.data.count || 0);
      }
    } catch (error) {
      logger.error('Failed to fetch unread count:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return { unreadCount, setUnreadCount, loading, refresh: fetchUnreadCount };
};

export default MessageDropdown;

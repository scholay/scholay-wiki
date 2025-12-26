/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * NotificationToast - 站内信到达通知组件
 * 
 * 功能：
 * 1. 右上角显示站内信到达通知
 * 2. 显示标题和简要内容
 * 3. 点击打开消息列表
 * 4. 8秒自动关闭
 */

import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Bell, X, Gift, CreditCard, Mail } from 'lucide-react';
import wsClient from '../services/websocket';
import './NotificationToast.css';

// 通知配置
const NOTIFICATION_CONFIG = {
  AUTO_CLOSE_DELAY: 8000,  // 自动关闭延迟 8秒
  MAX_NOTIFICATIONS: 5,    // 最多同时显示 5 条
};

// 获取分类图标
const getCategoryIcon = (category) => {
  switch (category) {
    case 'system': return <Bell size={20} />;
    case 'promotion': return <Gift size={20} />;
    case 'transaction': return <CreditCard size={20} />;
    default: return <Mail size={20} />;
  }
};

// 获取分类名称
const getCategoryName = (category) => {
  switch (category) {
    case 'system': return '系统通知';
    case 'promotion': return '活动推广';
    case 'transaction': return '交易通知';
    default: return '新消息';
  }
};

// 单个通知项
const NotificationItem = ({ notification, onClose, onClick }) => {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, NOTIFICATION_CONFIG.AUTO_CLOSE_DELAY);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose(notification.id);
    }, 300);
  }, [notification.id, onClose]);

  const handleClick = useCallback(() => {
    handleClose();
    onClick(notification);
  }, [notification, onClick, handleClose]);

  // 截取内容预览
  const contentPreview = notification.content
    ?.replace(/\*\*/g, '')
    .substring(0, 60);

  return (
    <div 
      className={`notification-toast-item ${isClosing ? 'closing' : ''}`}
      onClick={handleClick}
    >
      <div className={`notification-toast-icon ${notification.category || 'system'}`}>
        {getCategoryIcon(notification.category)}
      </div>
      <div className="notification-toast-content">
        <div className="notification-toast-header">
          <span className="notification-toast-category">
            {getCategoryName(notification.category)}
          </span>
          <button 
            className="notification-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="notification-toast-title">{notification.title}</div>
        {contentPreview && (
          <div className="notification-toast-preview">
            {contentPreview}{notification.content?.length > 60 ? '...' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

// 通知容器
const NotificationToastContainer = ({ onOpenMessageList }) => {
  const [notifications, setNotifications] = useState([]);

  // 添加通知
  const addNotification = useCallback((data) => {
    const notification = {
      id: data.id || Date.now(),
      title: data.title,
      content: data.content,
      category: data.category,
      createdAt: data.created_at || new Date().toISOString(),
    };

    setNotifications(prev => {
      // 检查是否已存在相同 ID 的通知
      if (prev.some(n => n.id === notification.id)) {
        return prev;
      }
      // 限制最大数量
      const newList = [notification, ...prev];
      if (newList.length > NOTIFICATION_CONFIG.MAX_NOTIFICATIONS) {
        return newList.slice(0, NOTIFICATION_CONFIG.MAX_NOTIFICATIONS);
      }
      return newList;
    });
  }, []);

  // 移除通知
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 点击通知
  const handleClick = useCallback((notification) => {
    if (onOpenMessageList) {
      onOpenMessageList(notification);
    }
  }, [onOpenMessageList]);

  // 监听 WebSocket 通知
  useEffect(() => {
    const unsubscribe = wsClient.on('notification', addNotification);
    return unsubscribe;
  }, [addNotification]);

  if (notifications.length === 0) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="notification-toast-container">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={removeNotification}
          onClick={handleClick}
        />
      ))}
    </div>,
    document.body
  );
};

export default NotificationToastContainer;


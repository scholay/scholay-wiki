/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ToastProvider - 统一提示系统
 * 
 * 包含两种提示：
 * 1. Toast - 轻提示（顶部中间，5秒自动关闭，可手动关闭）
 * 2. Confirm - 强制确认弹窗（屏幕中间，必须点击确认/取消）
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Info, AlertTriangle, XCircle, CheckCircle, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Toast 单个项组件
const ToastItem = ({ id, message, type, duration, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose(id);
    }, 300);
  }, [id, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'warning':
        return <AlertTriangle size={20} />;
      case 'error':
        return <XCircle size={20} />;
      case 'info':
      default:
        return <Info size={20} />;
    }
  };

  return (
    <div className={`toast toast-${type} ${isClosing ? 'toast-closing' : ''}`}>
      <div className="toast-icon">
        {getIcon()}
      </div>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={handleClose}>
        <X size={16} />
      </button>
    </div>
  );
};

// 确认弹窗组件
const ConfirmDialog = ({ type, title, message, confirmText, cancelText, showCancel, onConfirm, onCancel }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback((callback) => {
    setIsClosing(true);
    setTimeout(() => {
      if (callback) callback();
    }, 200);
  }, []);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={28} />;
      case 'warning':
        return <AlertTriangle size={28} />;
      case 'error':
        return <XCircle size={28} />;
      case 'info':
      default:
        return <Info size={28} />;
    }
  };

  return ReactDOM.createPortal(
    <div className={`confirm-overlay ${isClosing ? 'closing' : ''}`}>
      <div className={`confirm-modal confirm-${type} ${isClosing ? 'closing' : ''}`}>
        <div className={`confirm-icon confirm-icon-${type}`}>
          {getIcon()}
        </div>
        {title && <h3 className="confirm-title">{title}</h3>}
        <p className="confirm-message">{message}</p>
        <div className="confirm-buttons">
          {showCancel && (
            <button className="confirm-btn confirm-btn-cancel" onClick={() => handleClose(onCancel)}>
              {cancelText}
            </button>
          )}
          <button className={`confirm-btn confirm-btn-primary confirm-btn-${type}`} onClick={() => handleClose(onConfirm)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Toast 方法
  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration = 5000) => {
    return showToast(message, 'success', duration);
  }, [showToast]);

  const showError = useCallback((message, duration = 5000) => {
    return showToast(message, 'error', duration);
  }, [showToast]);

  const showWarning = useCallback((message, duration = 5000) => {
    return showToast(message, 'warning', duration);
  }, [showToast]);

  const showInfo = useCallback((message, duration = 5000) => {
    return showToast(message, 'info', duration);
  }, [showToast]);

  // 确认弹窗方法
  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        type: options.type || 'info',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        showCancel: options.showCancel !== false,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  }, []);

  // 快捷确认方法
  const confirm = {
    show: showConfirm,
    info: (message, options = {}) => showConfirm({ type: 'info', message, ...options }),
    warning: (message, options = {}) => showConfirm({ type: 'warning', message, ...options }),
    error: (message, options = {}) => showConfirm({ type: 'error', message, ...options }),
    success: (message, options = {}) => showConfirm({ type: 'success', message, ...options }),
    delete: (message = '确定要删除吗？此操作不可撤销。') => showConfirm({
      type: 'warning',
      title: '删除确认',
      message,
      confirmText: '删除',
      cancelText: '取消',
    }),
  };

  return (
    <ToastContext.Provider
      value={{
        // Toast 方法
        showToast,
        hideToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        // 确认弹窗
        confirm,
      }}
    >
      {children}
      {/* Toast 容器 - 顶部中间 */}
      {ReactDOM.createPortal(
        <div className="toast-container">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onClose={hideToast}
            />
          ))}
        </div>,
        document.body
      )}
      {/* 确认弹窗 */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </ToastContext.Provider>
  );
};

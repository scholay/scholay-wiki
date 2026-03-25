/**
 * ToastProvider - 统一提示系统（基于 antd）
 * 
 * 保持原有 API 不变，底层使用 antd message / Modal.confirm
 */

import React, { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import { App } from 'antd';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const { message, modal } = App.useApp();

  useEffect(() => {
    const handler = (e) => {
      const { message: msg, type = 'error' } = e.detail || {};
      if (!msg) return;
      switch (type) {
        case 'success': message.success(msg); break;
        case 'warning': message.warning(msg); break;
        case 'info':    message.info(msg);    break;
        default:        message.error(msg);   break;
      }
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, [message]);

  const showToast = useCallback((msg, type = 'info', duration = 5) => {
    const sec = duration > 100 ? duration / 1000 : duration;
    switch (type) {
      case 'success': message.success(msg, sec); break;
      case 'error': message.error(msg, sec); break;
      case 'warning': message.warning(msg, sec); break;
      default: message.info(msg, sec); break;
    }
  }, [message]);

  const hideToast = useCallback(() => {
    message.destroy();
  }, [message]);

  const showSuccess = useCallback((msg, duration = 5) => {
    message.success(msg, duration > 100 ? duration / 1000 : duration);
  }, [message]);

  const showError = useCallback((msg, duration = 5) => {
    message.error(msg, duration > 100 ? duration / 1000 : duration);
  }, [message]);

  const showWarning = useCallback((msg, duration = 5) => {
    message.warning(msg, duration > 100 ? duration / 1000 : duration);
  }, [message]);

  const showInfo = useCallback((msg, duration = 5) => {
    message.info(msg, duration > 100 ? duration / 1000 : duration);
  }, [message]);

  const confirm = useMemo(() => ({
    show: (options) => new Promise((resolve) => {
      modal.confirm({
        title: options.title,
        content: options.message,
        okText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        okButtonProps: options.type === 'error' || options.type === 'warning'
          ? { danger: true } : {},
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    }),
    info: (msg, options = {}) => new Promise((resolve) => {
      modal.info({ content: msg, ...options, onOk: () => resolve(true), onCancel: () => resolve(false) });
    }),
    warning: (msg, options = {}) => new Promise((resolve) => {
      modal.warning({ content: msg, ...options, onOk: () => resolve(true), onCancel: () => resolve(false) });
    }),
    error: (msg, options = {}) => new Promise((resolve) => {
      modal.error({ content: msg, ...options, onOk: () => resolve(true), onCancel: () => resolve(false) });
    }),
    success: (msg, options = {}) => new Promise((resolve) => {
      modal.success({ content: msg, ...options, onOk: () => resolve(true), onCancel: () => resolve(false) });
    }),
    delete: (msg = '确定要删除吗？此操作不可撤销。') => new Promise((resolve) => {
      modal.confirm({
        title: '删除确认',
        content: msg,
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    }),
  }), [modal]);

  const value = useMemo(() => ({
    showToast,
    hideToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirm,
  }), [showToast, hideToast, showSuccess, showError, showWarning, showInfo, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};

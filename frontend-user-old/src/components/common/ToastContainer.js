/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * Toast & Confirm rendering – pure Zustand, no React Context.
 *
 * ToastRenderer – renders toast list + confirm dialog via portal.
 *                 Place as a sibling anywhere in the tree (not a Provider).
 * useToast()    – thin hook backed by Zustand store actions.
 */

import React, { useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Info, AlertTriangle, XCircle, CheckCircle, X } from 'lucide-react';
import { useToastStore, confirm } from '../../stores/toast.store';
import './Toast.css';

// ---------------------------------------------------------------------------
// useToast – drop-in replacement for the old Context-based hook.
// ---------------------------------------------------------------------------
export const useToast = () => {
  const showToast = useToastStore((s) => s.showToast);
  const showSuccess = useToastStore((s) => s.showSuccess);
  const showError = useToastStore((s) => s.showError);
  const showWarning = useToastStore((s) => s.showWarning);
  const showInfo = useToastStore((s) => s.showInfo);
  const removeToast = useToastStore((s) => s.removeToast);

  return useMemo(
    () => ({
      showToast,
      hideToast: removeToast,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      confirm,
    }),
    [showToast, removeToast, showSuccess, showError, showWarning, showInfo],
  );
};

// ---------------------------------------------------------------------------
// Internal components
// ---------------------------------------------------------------------------
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

const ConfirmDialog = ({ type, title, message, confirmText, cancelText, showCancel }) => {
  const [isClosing, setIsClosing] = useState(false);
  const resolveConfirm = useToastStore((s) => s.resolveConfirm);

  const handleClose = useCallback((result) => {
    setIsClosing(true);
    setTimeout(() => {
      resolveConfirm(result);
    }, 200);
  }, [resolveConfirm]);

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
            <button className="confirm-btn confirm-btn-cancel" onClick={() => handleClose(false)}>
              {cancelText}
            </button>
          )}
          <button className={`confirm-btn confirm-btn-primary confirm-btn-${type}`} onClick={() => handleClose(true)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ---------------------------------------------------------------------------
// ToastRenderer – renders toast list + confirm dialog. Not a Provider.
// ---------------------------------------------------------------------------
export const ToastRenderer = () => {
  const toasts = useToastStore((s) => s.toasts);
  const confirmDialog = useToastStore((s) => s.confirmDialog);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <>
      {ReactDOM.createPortal(
        <div className="toast-container">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onClose={removeToast}
            />
          ))}
        </div>,
        document.body,
      )}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  );
};


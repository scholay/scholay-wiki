import React from 'react';
import './MessageModal.css';

/**
 * 通用消息弹窗组件
 * @param {boolean} isOpen - 是否显示
 * @param {function} onClose - 关闭回调
 * @param {string} type - 类型: 'info' | 'success' | 'warning' | 'error' | 'confirm'
 * @param {string} title - 标题
 * @param {string} message - 消息内容
 * @param {function} onConfirm - 确认回调（仅 confirm 类型）
 * @param {string} confirmText - 确认按钮文字
 * @param {string} cancelText - 取消按钮文字
 */
const MessageModal = ({ 
  isOpen, 
  onClose, 
  type = 'info', 
  title, 
  message, 
  onConfirm,
  confirmText = '确定',
  cancelText = '取消'
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        );
      case 'warning':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
      case 'error':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      case 'confirm':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
      default: // info
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        );
    }
  };

  return (
    <div className="msg-modal-overlay" onClick={onClose}>
      <div className={`msg-modal-container msg-modal-${type}`} onClick={(e) => e.stopPropagation()}>
        <button className="msg-modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        
        <div className="msg-modal-content">
          <div className={`msg-modal-icon msg-modal-icon-${type}`}>
            {getIcon()}
          </div>

          {title && <h2 className="msg-modal-title">{title}</h2>}
          {message && <p className="msg-modal-message">{message}</p>}

          <div className="msg-modal-actions">
            {type === 'confirm' ? (
              <>
                <button className="msg-modal-btn msg-modal-btn-secondary" onClick={onClose}>
                  {cancelText}
                </button>
                <button className="msg-modal-btn msg-modal-btn-primary" onClick={handleConfirm}>
                  {confirmText}
                </button>
              </>
            ) : (
              <button className="msg-modal-btn msg-modal-btn-primary" onClick={onClose}>
                {confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageModal;


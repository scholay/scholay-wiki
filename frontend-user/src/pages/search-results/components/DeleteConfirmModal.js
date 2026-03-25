import React, { memo, useCallback } from 'react';

const DeleteConfirmModal = memo(({ dimension, isDeleting, onConfirm, onCancel }) => {
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  }, [isDeleting, onCancel]);

  return (
    <div className="delete-confirm-overlay" onClick={handleBackdropClick}>
      <div className="delete-confirm-modal">
        <div className="delete-confirm-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 className="delete-confirm-title">确认删除</h3>
        <p className="delete-confirm-message">
          确定要删除维度「<strong>{dimension.name}</strong>」吗？
          <br />
          <span className="delete-confirm-warning">此操作无法撤销</span>
        </p>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-btn cancel" onClick={onCancel} disabled={isDeleting}>
            取消
          </button>
          <button className="delete-confirm-btn confirm" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
});

DeleteConfirmModal.displayName = 'DeleteConfirmModal';

export default DeleteConfirmModal;

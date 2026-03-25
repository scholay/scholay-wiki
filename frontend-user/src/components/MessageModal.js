import React from 'react';
import { Modal, Button, Result } from 'antd';

const typeToStatus = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  confirm: 'info',
};

const MessageModal = ({
  isOpen,
  onClose,
  type = 'info',
  title,
  message,
  onConfirm,
  confirmText = '确定',
  cancelText = '取消',
}) => {
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      centered
      footer={
        type === 'confirm' ? (
          <>
            <Button onClick={onClose}>{cancelText}</Button>
            <Button type="primary" onClick={handleConfirm}>{confirmText}</Button>
          </>
        ) : (
          <Button type="primary" onClick={onClose}>{confirmText}</Button>
        )
      }
      closable
      width={420}
    >
      <Result
        status={typeToStatus[type] || 'info'}
        title={title}
        subTitle={message}
        style={{ padding: '24px 0 0' }}
      />
    </Modal>
  );
};

export default MessageModal;

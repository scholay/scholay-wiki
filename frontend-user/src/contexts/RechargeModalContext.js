/**
 * RechargeModalContext - 充值弹窗全局状态管理
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const RechargeModalContext = createContext(null);

export const RechargeModalProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);

  const openRechargeModal = useCallback((onSuccess = null) => {
    if (onSuccess) {
      setOnSuccessCallback(() => onSuccess);
    } else {
      setOnSuccessCallback(null);
    }
    setIsOpen(true);
  }, []);

  const closeRechargeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSuccess = useCallback((result) => {
    if (onSuccessCallback) {
      onSuccessCallback(result);
    }
    closeRechargeModal();
  }, [onSuccessCallback, closeRechargeModal]);

  const value = {
    isOpen,
    openRechargeModal,
    closeRechargeModal,
    handleSuccess
  };

  return (
    <RechargeModalContext.Provider value={value}>
      {children}
    </RechargeModalContext.Provider>
  );
};

export const useRechargeModal = () => {
  const context = useContext(RechargeModalContext);
  if (!context) {
    throw new Error('useRechargeModal must be used within a RechargeModalProvider');
  }
  return context;
};

export default RechargeModalContext;


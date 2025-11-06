import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from './Toast';
import ErrorDialog from './ErrorDialog';
import './Toast.css';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [errorDialog, setErrorDialog] = useState(null);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };

    setToasts((prevToasts) => [...prevToasts, toast]);

    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration = 3000) => {
    return showToast(message, 'success', duration);
  }, [showToast]);

  // showError now shows a modal dialog that requires user acknowledgment
  const showError = useCallback((message, title = '错误') => {
    setErrorDialog({ message, title });
  }, []);

  const hideError = useCallback(() => {
    setErrorDialog(null);
  }, []);

  const showWarning = useCallback((message, duration = 3000) => {
    return showToast(message, 'warning', duration);
  }, [showToast]);

  const showInfo = useCallback((message, duration = 3000) => {
    return showToast(message, 'info', duration);
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        hideToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}
    >
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => hideToast(toast.id)}
          />
        ))}
      </div>
      {errorDialog && (
        <ErrorDialog
          message={errorDialog.message}
          title={errorDialog.title}
          onClose={hideError}
        />
      )}
    </ToastContext.Provider>
  );
};

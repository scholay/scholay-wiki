/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import './ErrorDialog.css';

/**
 * Error Dialog component for critical errors that require user acknowledgment
 * @param {string} message - The error message to display
 * @param {string} title - Dialog title (default: "错误")
 * @param {function} onClose - Callback when dialog is closed
 */
const ErrorDialog = ({ message, title = '错误', onClose }) => {
  return (
    <div className="error-dialog-overlay" onClick={onClose}>
      <div className="error-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="error-dialog-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h3 className="error-dialog-title">{title}</h3>
        <p className="error-dialog-message">{message}</p>
        <button className="error-dialog-button" onClick={onClose}>
          确定
        </button>
      </div>
    </div>
  );
};

export default ErrorDialog;

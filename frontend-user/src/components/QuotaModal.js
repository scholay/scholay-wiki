/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import './QuotaModal.css';

const QuotaModal = ({ isOpen, onClose, message = '配额不足，请升级订阅' }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <div className="quota-modal-overlay" onClick={onClose}>
      <div className="quota-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="quota-modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        
        <div className="quota-modal-content">
          {/* 图标 */}
          <div className="quota-modal-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          {/* 标题和消息 */}
          <h2 className="quota-modal-title">配额不足</h2>
          <p className="quota-modal-message">{message}</p>

          {/* 按钮组 */}
          <div className="quota-modal-actions">
            <button className="quota-modal-button quota-modal-button-secondary" onClick={onClose}>
              稍后再说
            </button>
            <button className="quota-modal-button quota-modal-button-primary" onClick={handleUpgrade}>
              立即升级
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotaModal;


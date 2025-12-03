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
import { useTheme } from '../contexts/ThemeContext';
import './MobileHelpModal.css';

const MobileHelpModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  if (!isOpen) return null;

  const handlePricingClick = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <>
      <div className="mobile-help-overlay" onClick={onClose} />
      <div className="mobile-help-modal">
        <div className="mobile-help-content">
          {/* 主题切换 */}
          <div className="mobile-help-item" onClick={(e) => e.stopPropagation()}>
            <span className="mobile-help-label">
              {theme === 'dark' ? '深色模式' : '浅色模式'}
            </span>
            <label className="mobile-theme-toggle">
              <input
                type="checkbox"
                checked={theme === 'light'}
                onChange={toggleTheme}
              />
              <span className="mobile-theme-slider"></span>
            </label>
          </div>

          {/* 分隔线 */}
          <div className="mobile-help-divider" />

          {/* 价格方案 */}
          <button className="mobile-help-item" onClick={handlePricingClick}>
            <span className="mobile-help-label">价格方案</span>
            <span className="mobile-help-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileHelpModal;


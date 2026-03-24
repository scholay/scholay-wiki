/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import './MobileHelpModal.css';

const MobileHelpModal = ({ isOpen, onClose }) => {
  const { theme, toggleTheme } = useTheme();

  if (!isOpen) return null;

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
        </div>
      </div>
    </>
  );
};

export default MobileHelpModal;


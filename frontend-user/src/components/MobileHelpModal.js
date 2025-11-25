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
            <div className="mobile-help-item-left">
              <span className="mobile-help-icon">
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                  </svg>
                )}
              </span>
              <span className="mobile-help-label">
                {theme === 'dark' ? '深色模式' : '浅色模式'}
              </span>
            </div>
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
            <div className="mobile-help-item-left">
              <span className="mobile-help-icon pricing">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
                  <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 14.625v-9.75zM8.25 9.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM18.75 9a.75.75 0 00-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 00.75-.75V9.75a.75.75 0 00-.75-.75h-.008zM4.5 9.75A.75.75 0 015.25 9h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V9.75z" clipRule="evenodd" />
                </svg>
              </span>
              <span className="mobile-help-label">价格方案</span>
            </div>
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


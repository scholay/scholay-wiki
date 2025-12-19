/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PreviewCard - 内容预览卡片组件
 * 从 PeerReviewPage.js 提取，显示稿件内容预览
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

/**
 * PreviewCard 组件
 */
const PreviewCard = memo(({ preview, fullText }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const btnRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const calculatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      const popupWidth = 500;
      const popupMaxHeight = Math.min(500, viewportHeight - 100);
      
      let left = rect.right + 16;
      let top = Math.max(60, rect.top - 100);
      
      if (left + popupWidth > viewportWidth - 20) {
        left = rect.left - popupWidth - 16;
      }
      
      if (top + popupMaxHeight > viewportHeight - 20) {
        top = viewportHeight - popupMaxHeight - 20;
      }
      
      setPopupStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popupWidth}px`,
        maxHeight: `${popupMaxHeight}px`,
        zIndex: 99999,
      });
    }
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    calculatePosition();
    setShowPopup(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 150);
  };

  const handlePopupMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handlePopupMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="prvr-card prvr-preview-card">
      <div className="prvr-card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        内容预览
      </div>
      <div className="prvr-preview">
        {preview}
      </div>
      {fullText && fullText.length > 100 && (
        <div className="prvr-preview-more">
          <span 
            ref={btnRef}
            className="prvr-preview-more-btn"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            查看全部
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17l9.2-9.2M17 17V7H7"/>
            </svg>
          </span>
          {showPopup && ReactDOM.createPortal(
            <div 
              className="prvr-preview-popup-portal"
              style={popupStyle}
              onMouseEnter={handlePopupMouseEnter}
              onMouseLeave={handlePopupMouseLeave}
            >
              <div className="prvr-preview-popup-content">
                {fullText}
              </div>
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
});

PreviewCard.displayName = 'PreviewCard';

PreviewCard.propTypes = {
  preview: PropTypes.string,
  fullText: PropTypes.string,
};

export default PreviewCard;


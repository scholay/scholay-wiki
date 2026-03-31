/**
 * 内容预览卡片组件（带弹窗）
 */
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

function PreviewCard({ preview, fullText }) {
  const [showPopup, setShowPopup] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const btnRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const calculatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 弹窗宽度和高度
      const popupWidth = 500;
      const popupMaxHeight = Math.min(500, viewportHeight - 100);

      // 计算位置：在按钮右侧，顶部对齐
      let left = rect.right + 16;
      let top = Math.max(60, rect.top - 100);

      // 如果右侧空间不够，放在左侧
      if (left + popupWidth > viewportWidth - 20) {
        left = rect.left - popupWidth - 16;
      }

      // 确保不超出底部
      if (top + popupMaxHeight > viewportHeight - 20) {
        top = viewportHeight - popupMaxHeight - 20;
      }

      setPopupStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popupWidth}px`,
        maxHeight: `${popupMaxHeight}px`,
      });
    }
  };

  const handleMouseEnter = () => {
    // 清除隐藏定时器
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    calculatePosition();
    setShowPopup(true);
  };

  const handleMouseLeave = () => {
    // 延迟隐藏，给用户时间移动到弹窗上
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 150);
  };

  const handlePopupMouseEnter = () => {
    // 鼠标进入弹窗，取消隐藏
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handlePopupMouseLeave = () => {
    // 鼠标离开弹窗，延迟隐藏
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 100);
  };

  // 清理定时器
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
}

export default PreviewCard;

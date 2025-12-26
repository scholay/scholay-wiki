/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * WelcomeModal - 注册欢迎弹窗
 * 
 * 用于新用户注册后展示欢迎信息和赠送的经费金额
 */

import React, { useState, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Gift, HelpCircle } from 'lucide-react';
import GoldIcon from './GoldIcon';
import './styles/WelcomeModal.css';

/**
 * 欢迎弹窗组件
 * @param {boolean} isOpen - 是否显示弹窗
 * @param {function} onClose - 关闭回调
 * @param {number} giftAmount - 赠送的经费金额
 */
const WelcomeModal = memo(({ isOpen, onClose, giftAmount = 0 }) => {
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (onClose) onClose();
    }, 200);
  }, [onClose]);

  const handleHelpClick = useCallback((e) => {
    e.stopPropagation();
    handleClose();
    // 延迟导航，等待弹窗关闭动画完成
    setTimeout(() => {
      navigate('/pricing');
    }, 250);
  }, [handleClose, navigate]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className={`welcome-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div 
        className={`welcome-modal ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 礼物图标 */}
        <div className="welcome-icon">
          <Gift size={36} />
        </div>

        {/* 欢迎标题 */}
        <h2 className="welcome-title">欢迎您的加入！</h2>

        {/* 经费金额展示 */}
        <div className="welcome-gift">
          <div className="welcome-gift-amount">
            <GoldIcon size="xl" />
            <span className="amount-value">{giftAmount}</span>
            <span className="amount-unit">经费</span>
          </div>
          <p className="welcome-gift-text">已到账，请查收</p>
        </div>

        {/* 帮助链接 */}
        <button 
          className="welcome-help-btn"
          onClick={handleHelpClick}
        >
          <HelpCircle size={16} />
          <span>什么是经费？</span>
        </button>

        {/* 确认按钮 */}
        <button 
          className="welcome-confirm-btn"
          onClick={handleClose}
        >
          开始使用
        </button>
      </div>
    </div>,
    document.body
  );
});

WelcomeModal.displayName = 'WelcomeModal';

export default WelcomeModal;


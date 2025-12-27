/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * InsufficientBalanceModal - 经费不足弹窗
 * 
 * 用于提示用户经费不足，引导充值或兑换
 */

import React, { useState, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CreditCard, RefreshCw } from 'lucide-react';
import GoldIcon from './GoldIcon';
import './styles/InsufficientBalanceModal.css';

/**
 * 经费不足弹窗组件
 * @param {boolean} isOpen - 是否显示弹窗
 * @param {function} onClose - 关闭回调
 * @param {number} balance - 当前余额
 * @param {number} required - 所需金额
 * @param {number} shortage - 缺口金额
 * @param {number} alreadyDeducted - 本次已消耗的经费（可选）
 */
const InsufficientBalanceModal = memo(({ 
  isOpen, 
  onClose, 
  balance = 0, 
  required = 0, 
  shortage = 0,
  alreadyDeducted = 0 
}) => {
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (onClose) onClose();
    }, 200);
  }, [onClose]);

  const handleRecharge = useCallback((e) => {
    e.stopPropagation();
    handleClose();
    // 延迟导航，等待弹窗关闭动画完成
    setTimeout(() => {
      navigate('/pricing');
    }, 250);
  }, [handleClose, navigate]);

  const handleExchange = useCallback((e) => {
    e.stopPropagation();
    handleClose();
    // 延迟导航到钱包页面
    setTimeout(() => {
      navigate('/settings?tab=subscription');
    }, 250);
  }, [handleClose, navigate]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className={`insufficient-balance-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div 
        className={`insufficient-balance-modal ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 警告图标 */}
        <div className="insufficient-balance-icon">
          <AlertTriangle size={36} />
        </div>

        {/* 标题 */}
        <h2 className="insufficient-balance-title">经费不足</h2>

        {/* 已消耗提示（如果有） */}
        {alreadyDeducted > 0 && (
          <div className="insufficient-balance-deducted">
            <span>本次已消耗</span>
            <div className="deducted-amount">
              <GoldIcon size="sm" />
              <span className="amount-value">{alreadyDeducted}</span>
              <span className="amount-unit">经费</span>
            </div>
          </div>
        )}

        {/* 余额信息 */}
        <div className="insufficient-balance-info">
          <div className="balance-row">
            <span className="balance-label">当前余额</span>
            <span className="balance-value">{balance}</span>
          </div>
          <div className="balance-row">
            <span className="balance-label">所需金额</span>
            <span className="balance-value required">{required}</span>
          </div>
          <div className="balance-row shortage">
            <span className="balance-label">缺口</span>
            <span className="balance-value">{shortage}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="insufficient-balance-actions">
          <button 
            className="action-btn recharge-btn"
            onClick={handleRecharge}
          >
            <CreditCard size={18} />
            <span>去充值</span>
          </button>
          <button 
            className="action-btn exchange-btn"
            onClick={handleExchange}
          >
            <RefreshCw size={18} />
            <span>去兑换</span>
          </button>
        </div>

        {/* 提示文字 */}
        <p className="insufficient-balance-tip">
          您可以购买恩特币或使用恩特币兑换经费
        </p>
      </div>
    </div>,
    document.body
  );
});

InsufficientBalanceModal.displayName = 'InsufficientBalanceModal';

export default InsufficientBalanceModal;

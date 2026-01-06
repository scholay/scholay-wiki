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

import React, { useState, useCallback, useEffect, memo } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, CreditCard, RefreshCw } from 'lucide-react';
import { useRechargeModal } from '../contexts/RechargeModalContext';
import { walletAPI } from '../services/api';
import EntcoinIcon from './EntcoinIcon';
import ExchangeModal from './ExchangeModal';
import './styles/InsufficientBalanceModal.css';

/**
 * 经费不足弹窗组件
 * @param {boolean} isOpen - 是否显示弹窗
 * @param {function} onClose - 关闭回调
 * @param {string} featureName - 功能名称（如：智能助手、智能检索、智能矩阵分析）
 * @param {number} required - 预计消耗金额
 * @param {number} shortage - 缺口金额
 */
const InsufficientBalanceModal = memo(({ 
  isOpen, 
  onClose, 
  featureName = '',
  required = 0, 
  shortage = 0
}) => {
  const { openRechargeModal } = useRechargeModal();
  const [isClosing, setIsClosing] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);

  // 获取钱包信息
  useEffect(() => {
    if (isOpen) {
      setLoadingWallet(true);
      walletAPI.getWallet()
        .then(res => {
          // API 返回 code 可能是 0 或 200
          if (res.data?.code === 200 || res.data?.code === 0) {
            setWalletInfo(res.data.data);
          }
        })
        .catch(err => {
          console.error('获取钱包信息失败:', err);
        })
        .finally(() => {
          setLoadingWallet(false);
        });
    }
  }, [isOpen]);

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
    // 延迟打开充值弹窗，等待当前弹窗关闭动画完成
    setTimeout(() => {
      openRechargeModal();
    }, 250);
  }, [handleClose, openRechargeModal]);

  const handleExchange = useCallback((e) => {
    e.stopPropagation();
    // 打开兑换弹窗
    setShowExchangeModal(true);
  }, []);

  const handleExchangeSuccess = useCallback((result) => {
    // 兑换成功后更新钱包信息
    if (result) {
      setWalletInfo(prev => ({
        ...prev,
        diamond_balance: result.currentDiamond,
        gold_balance: result.currentGold
      }));
    }
  }, []);

  const handleExchangeClose = useCallback(() => {
    setShowExchangeModal(false);
  }, []);

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

        {/* 功能和消耗提示 */}
        <p className="insufficient-balance-desc">
          {featureName && <span className="feature-name">{featureName}</span>}
          {required > 0 ? (
            <>预计消耗 <span className="cost-amount">{required}</span> 经费</>
          ) : (
            <>需要经费才能使用</>
          )}
        </p>

        {/* 恩特币余额提示 - 带兑换按钮 */}
        {walletInfo && walletInfo.diamond > 0 && (
          <div className="insufficient-balance-diamond-info">
            <div className="diamond-info-left">
              <EntcoinIcon size="sm" />
              <span>恩特币余额：<strong>{walletInfo.diamond}</strong></span>
            </div>
            <button className="diamond-exchange-btn" onClick={handleExchange}>
              <RefreshCw size={14} />
              <span>兑换经费</span>
            </button>
          </div>
        )}

        {/* 操作按钮 - 只保留充值 */}
        <div className="insufficient-balance-actions">
          <button 
            className="action-btn recharge-btn full-width"
            onClick={handleRecharge}
          >
            <CreditCard size={18} />
            <span>去充值</span>
          </button>
        </div>

        {/* 提示文字 */}
        <p className="insufficient-balance-tip">
          {walletInfo && walletInfo.diamond > 0 
            ? '恩特币可兑换为经费使用' 
            : '购买恩特币后可兑换为经费'}
        </p>

        {/* 兑换弹窗 */}
        <ExchangeModal
          isOpen={showExchangeModal}
          onClose={handleExchangeClose}
          onSuccess={handleExchangeSuccess}
          diamondBalance={walletInfo?.diamond}
        />
      </div>
    </div>,
    document.body
  );
});

InsufficientBalanceModal.displayName = 'InsufficientBalanceModal';

export default InsufficientBalanceModal;

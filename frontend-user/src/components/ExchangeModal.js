/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ExchangeModal - 恩特币兑换经费弹窗
 * 
 * 独立的兑换弹窗组件，可在多处调用
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import ReactDOM from 'react-dom';
import { walletAPI } from '../services/api';
import EntcoinIcon from './EntcoinIcon';
import GoldIcon from './GoldIcon';
import './styles/ExchangeModal.css';

/**
 * 兑换弹窗组件
 * @param {boolean} isOpen - 是否显示弹窗
 * @param {function} onClose - 关闭回调
 * @param {function} onSuccess - 兑换成功回调
 * @param {number} diamondBalance - 当前恩特币余额（可选，不传则自动获取）
 */
const ExchangeModal = memo(({ 
  isOpen, 
  onClose, 
  onSuccess,
  diamondBalance: propDiamondBalance
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(100); // 1恩特币=100经费
  const [diamondBalance, setDiamondBalance] = useState(propDiamondBalance || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // 获取钱包和兑换信息
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError('');
      setSuccess(null);
      setExchangeAmount('');
      
      Promise.all([
        propDiamondBalance === undefined ? walletAPI.getWallet() : Promise.resolve(null),
        walletAPI.getExchangeInfo()
      ])
        .then(([walletRes, exchangeRes]) => {
          // API 返回 code 可能是 0 或 200
          if (walletRes?.data?.code === 200 || walletRes?.data?.code === 0) {
            setDiamondBalance(walletRes.data.data.diamond || 0);
          } else if (propDiamondBalance !== undefined) {
            setDiamondBalance(propDiamondBalance);
          }
          
          if (exchangeRes?.data?.code === 200 || exchangeRes?.data?.code === 0) {
            setExchangeRate(exchangeRes.data.data.diamond_to_gold_rate || exchangeRes.data.data.exchange_rate || 100);
          }
        })
        .catch(err => {
          console.error('获取兑换信息失败:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, propDiamondBalance]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setExchangeAmount('');
      setError('');
      setSuccess(null);
      if (onClose) onClose();
    }, 200);
  }, [onClose]);

  const handleExchange = useCallback(async () => {
    const amount = parseInt(exchangeAmount, 10);
    if (!amount || amount <= 0) {
      setError('请输入有效的兑换数量');
      return;
    }
    if (amount > diamondBalance) {
      setError('恩特币余额不足');
      return;
    }

    setExchangeLoading(true);
    setError('');
    
    try {
      const response = await walletAPI.exchangeDiamondToGold(amount);
      if (response.data.code === 0 || response.data.code === 200) {
        const { gold_received, current_gold, current_diamond } = response.data.data;
        setSuccess({
          goldReceived: gold_received,
          currentGold: current_gold,
          currentDiamond: current_diamond
        });
        setDiamondBalance(current_diamond);
        if (onSuccess) {
          onSuccess({
            goldReceived: gold_received,
            currentGold: current_gold,
            currentDiamond: current_diamond
          });
        }
      } else {
        setError(response.data.message || '兑换失败');
      }
    } catch (err) {
      console.error('兑换失败:', err);
      setError(err.response?.data?.message || '兑换失败，请稍后重试');
    } finally {
      setExchangeLoading(false);
    }
  }, [exchangeAmount, diamondBalance, onSuccess]);

  const handleQuickSelect = useCallback((amount) => {
    setExchangeAmount(amount.toString());
    setError('');
  }, []);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '');
    setExchangeAmount(value);
    setError('');
  }, []);

  const handleExchangeAll = useCallback(() => {
    setExchangeAmount(diamondBalance.toString());
    setError('');
  }, [diamondBalance]);

  if (!isOpen) return null;

  const amount = parseInt(exchangeAmount, 10) || 0;
  const goldToReceive = amount * exchangeRate;
  const canExchange = amount > 0 && amount <= diamondBalance && !exchangeLoading;

  return ReactDOM.createPortal(
    <div 
      className={`exchange-modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div 
        className={`exchange-modal-container ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="exchange-modal-header">
          <div className="exchange-modal-title">
            <EntcoinIcon size="md" />
            <span>恩特币兑换经费</span>
          </div>
          <button className="exchange-modal-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="exchange-modal-body">
          {loading ? (
            <div className="exchange-loading">
              <div className="spinner"></div>
              <span>加载中...</span>
            </div>
          ) : success ? (
            /* 兑换成功状态 */
            <div className="exchange-success">
              <div className="exchange-success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h4>兑换成功</h4>
              <div className="exchange-success-amount">
                <GoldIcon size="lg" />
                <span>+{success.goldReceived}</span>
              </div>
              <p className="exchange-success-balance">
                当前经费余额：{success.currentGold}
              </p>
              <button className="exchange-btn-done" onClick={handleClose}>完成</button>
            </div>
          ) : (
            /* 兑换表单 */
            <>
              {/* 余额显示 */}
              <div className="exchange-balance">
                <span className="exchange-balance-label">可用恩特币</span>
                <span className="exchange-balance-value">
                  <EntcoinIcon size="sm" />
                  {diamondBalance}
                </span>
              </div>

              {/* 兑换比例提示 */}
              <div className="exchange-rate-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
                <span>兑换比例：1 恩特币 = {exchangeRate} 经费</span>
              </div>

              {/* 快捷选择 */}
              <div className="exchange-quick-select">
                {[1, 5, 10].filter(n => n <= diamondBalance).map(n => (
                  <button 
                    key={n}
                    className={`exchange-quick-btn ${exchangeAmount === n.toString() ? 'active' : ''}`}
                    onClick={() => handleQuickSelect(n)}
                  >
                    {n}
                  </button>
                ))}
                {diamondBalance > 0 && (
                  <button 
                    className={`exchange-quick-btn all ${exchangeAmount === diamondBalance.toString() ? 'active' : ''}`}
                    onClick={handleExchangeAll}
                  >
                    全部
                  </button>
                )}
              </div>

              {/* 输入框 */}
              <div className="exchange-input-wrapper">
                <div className="exchange-input-icon">
                  <EntcoinIcon size="sm" />
                </div>
                <input
                  type="text"
                  className="exchange-input"
                  value={exchangeAmount}
                  onChange={handleInputChange}
                  placeholder="输入兑换数量"
                  disabled={exchangeLoading}
                />
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="exchange-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  {error}
                </div>
              )}

              {/* 预览结果 */}
              {amount > 0 && (
                <div className="exchange-preview">
                  <div className="exchange-preview-row">
                    <span className="exchange-preview-label">预计获得</span>
                    <span className="exchange-preview-value">
                      <GoldIcon size="sm" />
                      {goldToReceive.toLocaleString()} 经费
                    </span>
                  </div>
                </div>
              )}

              {/* 底部按钮 */}
              <div className="exchange-modal-footer">
                <button className="exchange-btn-cancel" onClick={handleClose}>
                  取消
                </button>
                <button 
                  className="exchange-btn-confirm"
                  onClick={handleExchange}
                  disabled={!canExchange}
                >
                  {exchangeLoading ? '兑换中...' : '确认兑换'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

ExchangeModal.displayName = 'ExchangeModal';

export default ExchangeModal;


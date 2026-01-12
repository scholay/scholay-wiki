/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ExchangeModal - 恩特币兑换经费弹窗（全新设计版）
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import ReactDOM from 'react-dom';
import { walletAPI } from '../services/api';
import EntcoinIcon from './EntcoinIcon';
import GoldIcon from './GoldIcon';
import './styles/ExchangeModal.css';

const ExchangeModal = memo(({
  isOpen,
  onClose,
  onSuccess,
  diamondBalance: propDiamondBalance
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(100);
  const [diamondBalance, setDiamondBalance] = useState(propDiamondBalance || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError('');
      setSuccess(null);
      setExchangeAmount('1'); // 默认值为1

      Promise.all([
        propDiamondBalance === undefined ? walletAPI.getWallet() : Promise.resolve(null),
        walletAPI.getExchangeInfo()
      ])
        .then(([walletRes, exchangeRes]) => {
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
          currentDiamond: current_diamond,
          exchangedAmount: amount
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

  // 快捷选择 - 具体个数
  const handleQuickSelect = useCallback((num) => {
    if (num === 'all') {
      if (diamondBalance > 0) {
        setExchangeAmount(diamondBalance.toString());
        setError('');
      }
    } else if (num <= diamondBalance) {
      setExchangeAmount(num.toString());
      setError('');
    }
  }, [diamondBalance]);

  // 生成快捷选择选项
  const getQuickOptions = useCallback(() => {
    if (diamondBalance <= 0) return [1, 5, 10, 'all'];

    const options = [];
    if (diamondBalance >= 1) options.push(1);
    if (diamondBalance >= 5) options.push(5);
    if (diamondBalance >= 10) options.push(10);
    if (diamondBalance >= 50) options.push(50);
    options.push('all');

    if (options.length > 4) {
      return [options[0], options[Math.floor(options.length / 2) - 1], options[options.length - 2], 'all'];
    }
    return options;
  }, [diamondBalance]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '');
    setExchangeAmount(value);
    setError('');
  }, []);

  if (!isOpen) return null;

  const amount = parseInt(exchangeAmount, 10) || 0;
  const goldToReceive = amount * exchangeRate;
  const canExchange = amount > 0 && amount <= diamondBalance && !exchangeLoading;
  const quickOptions = getQuickOptions();

  return ReactDOM.createPortal(
    <div
      className={`exm-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`exm-modal ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button className="exm-close" onClick={handleClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {loading ? (
          <div className="exm-loading">
            <div className="exm-spinner"></div>
            <span>加载中...</span>
          </div>
        ) : success ? (
          /* 兑换成功 */
          <div className="exm-success">
            <div className="exm-success-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4" stroke="#10a37f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>兑换成功</h3>
            <div className="exm-success-detail">
              <div className="exm-success-from">
                <EntcoinIcon size="md" />
                <span>-{success.exchangedAmount}</span>
              </div>
              <div className="exm-success-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div className="exm-success-to">
                <GoldIcon size="md" />
                <span>+{success.goldReceived.toLocaleString()}</span>
              </div>
            </div>
            <p className="exm-success-balance">当前经费余额：{success.currentGold.toLocaleString()}</p>
            <button className="exm-btn-done" onClick={handleClose}>完成</button>
          </div>
        ) : (
          /* 兑换表单 - 全新设计 */
          <>
            {/* 顶部标题栏 */}
            <div className="exm-header">
              <h2 className="exm-title">兑换经费</h2>
            </div>

            {/* 主内容区域 - 左右布局 */}
            <div className="exm-body">
              {/* 左侧：兑换图示 + 余额 */}
              <div className="exm-left">
                <div className="exm-exchange-visual">
                  <div className="exm-coin-wrapper exm-coin-from">
                    <EntcoinIcon size="md" />
                    <span className="exm-coin-label">恩特币</span>
                  </div>
                  <div className="exm-exchange-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      <path d="M14 7l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="exm-coin-wrapper exm-coin-to">
                    <GoldIcon size="md" />
                    <span className="exm-coin-label">经费</span>
                  </div>
                </div>
                <div className="exm-rate-badge">
                  <span className="exm-rate-text">比例</span>
                  <span className="exm-rate-value">1:{exchangeRate}</span>
                </div>
                <div className="exm-balance-info">
                  <span className="exm-balance-label">可用余额</span>
                  <div className="exm-balance-value">
                    <EntcoinIcon size="sm" />
                    <span>{diamondBalance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 右侧：输入 + 结果 */}
              <div className="exm-right">
                {/* 输入区域 */}
                <div className="exm-input-group">
                  <div className={`exm-input-wrapper ${error ? 'error' : ''} ${amount > 0 ? 'has-value' : ''}`}>
                    <div className="exm-input-icon">
                      <EntcoinIcon size="sm" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={exchangeAmount}
                      onChange={handleInputChange}
                      placeholder="输入数量"
                      disabled={exchangeLoading || diamondBalance === 0}
                    />
                    {amount > 0 && (
                      <button className="exm-input-clear" onClick={() => setExchangeAmount('')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="15" y1="9" x2="9" y2="15"/>
                          <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* 快捷选择 */}
                  <div className="exm-quick-select">
                    {quickOptions.map(opt => (
                      <button
                        key={opt}
                        className={`exm-quick-btn ${(opt === 'all' && amount === diamondBalance && amount > 0) || amount === opt ? 'active' : ''}`}
                        onClick={() => handleQuickSelect(opt)}
                        disabled={diamondBalance === 0 || (opt !== 'all' && opt > diamondBalance)}
                      >
                        {opt === 'all' ? '全部' : opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 预计获得 */}
                <div className={`exm-result-preview ${amount > 0 ? 'show' : ''}`}>
                  <span className="exm-result-label">获得</span>
                  <div className="exm-result-value">
                    <GoldIcon size="sm" />
                    <span className="exm-result-num">{goldToReceive.toLocaleString()}</span>
                  </div>
                </div>

                {/* 错误提示 */}
                {error && (
                  <div className="exm-error-msg">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="exm-footer">
              <button
                className="exm-submit-btn"
                onClick={handleExchange}
                disabled={!canExchange}
              >
                {exchangeLoading ? (
                  <>
                    <span className="exm-btn-spinner"></span>
                    <span>兑换中...</span>
                  </>
                ) : (
                  <span>确认兑换</span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
});

ExchangeModal.displayName = 'ExchangeModal';

export default ExchangeModal;

/**
 * RechargeModal - 全局充值弹窗组件（紧凑版）
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import api, { orderAPI, paymentAPI } from '../services/api';
import { useToast } from './ToastContainer';
import { useRechargeModal } from '../contexts/RechargeModalContext';
import EntcoinIcon from './EntcoinIcon';
import logger from '../utils/logger';
import './styles/RechargeModal.css';

// 充值选项配置
const RECHARGE_OPTIONS = [
  { amount: 10, bonus: 0 },
  { amount: 50, bonus: 2 },
  { amount: 100, bonus: 5 },
  { amount: 200, bonus: 12 },
  { amount: 500, bonus: 35 },
  { amount: 1000, bonus: 80 },
];

const RechargeModal = () => {
  const { isOpen, closeRechargeModal, handleSuccess } = useRechargeModal();
  const { showError, showSuccess } = useToast();

  // 充值金额
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  // 支付
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [order, setOrder] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [isDevMode] = useState(
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedAmount(null);
      setCustomAmount('');
      setIsCustom(false);
      setPaymentMethod('alipay');
      setPaymentLoading(false);
      setPolling(false);
      setOrder(null);
      setPaymentStatus(null);
    }
  }, [isOpen]);

  // 获取赠送数量
  const getBonus = (amount) => {
    const opt = RECHARGE_OPTIONS.find(o => o.amount === amount);
    return opt?.bonus || 0;
  };

  // 获取当前选择的金额
  const getCurrentAmount = () => {
    return isCustom ? parseInt(customAmount, 10) : selectedAmount;
  };

  // 开始轮询
  const startPolling = (orderNo) => {
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 60;

    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await orderAPI.getOrderDetail(orderNo);
        if (res.data.code === 0 && res.data.data) {
          const orderData = res.data.data;
          if (orderData.status === 'paid') {
            clearInterval(poll);
            setPolling(false);
            setOrder(orderData);
            setPaymentStatus('success');
            showSuccess('充值成功！');
          } else if (orderData.status === 'cancelled' || orderData.status === 'failed') {
            clearInterval(poll);
            setPolling(false);
            setPaymentStatus('failed');
            showError('支付已取消或失败');
          }
        }
      } catch (error) {
        logger.error('Recharge polling error:', error);
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        setPolling(false);
        showError('支付超时，请检查支付状态');
      }
    }, 3000);
  };

  // 处理支付
  const handlePayment = async () => {
    const amount = getCurrentAmount();
    const bonus = isCustom ? 0 : getBonus(amount);

    if (!amount || amount < 1) {
      showError('请选择或输入充值数量');
      return;
    }

    setPaymentLoading(true);

    try {
      const createRes = await orderAPI.createRechargeOrder(amount, bonus);
      if (createRes.data.code !== 0 || !createRes.data.data) {
        showError('创建订单失败：' + (createRes.data.message || '未知错误'));
        setPaymentLoading(false);
        return;
      }

      const newOrder = createRes.data.data;
      setOrder(newOrder);

      if (paymentMethod === 'simulate') {
        const simRes = await api.post('/user/payment/simulate', {
          order_no: newOrder.order_no,
          amount: newOrder.final_amount
        });
        if (simRes.data.code === 0) {
          setPaymentLoading(false);
          startPolling(newOrder.order_no);
        } else {
          showError('模拟支付失败');
          setPaymentLoading(false);
        }
      } else if (paymentMethod === 'alipay') {
        const returnURL = `${window.location.origin}/alipay-return?orderNo=${newOrder.order_no}`;
        const payRes = await paymentAPI.createAlipayPayment(
          newOrder.order_no,
          `恩特币充值 ${amount}个`,
          newOrder.final_amount,
          returnURL,
          `订单号: ${newOrder.order_no}`
        );

        if (payRes.data.code === 0 && payRes.data.data) {
          window.open(payRes.data.data.payment_url, '_blank');
          setPaymentLoading(false);
          startPolling(newOrder.order_no);
        } else {
          showError('创建支付失败');
          setPaymentLoading(false);
        }
      }
    } catch (error) {
      showError('支付失败：' + (error.response?.data?.message || error.message));
      setPaymentLoading(false);
    }
  };

  const handleClose = () => {
    if (!paymentLoading && !polling) {
      if (paymentStatus === 'success') {
        handleSuccess(order);
      } else {
        closeRechargeModal();
      }
    }
  };

  const handleComplete = () => {
    handleSuccess(order);
  };

  if (!isOpen) return null;

  const amount = getCurrentAmount();
  const bonus = isCustom ? 0 : getBonus(amount);
  const hasAmount = amount && amount >= 1;

  return ReactDOM.createPortal(
    <div className="rcm-overlay" onClick={handleClose}>
      <div className="rcm-modal rcm-compact" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="rcm-header">
          <h3>{paymentStatus === 'success' ? '充值成功' : '恩特币充值'}</h3>
          <button className="rcm-close" onClick={handleClose} disabled={paymentLoading || polling}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="rcm-body">
          {/* 成功状态 */}
          {paymentStatus === 'success' && order && (
            <div className="rcm-success">
              <div className="rcm-success-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h4>充值成功！</h4>
              <p>
                已充值 {order.diamond_amount + (order.bonus_amount || 0)} 恩特币
                {order.bonus_amount > 0 && <span className="rcm-bonus-text">（含赠送{order.bonus_amount}个）</span>}
              </p>
              <button className="rcm-btn-primary rcm-btn-full" onClick={handleComplete}>完成</button>
            </div>
          )}

          {/* 正常流程 */}
          {paymentStatus !== 'success' && (
            <>
              {/* 金额选择 - 紧凑网格 */}
              <div className="rcm-options">
                {RECHARGE_OPTIONS.map(opt => (
                  <div
                    key={opt.amount}
                    className={`rcm-option ${selectedAmount === opt.amount && !isCustom ? 'selected' : ''}`}
                    onClick={() => { setSelectedAmount(opt.amount); setIsCustom(false); setCustomAmount(''); }}
                  >
                    <div className="rcm-option-row">
                      <EntcoinIcon size="sm" />
                      <span className="rcm-option-amount">{opt.amount}</span>
                      {opt.bonus > 0 && <span className="rcm-option-bonus">+{opt.bonus}</span>}
                    </div>
                    <div className="rcm-option-price">¥{opt.amount}</div>
                  </div>
                ))}
              </div>

              {/* 自定义金额 - 内联 */}
              <div className="rcm-custom">
                <span className="rcm-custom-label">自定义</span>
                <div className="rcm-custom-input">
                  <EntcoinIcon size="sm" />
                  <input
                    type="text"
                    placeholder="数量"
                    value={customAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCustomAmount(val);
                      if (val) { setIsCustom(true); setSelectedAmount(null); }
                    }}
                    onClick={() => { setIsCustom(true); setSelectedAmount(null); }}
                  />
                </div>
              </div>

              {/* 分隔线 */}
              <div className="rcm-divider"></div>

              {/* 订单摘要 - 始终显示 */}
              <div className={`rcm-summary ${!hasAmount ? 'disabled' : ''}`}>
                <div className="rcm-summary-row">
                  <span>充值</span>
                  <span>{hasAmount ? `${amount} 恩特币` : '--'}</span>
                </div>
                {bonus > 0 && (
                  <div className="rcm-summary-row bonus">
                    <span>赠送</span>
                    <span>+{bonus}</span>
                  </div>
                )}
                <div className="rcm-summary-row total">
                  <span>支付</span>
                  <span className="rcm-price">{hasAmount ? `¥${amount}` : '--'}</span>
                </div>
              </div>

              {/* 支付方式 - 始终显示 */}
              <div className={`rcm-payment ${!hasAmount ? 'disabled' : ''}`}>
                <div
                  className={`rcm-pay-item ${paymentMethod === 'alipay' ? 'selected' : ''}`}
                  onClick={() => hasAmount && setPaymentMethod('alipay')}
                >
                  <img src="/支付宝logo.png" alt="支付宝" />
                  <span>支付宝</span>
                  {paymentMethod === 'alipay' && <span className="rcm-check">✓</span>}
                </div>
                {isDevMode && (
                  <div
                    className={`rcm-pay-item ${paymentMethod === 'simulate' ? 'selected' : ''}`}
                    onClick={() => hasAmount && setPaymentMethod('simulate')}
                  >
                    <span className="rcm-dev-icon">🧪</span>
                    <span>手动支付</span>
                    {paymentMethod === 'simulate' && <span className="rcm-check">✓</span>}
                  </div>
                )}
              </div>

              {/* 轮询状态 */}
              {polling && (
                <div className="rcm-polling">
                  <div className="rcm-spinner"></div>
                  <span>等待支付...</span>
                </div>
              )}

              {/* 底部按钮 */}
              <div className="rcm-footer-inline">
                <button className="rcm-btn-cancel" onClick={handleClose} disabled={paymentLoading || polling}>
                  取消
                </button>
                <button
                  className="rcm-btn-primary"
                  onClick={handlePayment}
                  disabled={!hasAmount || paymentLoading || polling}
                >
                  {paymentLoading ? '处理中...' : polling ? '等待中...' : `支付 ${hasAmount ? `¥${amount}` : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RechargeModal;

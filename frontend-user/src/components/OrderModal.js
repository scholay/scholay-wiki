/**
 * OrderModal - 订单弹窗组件
 * 支持会员订阅和充值两种模式
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import api, { orderAPI, paymentAPI } from '../services/api';
import { useToast } from './ToastContainer';
import { useOrderModal } from '../contexts/OrderModalContext';
import EntcoinIcon from './EntcoinIcon';
import logger from '../utils/logger';
import './styles/OrderModal.css';

// 充值选项配置
const RECHARGE_OPTIONS = [
  { amount: 10, bonus: 0 },
  { amount: 50, bonus: 2 },
  { amount: 100, bonus: 5 },
  { amount: 200, bonus: 12 },
  { amount: 500, bonus: 35 },
  { amount: 1000, bonus: 80 },
];

// 套餐显示顺序
const PLAN_ORDER = ['free', 'pro', 'max'];

// 套餐描述
const PLAN_DESCRIPTIONS = {
  free: '体验基础功能',
  pro: '满足日常研究需求',
  max: '覆盖高频科研场景'
};

// 格式化价格
const formatPrice = (value) => {
  if (value === undefined || value === null) return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
};

// 获取充值赠送
const getRechargeBonus = (amount) => {
  const option = RECHARGE_OPTIONS.find(o => o.amount === amount);
  return option?.bonus || 0;
};

const OrderModal = memo(() => {
  const { isOpen, config, closeOrderModal, handlePaymentSuccess } = useOrderModal();
  const { showError, showSuccess } = useToast();

  // 视图状态: 'plan' | 'recharge' | 'payment'
  const [view, setView] = useState('plan');
  const [isClosing, setIsClosing] = useState(false);

  // 套餐相关
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');

  // 充值相关
  const [rechargeAmount, setRechargeAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  // 支付相关
  const [order, setOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  // 折扣券
  const [coupons, setCoupons] = useState([]);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [showCouponList, setShowCouponList] = useState(false);
  const [discountPreview, setDiscountPreview] = useState(null);

  // 支付轮询
  const [isPolling, setIsPolling] = useState(false);

  // 微信支付
  const [wechatQR, setWechatQR] = useState('');
  const [showWechatQR, setShowWechatQR] = useState(false);

  // 检测开发模式
  useEffect(() => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    setIsDevMode(isDev);
  }, []);

  // 弹窗打开时初始化
  useEffect(() => {
    if (!isOpen) return;

    // 重置状态
    setIsClosing(false);
    setOrder(null);
    setSelectedCoupon(null);
    setDiscountPreview(null);
    setIsPolling(false);
    setShowWechatQR(false);
    setWechatQR('');

    // 根据配置决定初始视图
    if (config.mode === 'recharge') {
      setView('recharge');
      if (config.rechargeAmount) {
        setRechargeAmount(config.rechargeAmount);
        setIsCustom(false);
      }
    } else if (config.skipPlanSelection && config.planCode) {
      // 已选套餐，直接进入支付
      setBillingCycle(config.billingCycle || 'monthly');
      fetchPlanAndPreparePayment(config.planCode, config.billingCycle || 'monthly');
    } else {
      // 需要选择套餐
      setView('plan');
      setBillingCycle(config.billingCycle || 'monthly');
      fetchPlans();
    }
  }, [isOpen, config]);

  // 获取套餐列表
  const fetchPlans = async () => {
    setPlansLoading(true);
    try {
      const response = await api.get('/user/subscription/plans');
      if (response.data.code === 0 && response.data.data) {
        const allPlans = response.data.data;
        // 按顺序排列
        const ordered = PLAN_ORDER
          .map(code => allPlans.find(p => p.plan_code === code))
          .filter(Boolean);
        setPlans(ordered);
      }
    } catch (error) {
      logger.error('Failed to fetch plans:', error);
      showError('获取套餐列表失败');
    } finally {
      setPlansLoading(false);
    }
  };

  // 获取单个套餐并准备支付
  const fetchPlanAndPreparePayment = async (planCode, cycle) => {
    setPlansLoading(true);
    try {
      const response = await api.get(`/user/subscription/plans/${planCode}`);
      if (response.data.code === 0 && response.data.data) {
        const plan = response.data.data;
        setSelectedPlan(plan);
        prepareOrderPreview(plan, cycle);
        setView('payment');
        // 获取可用优惠券
        const amount = cycle === 'monthly' ? plan.current_price_monthly : plan.current_price_yearly;
        fetchAvailableCoupons(amount);
      }
    } catch (error) {
      logger.error('Failed to fetch plan:', error);
      showError('获取套餐信息失败');
    } finally {
      setPlansLoading(false);
    }
  };

  // 准备订单预览
  const prepareOrderPreview = (plan, cycle) => {
    const amount = cycle === 'monthly' ? plan.current_price_monthly : plan.current_price_yearly;
    setOrder({
      order_type: 'subscription',
      plan_code: plan.plan_code,
      plan_name: plan.plan_name,
      billing_cycle: cycle,
      amount: amount,
      final_amount: amount,
      discount_amount: 0,
      status: 'preview'
    });
  };

  // 准备充值订单预览
  const prepareRechargePreview = (amount, bonus) => {
    setOrder({
      order_type: 'recharge',
      diamond_amount: amount,
      bonus_amount: bonus,
      amount: amount,
      final_amount: amount,
      discount_amount: 0,
      status: 'preview'
    });
  };

  // 获取可用优惠券
  const fetchAvailableCoupons = async (amount) => {
    try {
      const response = await api.get(`/user/coupons/available?amount=${amount}`);
      if (response.data.code === 0) {
        setCoupons(response.data.data || []);
      }
    } catch (error) {
      logger.error('Failed to fetch coupons:', error);
    }
  };

  // 选择优惠券
  const handleSelectCoupon = async (coupon) => {
    if (!coupon || !order) return;
    try {
      const res = await api.get(`/user/coupons/calculate-discount?coupon_id=${coupon.id}&amount=${order.amount}`);
      if (res.data.code === 0) {
        setSelectedCoupon(coupon);
        setDiscountPreview(res.data.data);
        setShowCouponList(false);
        setOrder(prev => ({
          ...prev,
          coupon_id: coupon.id,
          discount_amount: res.data.data.discount_amount,
          final_amount: res.data.data.final_amount
        }));
      }
    } catch (error) {
      showError('计算折扣失败');
    }
  };

  // 移除优惠券
  const handleRemoveCoupon = () => {
    setSelectedCoupon(null);
    setDiscountPreview(null);
    if (order) {
      setOrder(prev => ({
        ...prev,
        coupon_id: null,
        discount_amount: 0,
        final_amount: prev.amount
      }));
    }
  };

  // 关闭弹窗
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      closeOrderModal();
    }, 200);
  }, [closeOrderModal]);

  // 选择套餐后进入支付
  const handleSelectPlan = (plan) => {
    if (plan.plan_code === 'free') return;
    setSelectedPlan(plan);
    prepareOrderPreview(plan, billingCycle);
    setView('payment');
    const amount = billingCycle === 'monthly' ? plan.current_price_monthly : plan.current_price_yearly;
    fetchAvailableCoupons(amount);
  };

  // 充值确认后进入支付
  const handleRechargeConfirm = () => {
    const amount = isCustom ? parseInt(customAmount, 10) : rechargeAmount;
    if (!amount || amount < 1) {
      showError('请选择或输入充值数量');
      return;
    }
    const bonus = isCustom ? 0 : getRechargeBonus(amount);
    prepareRechargePreview(amount, bonus);
    setView('payment');
  };

  // 处理支付
  const handlePayment = async () => {
    if (!order) return;
    setPaymentLoading(true);

    let actualOrder = order;
    
    // 创建订单
    if (order.status === 'preview') {
      try {
        let createRes;
        if (order.order_type === 'recharge') {
          createRes = await orderAPI.createRechargeOrder(order.diamond_amount, order.bonus_amount);
        } else {
          createRes = await orderAPI.createOrder(order.plan_code, order.billing_cycle, selectedCoupon?.id);
        }
        
        if (createRes.data.code !== 0 || !createRes.data.data) {
          showError('创建订单失败：' + (createRes.data.message || '未知错误'));
          setPaymentLoading(false);
          return;
        }
        actualOrder = createRes.data.data;
        setOrder(actualOrder);
      } catch (error) {
        showError('创建订单失败：' + (error.response?.data?.message || error.message));
        setPaymentLoading(false);
        return;
      }
    }

    // 发起支付
    try {
      const finalAmount = actualOrder.final_amount;
      const isRecharge = actualOrder.order_type === 'recharge';
      const subject = isRecharge
        ? `恩特币充值 ${actualOrder.diamond_amount}个`
        : `Scholar ${actualOrder.plan_name} ${actualOrder.billing_cycle === 'monthly' ? '月付' : '年付'}订阅`;

      if (paymentMethod === 'simulate') {
        const simRes = await api.post('/user/payment/simulate', {
          order_no: actualOrder.order_no,
          amount: finalAmount
        });
        if (simRes.data.code === 0) {
          startPolling(actualOrder.order_no);
        } else {
          showError('模拟支付失败');
          setPaymentLoading(false);
        }
      } else if (paymentMethod === 'alipay') {
        // 支付宝 - 新窗口打开
        const returnURL = `${window.location.origin}/alipay-return?orderNo=${actualOrder.order_no}`;
        const payRes = await paymentAPI.createAlipayPayment(
          actualOrder.order_no,
          subject,
          finalAmount,
          returnURL,
          `订单号: ${actualOrder.order_no}`
        );
        
        if (payRes.data.code === 0 && payRes.data.data) {
          // 新窗口打开支付宝
          window.open(payRes.data.data.payment_url, '_blank');
          // 开始轮询
          startPolling(actualOrder.order_no);
        } else {
          showError('创建支付失败');
          setPaymentLoading(false);
        }
      } else if (paymentMethod === 'wechat') {
        const payRes = await paymentAPI.createWeChatPayment(actualOrder.order_no, finalAmount);
        if (payRes.data.code === 0 && payRes.data.data) {
          setWechatQR(payRes.data.data.code_url);
          setShowWechatQR(true);
          setPaymentLoading(false);
          startPolling(actualOrder.order_no);
        } else {
          showError('创建微信支付失败');
          setPaymentLoading(false);
        }
      }
    } catch (error) {
      showError('支付失败，请稍后重试');
      logger.error('Payment failed:', error);
      setPaymentLoading(false);
    }
  };

  // 轮询支付状态
  const startPolling = (orderNo) => {
    setIsPolling(true);
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
            setIsPolling(false);
            setPaymentLoading(false);
            setShowWechatQR(false);
            showSuccess('支付成功！');
            handlePaymentSuccess(orderData);
          } else if (orderData.status === 'cancelled' || orderData.status === 'failed') {
            clearInterval(poll);
            setIsPolling(false);
            setPaymentLoading(false);
            showError('支付已取消或失败');
          }
        }
      } catch (error) {
        logger.error('Polling error:', error);
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        setIsPolling(false);
        setPaymentLoading(false);
        showError('支付超时，请检查支付状态');
      }
    }, 3000);
  };

  // 监听支付宝回调消息
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'ALIPAY_PAYMENT_COMPLETE' && event.data?.orderNo) {
        logger.log('Received payment complete message:', event.data.orderNo);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 渲染套餐选择视图
  const renderPlanView = () => (
    <div className="om-plan-view">
      <div className="om-billing-toggle">
        <button
          className={billingCycle === 'monthly' ? 'active' : ''}
          onClick={() => setBillingCycle('monthly')}
        >
          按月付费
        </button>
        <button
          className={billingCycle === 'yearly' ? 'active' : ''}
          onClick={() => setBillingCycle('yearly')}
        >
          按年付费 <span className="om-save-badge">省2个月</span>
        </button>
      </div>

      {plansLoading ? (
        <div className="om-loading">加载套餐中...</div>
      ) : (
        <div className="om-plan-cards">
          {plans.map(plan => {
            const isFree = plan.plan_code === 'free';
            const price = billingCycle === 'monthly' 
              ? plan.current_price_monthly 
              : plan.current_price_yearly;
            
            return (
              <div
                key={plan.plan_code}
                className={`om-plan-card ${plan.plan_code} ${isFree ? 'disabled' : ''}`}
                onClick={() => !isFree && handleSelectPlan(plan)}
              >
                {plan.plan_code === 'pro' && <span className="om-popular">最受欢迎</span>}
                <h4>{plan.plan_name}</h4>
                <p className="om-plan-desc">{PLAN_DESCRIPTIONS[plan.plan_code]}</p>
                <div className="om-plan-price">
                  <span className="om-currency">¥</span>
                  <span className="om-amount">{formatPrice(price)}</span>
                  <span className="om-period">/{billingCycle === 'monthly' ? '月' : '年'}</span>
                </div>
                <button 
                  className={`om-plan-btn ${isFree ? 'free' : ''}`}
                  disabled={isFree}
                >
                  {isFree ? '免费使用' : '选择此套餐'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // 渲染充值视图
  const renderRechargeView = () => (
    <div className="om-recharge-view">
      <div className="om-recharge-options">
        {RECHARGE_OPTIONS.map(opt => (
          <div
            key={opt.amount}
            className={`om-recharge-option ${rechargeAmount === opt.amount && !isCustom ? 'selected' : ''}`}
            onClick={() => {
              setRechargeAmount(opt.amount);
              setIsCustom(false);
              setCustomAmount('');
            }}
          >
            <div className="om-recharge-main">
              <EntcoinIcon size="md" />
              <span className="om-recharge-amount">{opt.amount}</span>
            </div>
            {opt.bonus > 0 && <div className="om-recharge-bonus">+{opt.bonus}</div>}
            <div className="om-recharge-price">¥{opt.amount}</div>
          </div>
        ))}
      </div>

      <div className="om-custom-amount">
        <label>自定义数量</label>
        <div className="om-custom-input">
          <EntcoinIcon size="sm" />
          <input
            type="text"
            placeholder="输入充值数量"
            value={customAmount}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setCustomAmount(val);
              if (val) {
                setIsCustom(true);
                setRechargeAmount(null);
              }
            }}
            onClick={() => {
              setIsCustom(true);
              setRechargeAmount(null);
            }}
          />
          <span>个</span>
        </div>
      </div>

      {(rechargeAmount || (isCustom && customAmount)) && (
        <div className="om-recharge-preview">
          <div className="om-preview-row">
            <span>充值数量</span>
            <span>{isCustom ? customAmount : rechargeAmount} 恩特币</span>
          </div>
          {!isCustom && getRechargeBonus(rechargeAmount) > 0 && (
            <div className="om-preview-row bonus">
              <span>赠送数量</span>
              <span>+{getRechargeBonus(rechargeAmount)} 恩特币</span>
            </div>
          )}
          <div className="om-preview-row total">
            <span>支付金额</span>
            <span className="om-total-price">¥{isCustom ? customAmount : rechargeAmount}</span>
          </div>
        </div>
      )}

      <div className="om-recharge-actions">
        <button className="om-btn-cancel" onClick={handleClose}>取消</button>
        <button 
          className="om-btn-confirm"
          onClick={handleRechargeConfirm}
          disabled={!rechargeAmount && (!isCustom || !customAmount)}
        >
          下一步
        </button>
      </div>
    </div>
  );

  // 渲染支付视图
  const renderPaymentView = () => {
    if (!order) return null;
    const isRecharge = order.order_type === 'recharge';

    return (
      <div className="om-payment-view">
        {/* 订单信息 */}
        <div className="om-order-info">
          <h4>{isRecharge ? '恩特币充值' : order.plan_name}</h4>
          <p>
            {isRecharge 
              ? `充值 ${order.diamond_amount} 个${order.bonus_amount > 0 ? ` (+赠送${order.bonus_amount}个)` : ''}`
              : `${order.billing_cycle === 'monthly' ? '按月付费' : '按年付费'}`
            }
          </p>
        </div>

        {/* 金额 */}
        <div className="om-amount-section">
          <div className="om-amount-row">
            <span>{isRecharge ? '充值金额' : '套餐价格'}</span>
            <span>¥{formatPrice(order.amount)}</span>
          </div>

          {/* 优惠券（仅订阅显示） */}
          {!isRecharge && (
            <div className="om-coupon-section">
              {selectedCoupon ? (
                <div className="om-selected-coupon">
                  <span>{selectedCoupon.template?.name || '优惠券'}</span>
                  <span className="om-discount">-¥{discountPreview?.discount_amount?.toFixed(2)}</span>
                  <button onClick={handleRemoveCoupon}>×</button>
                </div>
              ) : (
                <button 
                  className="om-coupon-btn"
                  onClick={() => setShowCouponList(true)}
                  disabled={coupons.length === 0}
                >
                  {coupons.length > 0 ? `使用折扣券 (${coupons.length}张可用)` : '暂无可用折扣券'}
                </button>
              )}
            </div>
          )}

          <div className="om-amount-divider"></div>
          <div className="om-amount-row total">
            <span>实付金额</span>
            <span className="om-final-amount">¥{formatPrice(order.final_amount)}</span>
          </div>
        </div>

        {/* 支付方式 */}
        <div className="om-payment-methods">
          <h5>支付方式</h5>
          <div className="om-method-list">
            <div
              className={`om-method-item ${paymentMethod === 'alipay' ? 'selected' : ''}`}
              onClick={() => setPaymentMethod('alipay')}
            >
              <img src="/支付宝logo.png" alt="支付宝" />
              <span>支付宝</span>
              {paymentMethod === 'alipay' && <span className="om-check">✓</span>}
            </div>

            {isDevMode && (
              <div
                className={`om-method-item ${paymentMethod === 'simulate' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('simulate')}
              >
                <span className="om-dev-icon">🧪</span>
                <span>手动支付</span>
                <span className="om-dev-tag">开发模式</span>
                {paymentMethod === 'simulate' && <span className="om-check">✓</span>}
              </div>
            )}
          </div>
        </div>

        {/* 轮询状态 */}
        {isPolling && (
          <div className="om-polling">
            <div className="om-spinner"></div>
            <span>等待支付结果...</span>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="om-payment-actions">
          <button 
            className="om-btn-back"
            onClick={() => setView(config.mode === 'recharge' ? 'recharge' : 'plan')}
            disabled={paymentLoading || isPolling}
          >
            返回
          </button>
          <button
            className="om-btn-pay"
            onClick={handlePayment}
            disabled={paymentLoading || isPolling}
          >
            {paymentLoading ? '处理中...' : '去支付'}
          </button>
        </div>
      </div>
    );
  };

  // 获取标题
  const getTitle = () => {
    if (view === 'plan') return '选择套餐';
    if (view === 'recharge') return '恩特币充值';
    if (view === 'payment') {
      return order?.order_type === 'recharge' ? '确认充值' : '确认订单';
    }
    return '订单';
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={`om-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`om-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="om-header">
          <h3>{getTitle()}</h3>
          <button className="om-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="om-content">
          {view === 'plan' && renderPlanView()}
          {view === 'recharge' && renderRechargeView()}
          {view === 'payment' && renderPaymentView()}
        </div>

        {/* 优惠券列表弹窗 */}
        {showCouponList && (
          <div className="om-coupon-overlay" onClick={() => setShowCouponList(false)}>
            <div className="om-coupon-modal" onClick={e => e.stopPropagation()}>
              <div className="om-coupon-header">
                <h4>选择折扣券</h4>
                <button onClick={() => setShowCouponList(false)}>×</button>
              </div>
              <div className="om-coupon-list">
                {coupons.length === 0 ? (
                  <p className="om-no-coupon">暂无可用折扣券</p>
                ) : (
                  coupons.map(coupon => (
                    <div
                      key={coupon.id}
                      className="om-coupon-item"
                      onClick={() => handleSelectCoupon(coupon)}
                    >
                      <div className="om-coupon-info">
                        <span className="om-coupon-name">{coupon.template?.name || '优惠券'}</span>
                        <span className="om-coupon-desc">{coupon.template?.description || ''}</span>
                      </div>
                      <div className="om-coupon-value">
                        {coupon.template?.type === 'percentage'
                          ? `${coupon.discount_value}%`
                          : `¥${coupon.discount_value}`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 微信二维码弹窗 */}
        {showWechatQR && (
          <div className="om-wechat-overlay" onClick={() => setShowWechatQR(false)}>
            <div className="om-wechat-modal" onClick={e => e.stopPropagation()}>
              <h4>微信扫码支付</h4>
              <div className="om-qr-container">
                {wechatQR && (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wechatQR)}`}
                    alt="微信支付二维码"
                  />
                )}
              </div>
              <p>请使用微信扫码完成支付</p>
              <p className="om-wechat-amount">支付金额: ¥{formatPrice(order?.final_amount)}</p>
              {isPolling && (
                <div className="om-polling">
                  <div className="om-spinner"></div>
                  <span>等待支付中...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

OrderModal.displayName = 'OrderModal';

export default OrderModal;

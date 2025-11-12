import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { orderAPI, paymentAPI } from '../services/api';
import { useToast } from '../components/ToastContainer';
import './OrderConfirmation.css';

const OrderConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showError } = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('alipay');
  const [isDevMode, setIsDevMode] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);

  // 折扣券相关状态
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [discountPreview, setDiscountPreview] = useState(null);

  useEffect(() => {
    // Check if in development mode (localhost or dev environment)
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    setIsDevMode(isDev);

    // Check if we have plan details (new flow - order not created yet)
    const { planCode, billingCycle } = location.state || {};

    if (planCode && billingCycle) {
      // New flow: order not created yet, fetch plan details and show preview
      fetchPlanDetails(planCode, billingCycle);
      return;
    }

    // Old flow: order already created (for backward compatibility or payment callback)
    const orderNo = location.state?.orderNo || new URLSearchParams(location.search).get('orderNo');
    if (orderNo) {
      fetchOrderDetails(orderNo);
      fetchAvailableCoupons(orderNo);
      return;
    }

    // No valid state
    showError('订单信息不存在,请重新下单');
    navigate('/pricing');
  }, [location.state, location.search]);

  // 获取可用折扣券
  const fetchAvailableCoupons = async (orderNo) => {
    try {
      // 先获取订单详情以获取订单金额
      const orderResponse = await orderAPI.getOrderDetail(orderNo);
      if (orderResponse.data.code === 0 && orderResponse.data.data) {
        const orderAmount = orderResponse.data.data.amount;

        // 获取可用的折扣券
        const couponsResponse = await api.get(`/user/coupons/available?amount=${orderAmount}`);
        if (couponsResponse.data.code === 0) {
          setAvailableCoupons(couponsResponse.data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch available coupons:', error);
    }
  };

  // Polling effect - check order status periodically after payment redirect
  useEffect(() => {
    if (!order || order.status !== 'pending') {
      return;
    }

    // Start polling if we came from payment (URL has orderNo parameter)
    const searchParams = new URLSearchParams(location.search);
    const orderNoFromURL = searchParams.get('orderNo');

    if (orderNoFromURL && !isPolling) {
      setIsPolling(true);
      console.log('[Payment Polling] Starting payment status polling...');
    }

    if (!isPolling) {
      return;
    }

    // Maximum polling duration: 60 seconds (30 attempts × 2 seconds)
    if (pollingCount >= 30) {
      console.log('[Payment Polling] Polling timeout, stopping');
      setIsPolling(false);
      return;
    }

    // Poll every 2 seconds
    const pollTimer = setTimeout(() => {
      console.log(`[Payment Polling] Checking order status (attempt ${pollingCount + 1}/30)...`);
      fetchOrderDetails(order.order_no, true);
      setPollingCount(prev => prev + 1);
    }, 2000);

    return () => clearTimeout(pollTimer);
  }, [order, isPolling, pollingCount, location.search]);

  // Fetch plan details and create a preview order object (order not created on backend yet)
  const fetchPlanDetails = async (planCode, billingCycle) => {
    try {
      const response = await api.get(`/user/subscription/plans/${planCode}`);
      if (response.data.code === 0 && response.data.data) {
        const plan = response.data.data;
        const amount = billingCycle === 'monthly' ? plan.current_price_monthly : plan.current_price_yearly;

        // Create a preview order object (not saved to backend yet)
        const previewOrder = {
          plan_code: plan.plan_code,
          plan_name: plan.plan_name,
          billing_cycle: billingCycle,
          amount: amount,
          final_amount: amount, // Will be updated when coupon is selected
          discount_amount: 0,
          coupon_id: null,
          status: 'preview', // Special status to indicate this is a preview
          order_no: null, // Will be generated on payment
          created_at: new Date().toISOString(), // Add current time for preview
        };

        setOrder(previewOrder);

        // Fetch available coupons
        const couponsResponse = await api.get(`/user/coupons/available?amount=${amount}`);
        if (couponsResponse.data.code === 0 && couponsResponse.data.data) {
          setAvailableCoupons(couponsResponse.data.data || []);
        }
      }
      setLoading(false);
    } catch (error) {
      showError('获取套餐信息失败,请重试');
      console.error('Failed to fetch plan details:', error);
      setLoading(false);
      navigate('/pricing');
    }
  };

  const fetchOrderDetails = async (orderNo, isPollingRequest = false) => {
    try {
      const response = await orderAPI.getOrderDetail(orderNo);
      if (response.data.code === 0 && response.data.data) {
        const newOrder = response.data.data;
        const previousStatus = order?.status;
        setOrder(newOrder);

        console.log(`[Order Status] Current: ${newOrder.status}, Previous: ${previousStatus}, IsPolling: ${isPollingRequest}`);

        // If polling and order status changed to paid, stop polling and show success
        if (isPollingRequest && newOrder.status === 'paid') {
          console.log('[Payment Polling] Payment confirmed! Status changed to paid');
          setIsPolling(false);
          setPollingCount(0);

          // Show a brief success message before redirecting
          console.log('[Payment Polling] Redirecting to subscription page in 2 seconds...');
          setTimeout(() => {
            console.log('[Payment Polling] Executing redirect now');
            navigate('/settings?tab=subscription');
          }, 2000);
        }

        // Also handle case where user refreshes a paid order page - auto redirect
        if (!isPollingRequest && newOrder.status === 'paid' && !previousStatus) {
          console.log('[Order] Detected paid order on initial load, redirecting in 3 seconds...');
          setTimeout(() => {
            console.log('[Order] Executing redirect for paid order');
            navigate('/settings?tab=subscription');
          }, 3000);
        }
      } else {
        if (!isPollingRequest) {
          showError('获取订单详情失败：' + (response.data.message || '未知错误'));
          navigate('/settings');
        }
      }
    } catch (error) {
      if (!isPollingRequest) {
        showError('获取订单详情失败,请重试');
        console.error('Failed to fetch order details:', error);
        navigate('/settings');
      } else {
        console.error('[Payment Polling] Failed to fetch order status:', error);
      }
    } finally {
      if (!isPollingRequest) {
        setLoading(false);
      }
    }
  };

  // 选择折扣券
  const handleSelectCoupon = async (coupon) => {
    if (!coupon || !order) return;

    try {
      // 计算折扣预览
      const response = await api.get(`/user/coupons/calculate-discount?coupon_id=${coupon.id}&amount=${order.amount}`);
      if (response.data.code === 0) {
        setSelectedCoupon(coupon);
        setDiscountPreview(response.data.data);
        setShowCouponModal(false);

        // If order is in preview mode, update the preview order with discount information
        if (order.status === 'preview') {
          const discountData = response.data.data;
          setOrder({
            ...order,
            coupon_id: coupon.id,
            discount_amount: discountData.discount_amount,
            final_amount: discountData.final_amount,
          });
        }
      }
    } catch (error) {
      showError('计算折扣失败：' + (error.response?.data?.message || error.message));
    }
  };

  // 取消选择折扣券
  const handleRemoveCoupon = () => {
    setSelectedCoupon(null);
    setDiscountPreview(null);

    // If order is in preview mode, reset the discount information
    if (order && order.status === 'preview') {
      setOrder({
        ...order,
        coupon_id: null,
        discount_amount: 0,
        final_amount: order.amount,
      });
    }
  };

  // 获取最终支付金额
  const getFinalAmount = () => {
    if (discountPreview) {
      return discountPreview.final_amount;
    }
    return order.amount;
  };

  const handlePayment = async () => {
    if (!order) return;

    setPaymentLoading(true);

    // If order is in preview status, create the order first
    let actualOrder = order;
    if (order.status === 'preview') {
      try {
        console.log('[Order Creation] Creating order with coupon:', selectedCoupon?.id);
        const createOrderResponse = await orderAPI.createOrder(
          order.plan_code,
          order.billing_cycle,
          selectedCoupon?.id // Pass coupon_id if selected
        );

        if (createOrderResponse.data.code !== 0 || !createOrderResponse.data.data) {
          showError('创建订单失败：' + (createOrderResponse.data.message || '未知错误'));
          setPaymentLoading(false);
          return;
        }

        actualOrder = createOrderResponse.data.data;
        setOrder(actualOrder);
        console.log('[Order Creation] Order created successfully:', actualOrder.order_no);
      } catch (error) {
        showError('创建订单失败：' + (error.response?.data?.message || error.message));
        setPaymentLoading(false);
        return;
      }
    }

    try {
      // Use the final_amount from the order (backend has already calculated discount)
      const finalAmount = actualOrder.final_amount;

      if (selectedPaymentMethod === 'simulate') {
        // Simulate payment for development
        const response = await api.post('/user/payment/simulate', {
          order_no: actualOrder.order_no,
          amount: finalAmount
        });

        if (response.data.code === 0) {
          // Payment simulated successfully, start polling
          setIsPolling(true);
          console.log('[Simulate Payment] Payment simulated, starting polling...');
        } else {
          showError('模拟支付失败：' + (response.data.message || '未知错误'));
          setPaymentLoading(false);
        }
      } else if (selectedPaymentMethod === 'alipay') {
        // Create Alipay payment
        // Return to order confirmation page with order number so user can see payment result
        const returnURL = `${window.location.origin}/order-confirmation?orderNo=${order.order_no}`;
        const subject = `Scholar ${order.plan_name} ${order.billing_cycle === 'monthly' ? '月付' : '年付'}订阅`;
        const description = `订单号: ${order.order_no}`;

        const paymentResponse = await paymentAPI.createAlipayPayment(
          order.order_no,
          subject,
          finalAmount, // Use discounted amount if coupon applied
          returnURL,
          description
        );

        if (paymentResponse.data.code === 0 && paymentResponse.data.data) {
          // Redirect to Alipay payment page
          window.location.href = paymentResponse.data.data.payment_url;
        } else {
          showError('创建支付失败：' + (paymentResponse.data.message || '未知错误'));
          setPaymentLoading(false);
        }
      }
    } catch (error) {
      showError('支付失败,请稍后重试');
      console.error('Payment failed:', error);
      setPaymentLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/settings');
  };

  if (loading) {
    return (
      <div className="order-confirmation-container">
        <div className="loading">加载订单信息...</div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="order-confirmation-container">
      {/* Top Header with Logo */}
      <div className="pricing-top-header" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 1000,
        background: '#212121',
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div
          onClick={() => navigate('/')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: 'fit-content'
          }}
        >
          <img
            src="/logo.png"
            alt="Scholay"
            style={{
              width: '18px',
              height: '18px',
              objectFit: 'contain'
            }}
          />
          <span style={{
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            letterSpacing: '0.5px'
          }}>
            Scholay
          </span>
        </div>
      </div>

      <div className="order-confirmation-card">
        {/* Header */}
        <div className="order-header">
          <h1>{order.status === 'paid' ? '支付成功' : order.status === 'cancelled' ? '订单已取消' : '订单确认'}</h1>
          {order.status !== 'preview' && (
            <span className={`status-badge ${order.status}`}>
              {order.status === 'pending' ? '待支付' :
               order.status === 'paid' ? '已支付' :
               order.status === 'cancelled' ? '已取消' : '未知'}
            </span>
          )}
        </div>

        {/* Polling Indicator */}
        {isPolling && order.status === 'pending' && (
          <div className="polling-indicator">
            <div className="spinner"></div>
            <p>正在确认支付结果，请稍候...</p>
          </div>
        )}

        {/* Success Message for Paid Orders */}
        {order.status === 'paid' && (
          <div className="payment-success-message">
            <div className="success-icon">✓</div>
            <h2>恭喜您,订阅已激活!</h2>
            <p>您的 {order.plan_name} 订阅已成功激活,现在可以享受所有功能。</p>
            <p className="redirect-hint">即将跳转到订阅管理页面...</p>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="order-content">
          {/* Left Column - Order Details */}
          <div className="order-details-column">
            {/* Order Info */}
            <div className="info-section">
              <h3>订单信息</h3>
              {order.order_no && (
                <div className="info-row">
                  <span className="label">订单号</span>
                  <span className="value">{order.order_no}</span>
                </div>
              )}
              {order.created_at && (
                <div className="info-row">
                  <span className="label">{order.status === 'preview' ? '预计创建时间' : '创建时间'}</span>
                  <span className="value">{new Date(order.created_at).toLocaleString('zh-CN')}</span>
                </div>
              )}
              {order.status === 'preview' && (
                <div className="info-row">
                  <span className="label">订单状态</span>
                  <span className="value" style={{color: 'rgba(255, 255, 255, 0.5)'}}>待创建</span>
                </div>
              )}
            </div>

            {/* Plan Info */}
            <div className="plan-info">
              <div className="plan-name">{order.plan_name || 'PRO'}</div>
              <div className="plan-cycle">
                {order.billing_cycle === 'monthly' ? '按月付费' : '按年付费'}
              </div>
            </div>
          </div>

          {/* Right Column - Payment */}
          <div className="payment-column">
            {/* Amount Summary */}
            <div className="amount-summary">
              <h3>支付金额</h3>
              <div className="amount-row">
                <span className="amount-label">套餐价格</span>
                <span className="amount-value">¥{order.amount.toFixed(2)}</span>
              </div>

              {/* 折扣券选择 */}
              <div className="coupon-selection">
                {selectedCoupon ? (
                  <div className="selected-coupon">
                    <div className="coupon-info">
                      <span className="coupon-name">{selectedCoupon.template?.name || '优惠券'}</span>
                      <span className="coupon-discount">-¥{discountPreview?.discount_amount?.toFixed(2)}</span>
                    </div>
                    <button className="btn-remove-coupon" onClick={handleRemoveCoupon}>×</button>
                  </div>
                ) : (
                  <button
                    className="btn-select-coupon"
                    onClick={() => setShowCouponModal(true)}
                    disabled={availableCoupons.length === 0}
                  >
                    {availableCoupons.length > 0 ? (
                      <>
                        <span>🎟️ 使用折扣券</span>
                        <span className="coupon-count">{availableCoupons.length}张可用</span>
                      </>
                    ) : (
                      <span>暂无可用折扣券</span>
                    )}
                  </button>
                )}
              </div>

              <div className="amount-divider"></div>
              <div className="amount-row total">
                <span className="amount-label">实付金额</span>
                <span className="amount-value amount-final">¥{getFinalAmount().toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="payment-method-section">
              <h3>支付方式</h3>
              <div className="payment-methods">
                <div
                  className={`payment-method-item ${selectedPaymentMethod === 'alipay' ? 'selected' : ''}`}
                  onClick={() => setSelectedPaymentMethod('alipay')}
                >
                  <div className="payment-icon">
                    <img
                      src="/支付宝logo.png"
                      alt="支付宝"
                      style={{width: '32px', height: '32px', borderRadius: '6px'}}
                    />
                  </div>
                  <div className="payment-method-info">
                    <div className="payment-name">支付宝</div>
                  </div>
                  {selectedPaymentMethod === 'alipay' && (
                    <div className="payment-check">✓</div>
                  )}
                </div>

                {isDevMode && (
                  <div
                    className={`payment-method-item ${selectedPaymentMethod === 'simulate' ? 'selected' : ''}`}
                    onClick={() => setSelectedPaymentMethod('simulate')}
                  >
                    <div className="payment-icon">
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #10a37f 0%, #0d8566 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px'
                      }}>
                        🧪
                      </div>
                    </div>
                    <div className="payment-method-info">
                      <div className="payment-name">手动支付</div>
                      <div className="payment-coming-soon" style={{color: '#10a37f'}}>开发模式</div>
                    </div>
                    {selectedPaymentMethod === 'simulate' && (
                      <div className="payment-check">✓</div>
                    )}
                  </div>
                )}

                <div className="payment-method-item disabled">
                  <div className="payment-icon">
                    <svg viewBox="0 0 1024 1024" width="32" height="32">
                      <path d="M664.250054 368.541681c10.015098 0 19.892049 0.732687 29.67281 1.795902-26.647917-122.810047-159.358451-214.077703-310.826188-214.077703-169.353083 0-308.085774 114.232694-308.085774 259.274068 0 83.708494 46.165436 152.460344 123.281791 205.78483l-30.80868 92.49925 107.688651-53.455469c38.558178 7.53665 69.459978 15.308661 107.924012 15.308661 9.66308 0 19.230993-0.470721 28.752858-1.225921-6.025227-20.36584-9.521864-41.723264-9.521864-63.862493C402.328693 476.632491 517.908058 368.541681 664.250054 368.541681zM498.62897 285.87389c23.200398 0 38.557154 15.120372 38.557154 38.061874 0 22.846334-15.356756 38.156018-38.557154 38.156018-23.107277 0-46.260603-15.309684-46.260603-38.156018C452.368366 300.994262 475.522716 285.87389 498.62897 285.87389zM283.016307 362.090758c-23.107277 0-46.402843-15.309684-46.402843-38.156018 0-22.941502 23.295566-38.061874 46.402843-38.061874 23.081695 0 38.46301 15.120372 38.46301 38.061874C321.479317 346.782098 306.098002 362.090758 283.016307 362.090758zM945.448458 606.151333c0-121.888048-123.258255-221.236753-261.683954-221.236753-146.57838 0-262.015505 99.348706-262.015505 221.236753 0 122.06508 115.437126 221.200938 262.015505 221.200938 30.66644 0 61.617359-7.609305 92.423993-15.262612l84.513836 45.786813-23.178909-76.17082C899.379213 735.776599 945.448458 674.90216 945.448458 606.151333zM598.803483 567.994292c-15.332197 0-30.807656-15.096836-30.807656-30.501688 0-15.190981 15.47546-30.477129 30.807656-30.477129 23.295566 0 38.558178 15.286148 38.558178 30.477129C637.361661 552.897456 622.099049 567.994292 598.803483 567.994292zM768.25071 567.994292c-15.213493 0-30.594809-15.096836-30.594809-30.501688 0-15.190981 15.381315-30.477129 30.594809-30.477129 23.107277 0 38.558178 15.286148 38.558178 30.477129C806.808888 552.897456 791.357987 567.994292 768.25071 567.994292z" fill="#09BB07"/>
                    </svg>
                  </div>
                  <div className="payment-method-info">
                    <div className="payment-name">微信支付</div>
                    <div className="payment-coming-soon">即将上线</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="order-actions">
              {(order.status === 'pending' || order.status === 'preview') && (
                <>
                  <button
                    className="btn-cancel"
                    onClick={handleCancel}
                    disabled={paymentLoading}
                  >
                    取消
                  </button>
                  <button
                    className="btn-pay"
                    onClick={handlePayment}
                    disabled={paymentLoading}
                  >
                    {paymentLoading ? '跳转中...' : '去支付'}
                  </button>
                </>
              )}

              {order.status === 'paid' && (
                <>
                  <button
                    className="btn-cancel"
                    onClick={() => navigate('/pricing')}
                  >
                    查看其他方案
                  </button>
                  <button
                    className="btn-pay"
                    onClick={() => navigate('/settings?tab=subscription')}
                  >
                    查看我的订阅
                  </button>
                </>
              )}

              {order.status === 'cancelled' && (
                <button
                  className="btn-pay"
                  onClick={() => navigate('/pricing')}
                >
                  重新选择方案
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 折扣券选择弹窗 */}
        {showCouponModal && (
          <div className="coupon-modal-overlay" onClick={() => setShowCouponModal(false)}>
            <div className="coupon-modal" onClick={e => e.stopPropagation()}>
              <div className="coupon-modal-header">
                <h3>选择折扣券</h3>
                <button className="btn-close-modal" onClick={() => setShowCouponModal(false)}>×</button>
              </div>
              <div className="coupon-modal-body">
                {availableCoupons.length === 0 ? (
                  <div className="empty-coupons">
                    <p>暂无可用的折扣券</p>
                    <small>快去领取专属折扣券吧~</small>
                  </div>
                ) : (
                  <div className="coupon-list">
                    {availableCoupons.map(coupon => (
                      <div
                        key={coupon.id}
                        className="coupon-item"
                        onClick={() => handleSelectCoupon(coupon)}
                      >
                        <div className="coupon-header">
                          <div className="coupon-title">
                            <div className="coupon-name">{coupon.template?.name || '优惠券'}</div>
                            <div className="coupon-desc">{coupon.template?.description || ''}</div>
                          </div>
                          <div className="coupon-discount-badge">
                            {coupon.template?.type === 'percentage'
                              ? `${coupon.discount_value}%`
                              : coupon.template?.type === 'fixed'
                              ? `¥${coupon.discount_value}`
                              : `-¥${coupon.discount_value}`}
                          </div>
                        </div>
                        <div className="coupon-details">
                          <div className="coupon-detail-item">
                            {coupon.min_purchase_amount > 0
                              ? `满¥${coupon.min_purchase_amount}可用`
                              : '无门槛'}
                          </div>
                          <div className="coupon-detail-item">
                            有效期至: {new Date(coupon.valid_until).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderConfirmation;

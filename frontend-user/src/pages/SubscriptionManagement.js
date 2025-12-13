/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api, { orderAPI, paymentAPI } from '../services/api';
import AppSidebar from '../components/AppSidebar';
import './SubscriptionManagement.css';

const SubscriptionManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [subscription, setSubscription] = useState(null);
  // usage 配额统计已废弃，现在使用货币系统
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    fetchAllData();
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      // usage 配额统计已废弃，现在使用货币系统
      const [subRes, plansRes, ordersRes] = await Promise.all([
        api.get('/user/subscription/my'),
        api.get('/user/subscription/plans'),
        api.get('/user/orders/my')
      ]);

      if (subRes.data.code === 0) {
        setSubscription(subRes.data.data);
      }
      if (plansRes.data.code === 0) {
        setPlans(plansRes.data.data);
      }
      if (ordersRes.data.code === 0) {
        setOrders(ordersRes.data.data.orders || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setMessage({ type: 'error', text: '加载数据失败，请刷新重试' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleViewPlans = () => {
    // Navigate to pricing page
    navigate('/pricing');
  };

  const getPricePerMonth = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    return (plan.price_yearly / 12).toFixed(2);
  };

  // 配额相关的辅助函数已废弃

  const formatOrderStatus = (status) => {
    const statusMap = {
      pending: { text: '待支付', class: 'pending' },
      paid: { text: '已支付', class: 'paid' },
      cancelled: { text: '已取消', class: 'cancelled' },
      refunded: { text: '已退款', class: 'refunded' }
    };
    return statusMap[status] || { text: status, class: 'unknown' };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handlePayOrder = async (order) => {
    setActionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Get plan details for payment
      const plan = plans.find(p => p.plan_code === order.plan_code);
      if (!plan) {
        setMessage({ type: 'error', text: '无法找到订阅方案信息' });
        setActionLoading(false);
        return;
      }

      // Create Alipay payment
      const returnURL = `${window.location.origin}/subscription`;
      const subject = `Scholar ${order.plan_name} ${order.billing_cycle === 'monthly' ? '月付' : '年付'}订阅`;
      const description = `订单号: ${order.order_no}`;

      const paymentResponse = await paymentAPI.createAlipayPayment(
        order.order_no,
        subject,
        order.amount,
        returnURL,
        description
      );

      if (paymentResponse.data.code === 0 && paymentResponse.data.data) {
        // Redirect to Alipay payment page
        window.location.href = paymentResponse.data.data.payment_url;
      } else {
        setMessage({ type: 'error', text: '创建支付失败：' + (paymentResponse.data.message || '未知错误') });
        setActionLoading(false);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '创建支付失败，请稍后重试' });
      console.error('Payment failed:', error);
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async (orderNo) => {
    if (!window.confirm('确认取消此订单吗？')) {
      return;
    }

    setActionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await orderAPI.cancelOrder(orderNo);

      if (response.data.code === 0) {
        setMessage({ type: 'success', text: '订单已取消' });
        await fetchAllData();
      } else {
        setMessage({ type: 'error', text: '取消订单失败：' + (response.data.message || '未知错误') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '取消订单失败，请稍后重试' });
      console.error('Cancel order failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="subscription-management">
        {isAuthenticated && (
          <AppSidebar
            user={user}
            onLogout={handleLogout}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            showHistory={false}
          />
        )}
        <div className={`main-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="subscription-management">
      {isAuthenticated && (
        <AppSidebar
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showHistory={false}
        />
      )}

      <div className={`main-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
        <div className="sub-management-content">
          {/* Message Display */}
          {message.text && (
            <div className={`message message-${message.type}`}>
              {message.text}
            </div>
          )}

          {/* Header */}
          <div className="sub-header">
            <h1>订阅管理</h1>
            <p className="sub-subtitle">管理您的订阅方案、查看使用情况和账单历史</p>
          </div>

          {/* Current Subscription Overview */}
          {subscription && (
            <div className="current-sub-overview">
              <div className="overview-left">
                <div className="current-plan-info">
                  <h2>当前订阅</h2>
                  <div className="plan-badge-container">
                    <span className={`plan-badge plan-badge-${subscription.plan_code}`}>
                      {subscription.plan_name}
                    </span>
                    {subscription.plan_code !== 'free' && subscription.end_date && (
                      <span className="plan-expiry">
                        到期: {new Date(subscription.end_date).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>
                </div>

                {/* 配额统计已废弃，现在使用货币系统（经费）进行扣费控制 */}
                {/* 用户可以在"设置"页面查看经费余额 */}
              </div>

              {subscription.plan_code !== 'free' && (
                <button
                  className="btn-renew-primary"
                  onClick={handleViewPlans}
                >
                  续期订阅
                </button>
              )}
            </div>
          )}

          {/* Plans Section - Link to Pricing Page */}
          <div className="plans-section">
            <div className="section-header">
              <h2>订阅方案</h2>
              <p>查看所有可用的订阅套餐，并选择适合您的方案</p>
            </div>

            <div className="view-plans-container">
              <div className="view-plans-content">
                <div className="view-plans-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </div>
                <h3>浏览所有订阅方案</h3>
                <p>比较不同套餐的功能和价格，选择最适合您需求的订阅方案</p>
                <button
                  className="btn-view-plans"
                  onClick={handleViewPlans}
                >
                  查看所有方案
                </button>
              </div>
            </div>
          </div>

          {/* 配额统计已废弃，现在使用货币系统（经费）进行扣费控制 */}

          {/* Billing History */}
          <div className="billing-section">
            <div className="section-header">
              <h2>账单历史</h2>
              <p>查看您的所有订阅订单和支付记录</p>
            </div>

            {orders.length === 0 ? (
              <div className="billing-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="6" width="18" height="14" rx="2" ry="2"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <line x1="7" y1="14" x2="7.01" y2="14"/>
                  <line x1="11" y1="14" x2="13" y2="14"/>
                </svg>
                <p>暂无账单记录</p>
                <p className="empty-hint">您的付款记录将显示在这里</p>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((order) => {
                  const statusInfo = formatOrderStatus(order.status);
                  return (
                    <div key={order.id} className="order-item">
                      <div className="order-main">
                        <div className="order-info">
                          <div className="order-title">
                            <span className="order-plan">{order.plan_name}</span>
                            <span className="order-cycle">
                              {order.billing_cycle === 'monthly' ? '月付' : '年付'}
                            </span>
                          </div>
                          <div className="order-no">订单号: {order.order_no}</div>
                          <div className="order-date">
                            {formatDate(order.created_at)}
                          </div>
                        </div>
                        <div className="order-right">
                          <div className="order-amount">¥{order.amount.toFixed(2)}</div>
                          <span className={`order-status status-${statusInfo.class}`}>
                            {statusInfo.text}
                          </span>
                          {order.status === 'pending' && (
                            <div className="order-actions">
                              <button
                                className="btn-pay-order"
                                onClick={() => handlePayOrder(order)}
                                disabled={actionLoading}
                              >
                                立即支付
                              </button>
                              <button
                                className="btn-cancel-order"
                                onClick={() => handleCancelOrder(order.order_no)}
                                disabled={actionLoading}
                              >
                                取消订单
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Feature Comparison Table */}
          <div className="comparison-section">
            <div className="section-header">
              <h2>套餐对比</h2>
              <p>详细了解每个方案包含的功能和限制</p>
            </div>

            <div className="comparison-table">
              <div className="table-header">
                <div className="header-cell">功能</div>
                <div className="header-cell">FREE</div>
                <div className="header-cell">PRO</div>
                <div className="header-cell">MAX</div>
              </div>

              <div className="table-section">
                <div className="section-title">核心功能</div>
                <div className="table-row">
                  <div className="cell">学术检索</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">聊天历史记录</div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                </div>
              </div>

              <div className="table-section">
                <div className="section-title">AI 功能（按经费扣费）</div>
                <div className="table-row">
                  <div className="cell">智能分析</div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">AI 聊天</div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">AI 审稿</div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                  <div className="cell"><span className="check">✓</span></div>
                </div>
              </div>

              <div className="table-section">
                <div className="section-title">会员福利</div>
                <div className="table-row">
                  <div className="cell">每月赠送经费</div>
                  <div className="cell">-</div>
                  <div className="cell">2000</div>
                  <div className="cell">5000</div>
                </div>
                <div className="table-row">
                  <div className="cell">每月赠送恩特币</div>
                  <div className="cell">-</div>
                  <div className="cell">-</div>
                  <div className="cell">6</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionManagement;

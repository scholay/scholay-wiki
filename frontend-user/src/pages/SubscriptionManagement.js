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
  const [usage, setUsage] = useState(null);
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
      const [subRes, usageRes, plansRes, ordersRes] = await Promise.all([
        api.get('/user/subscription/my'),
        api.get('/user/subscription/usage'),
        api.get('/user/subscription/plans'),
        api.get('/user/orders/my')
      ]);

      if (subRes.data.code === 0) {
        setSubscription(subRes.data.data);
      }
      if (usageRes.data.code === 0) {
        setUsage(usageRes.data);
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

  const getUsagePercentage = (used, limit) => {
    if (limit === -1) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const formatUsageText = (used, limitInfo) => {
    if (limitInfo.limit === -1) {
      return `今日已使用 ${used} 次`;
    }
    return `${used} / ${limitInfo.limit}`;
  };

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

                {/* Quick Usage Stats */}
                {usage && usage.usage && usage.limits && (
                  <div className="quick-usage">
                    <div className="usage-stat">
                      <div className="stat-icon">🔍</div>
                      <div className="stat-info">
                        <div className="stat-label">学术检索</div>
                        <div className="stat-value">{formatUsageText(usage.usage.normal_search, usage.limits.normal_search)}</div>
                      </div>
                    </div>
                    <div className="usage-stat">
                      <div className="stat-icon">⚡</div>
                      <div className="stat-info">
                        <div className="stat-label">智能分析</div>
                        <div className="stat-value">{formatUsageText(usage.usage.advanced_search_high, usage.limits.advanced_search_high)}</div>
                      </div>
                    </div>
                    <div className="usage-stat">
                      <div className="stat-icon">🤖</div>
                      <div className="stat-info">
                        <div className="stat-label">AI对话</div>
                        <div className="stat-value">{formatUsageText(usage.usage.ai_chat_high, usage.limits.ai_chat_high)}</div>
                      </div>
                    </div>
                  </div>
                )}
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

          {/* Detailed Usage Section */}
          {usage && usage.usage && usage.limits && (
            <div className="usage-details-section">
              <div className="section-header">
                <h2>今日使用详情</h2>
                <p>统计日期: {usage.quota_date || '今日'}</p>
              </div>

              <div className="usage-grid">
                <div className="usage-category">
                  <h3>搜索功能</h3>
                  <div className="usage-items">
                    {[
                      { label: '学术检索', key: 'normal_search', color: '#3b82f6' },
                      { label: '智能分析 - 低模', key: 'advanced_search_low', color: '#8b5cf6' },
                      { label: '智能分析 - 中模', key: 'advanced_search_mid', color: '#ec4899' },
                      { label: '智能分析 - 高模', key: 'advanced_search_high', color: '#f59e0b' }
                    ].map(item => {
                      const used = usage.usage[item.key];
                      const limit = usage.limits[item.key];
                      const percentage = getUsagePercentage(used, limit.limit);
                      const isUnlimited = limit.limit === -1;

                      return (
                        <div key={item.key} className="usage-item">
                          <div className="usage-label">
                            <span>{item.label}</span>
                            <span className="usage-count">{formatUsageText(used, limit)}</span>
                          </div>
                          <div className="usage-bar-container">
                            <div
                              className="usage-bar"
                              style={{
                                width: `${isUnlimited ? 100 : percentage}%`,
                                background: isUnlimited
                                  ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 100%)'
                                  : `linear-gradient(90deg, ${item.color} 0%, ${item.color}80 100%)`
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="usage-category">
                  <h3>AI对话</h3>
                  <div className="usage-items">
                    {[
                      { label: '普通模型', key: 'ai_chat_normal', color: '#10b981' },
                      { label: '中级模型', key: 'ai_chat_mid', color: '#06b6d4' },
                      { label: '高级模型', key: 'ai_chat_high', color: '#6366f1' }
                    ].map(item => {
                      const used = usage.usage[item.key];
                      const limit = usage.limits[item.key];
                      const percentage = getUsagePercentage(used, limit.limit);
                      const isUnlimited = limit.limit === -1;

                      return (
                        <div key={item.key} className="usage-item">
                          <div className="usage-label">
                            <span>{item.label}</span>
                            <span className="usage-count">{formatUsageText(used, limit)}</span>
                          </div>
                          <div className="usage-bar-container">
                            <div
                              className="usage-bar"
                              style={{
                                width: `${isUnlimited ? 100 : percentage}%`,
                                background: isUnlimited
                                  ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 100%)'
                                  : `linear-gradient(90deg, ${item.color} 0%, ${item.color}80 100%)`
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {subscription && subscription.plan_code === 'free' && (
                <div className="upgrade-tip">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <p>升级到 PRO 或 MAX 方案，享受无限制使用高级功能！</p>
                </div>
              )}
            </div>
          )}

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
                <div className="section-title">AI 模型</div>
                <div className="table-row">
                  <div className="cell">智能分析 - 低级模型</div>
                  <div className="cell">5/天</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">智能分析 - 中级模型</div>
                  <div className="cell">3/天</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">智能分析 - 高级模型</div>
                  <div className="cell">2/天</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">AI 聊天 - 普通模型</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">AI 聊天 - 中级模型</div>
                  <div className="cell">50/天</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                </div>
                <div className="table-row">
                  <div className="cell">AI 聊天 - 高级模型</div>
                  <div className="cell">10/天</div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
                  <div className="cell"><span className="unlimited">无限制</span></div>
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

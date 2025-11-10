import React, { useState, useEffect } from 'react';
import api, { orderAPI, paymentAPI } from '../services/api';
import { useToast } from '../components/ToastContainer';
import AuthModal from '../components/AuthModal';
import './Pricing.css';

const Pricing = () => {
  const { showError } = useToast();
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly'); // monthly or yearly
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/user/subscription/plans');
      if (response.data.code === 0) {
        setPlans(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSubscription = async () => {
    try {
      const token = localStorage.getItem('user_token');
      if (!token) {
        // User is not logged in, skip fetching current subscription
        return;
      }
      const response = await api.get('/user/subscription/my');
      if (response.data.code === 0) {
        setCurrentPlan(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch current subscription:', error);
    }
  };

  const handleUpgrade = async (planCode) => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      // User is not logged in, show auth modal
      setShowAuthModal(true);
      return;
    }

    try {
      // Step 1: Create order
      const orderResponse = await orderAPI.createOrder(planCode, billingCycle);

      if (orderResponse.data.code !== 0 || !orderResponse.data.data) {
        showError('创建订单失败：' + (orderResponse.data.message || '未知错误'));
        return;
      }

      const order = orderResponse.data.data;

      // Step 2: Get plan details for payment
      const plan = plans.find(p => p.plan_code === planCode);
      if (!plan) {
        showError('无法找到订阅方案信息');
        return;
      }

      // Step 3: Create Alipay payment
      const returnURL = `${window.location.origin}/subscription`;
      const subject = `Scholar ${plan.plan_name} ${billingCycle === 'monthly' ? '月付' : '年付'}订阅`;
      const description = `订单号: ${order.order_no}`;

      // Use current price based on billing cycle
      const amount = getTotalPrice(plan);

      const paymentResponse = await paymentAPI.createAlipayPayment(
        order.order_no,
        subject,
        amount,
        returnURL,
        description
      );

      if (paymentResponse.data.code === 0 && paymentResponse.data.data) {
        // Redirect to Alipay payment page
        window.location.href = paymentResponse.data.data.payment_url;
      } else {
        showError('创建支付失败：' + (paymentResponse.data.message || '未知错误'));
      }
    } catch (error) {
      showError('订阅升级失败，请稍后重试');
      console.error('Upgrade failed:', error);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // Refresh current subscription after login
    fetchCurrentSubscription();
  };

  const getPricePerMonth = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.current_price_monthly || plan.price_monthly;
    }
    const yearlyPrice = plan.current_price_yearly || plan.price_yearly;
    return (yearlyPrice / 12).toFixed(2);
  };

  const getOriginalPricePerMonth = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    return (plan.price_yearly / 12).toFixed(2);
  };

  const hasDiscount = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly !== plan.current_price_monthly;
    }
    return plan.price_yearly !== plan.current_price_yearly;
  };

  const getTotalPrice = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.current_price_monthly || plan.price_monthly;
    }
    return plan.current_price_yearly || plan.price_yearly;
  };

  const getOriginalTotalPrice = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    return plan.price_yearly;
  };

  const isCurrentPlan = (planCode) => {
    return currentPlan && currentPlan.plan_code === planCode;
  };

  // 功能对比数据
  const comparisonData = {
    sections: [
      {
        title: '核心功能',
        features: [
          { name: '普通搜索', free: '无限制', pro: '无限制', max: '无限制' },
          { name: '聊天历史记录', free: '无限制', pro: '无限制', max: '无限制' },
          { name: '访问网页、iOS 和 Android 应用', free: true, pro: true, max: true },
        ]
      },
      {
        title: 'AI 模型',
        features: [
          { name: '高级搜索 - 低级模型', free: '5/天', pro: '无限制', max: '无限制' },
          { name: '高级搜索 - 中级模型', free: '3/天', pro: '无限制', max: '无限制' },
          { name: '高级搜索 - 高级模型', free: '2/天', pro: '无限制', max: '无限制' },
          { name: 'AI 聊天 - 普通模型', free: '无限制', pro: '无限制', max: '无限制' },
          { name: 'AI 聊天 - 中级模型', free: '50/天', pro: '无限制', max: '无限制' },
          { name: 'AI 聊天 - 高级模型', free: '10/天', pro: '无限制', max: '无限制' },
        ]
      },
      {
        title: '数据与分析',
        features: [
          { name: '高级搜索数据', free: true, pro: true, max: true },
          { name: 'AI 对话历史数据', free: true, pro: true, max: true },
          { name: '深度分析能力', free: '受限', pro: '标准', max: '最大' },
          { name: '上下文记忆', free: '受限', pro: '标准', max: '最大' },
        ]
      }
    ]
  };

  if (loading) {
    return (
      <div className="pricing-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="pricing-container">
      {/* Header Section */}
      <div className="pricing-header">
        <h1>定价</h1>
        <p className="subtitle">选择适合你的学术研究助手方案</p>

        <div className="billing-toggle">
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
            按年付费 <span className="save-badge">省 2 个月</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Section */}
      <div className="pricing-cards-section">
        <div className="pricing-cards">
          {plans.map((plan) => (
            <div
              key={plan.plan_code}
              className={`pricing-card ${plan.plan_code} ${isCurrentPlan(plan.plan_code) ? 'current' : ''}`}
            >
              {plan.plan_code === 'pro' && (
                <div className="popular-badge">最受欢迎</div>
              )}

              <div className="plan-header">
                <h2>{plan.plan_name}</h2>
                <p>
                  {plan.plan_code === 'free' && 'Intelligence for everyday tasks'}
                  {plan.plan_code === 'pro' && '利用扩展访问权限提升效率和创意'}
                  {plan.plan_code === 'max' && 'Full access to the best of Scholar'}
                </p>
              </div>

              <div className="price">
                {plan.price_monthly === 0 && plan.price_yearly === 0 ? (
                  <div className="price-amount">
                    <span className="currency">¥</span>
                    <span className="amount">0</span>
                    <span className="period">/月</span>
                  </div>
                ) : (
                  <>
                    {hasDiscount(plan) && (
                      <div className="original-price">
                        <span className="currency">¥</span>
                        <span className="amount">{getOriginalPricePerMonth(plan)}</span>
                        <span className="period">/月</span>
                      </div>
                    )}
                    <div className="price-amount">
                      <span className="currency">¥</span>
                      <span className="amount">{getPricePerMonth(plan)}</span>
                      <span className="period">/月</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <div className="total-price">
                        {hasDiscount(plan) && (
                          <span className="original-total">原价 ¥{getOriginalTotalPrice(plan)}</span>
                        )}
                        <span>年付 ¥{getTotalPrice(plan)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="plan-features">
                <h3>主要功能</h3>
                <ul>
                  <li>
                    <span className="feature-label">普通搜索：</span>
                    <span className="feature-value">{plan.features.normal_search.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">高级搜索（低模）：</span>
                    <span className="feature-value">{plan.features.advanced_search_low.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">高级搜索（中模）：</span>
                    <span className="feature-value">{plan.features.advanced_search_mid.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">高级搜索（高模）：</span>
                    <span className="feature-value">{plan.features.advanced_search_high.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">AI 聊天（普通）：</span>
                    <span className="feature-value">{plan.features.ai_chat_normal.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">AI 聊天（中级）：</span>
                    <span className="feature-value">{plan.features.ai_chat_mid.description}</span>
                  </li>
                  <li>
                    <span className="feature-label">AI 聊天（高级）：</span>
                    <span className="feature-value">{plan.features.ai_chat_high.description}</span>
                  </li>
                </ul>
              </div>

              <div className="plan-action">
                {isCurrentPlan(plan.plan_code) ? (
                  <button className="btn-current" disabled>
                    当前方案
                  </button>
                ) : plan.price_monthly === 0 ? (
                  <button className="btn-free" disabled>
                    免费使用
                  </button>
                ) : (
                  <button
                    className="btn-upgrade"
                    onClick={() => handleUpgrade(plan.plan_code)}
                  >
                    {currentPlan && currentPlan.plan_code === 'free' ? '立即订阅' : '升级至此方案'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Table Section */}
      <div className="pricing-comparison">
        <div className="comparison-header">
          <h2>比较不同套餐的功能</h2>
          <p>详细了解每个方案包含的功能和限制</p>
        </div>

        <div className="comparison-table">
          <div className="table-header">
            <div className="table-header-cell">功能</div>
            <div className="table-header-cell">FREE</div>
            <div className="table-header-cell">PRO</div>
            <div className="table-header-cell">MAX</div>
          </div>

          {comparisonData.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="table-section">
              <div className="section-title">{section.title}</div>
              {section.features.map((feature, featureIndex) => (
                <div key={featureIndex} className="table-row">
                  <div className="table-cell">{feature.name}</div>
                  <div className="table-cell">
                    {typeof feature.free === 'boolean' ? (
                      feature.free ? <span className="check-icon">✓</span> : <span className="cross-icon">—</span>
                    ) : (
                      <span className="feature-text">{feature.free}</span>
                    )}
                  </div>
                  <div className="table-cell">
                    {typeof feature.pro === 'boolean' ? (
                      feature.pro ? <span className="check-icon">✓</span> : <span className="cross-icon">—</span>
                    ) : (
                      <span className="feature-text">{feature.pro}</span>
                    )}
                  </div>
                  <div className="table-cell">
                    {typeof feature.max === 'boolean' ? (
                      feature.max ? <span className="check-icon">✓</span> : <span className="cross-icon">—</span>
                    ) : (
                      <span className="feature-text">{feature.max}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="pricing-faq">
        <h2>常见问题</h2>
        <div className="faq-list">
          <div className="faq-item">
            <h3>如何升级我的订阅？</h3>
            <p>点击任意付费方案的"立即订阅"或"升级至此方案"按钮即可升级。升级后立即生效。</p>
          </div>
          <div className="faq-item">
            <h3>订阅会自动续费吗？</h3>
            <p>目前订阅不会自动续费，到期前我们会提醒您手动续费。您可以在订阅管理页面查看到期时间。</p>
          </div>
          <div className="faq-item">
            <h3>我可以随时取消订阅吗？</h3>
            <p>是的，您可以随时取消订阅。取消后将在当前订阅期结束后生效，您仍可使用已付费的服务至订阅期满。</p>
          </div>
          <div className="faq-item">
            <h3>支持哪些支付方式？</h3>
            <p>我们支持支付宝、微信支付、银行卡等多种支付方式，确保您的支付安全便捷。</p>
          </div>
          <div className="faq-item">
            <h3>如何查看我的使用配额？</h3>
            <p>登录后，访问"订阅管理"页面即可查看您当前的订阅状态和每日使用配额详情。</p>
          </div>
        </div>
      </div>

      {/* Auth Modal for login/registration */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default Pricing;

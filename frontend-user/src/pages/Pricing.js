import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { orderAPI } from '../services/api';
import { useToast } from '../components/ToastContainer';
import AuthModal from '../components/AuthModal';
import './Pricing.css';

const Pricing = () => {
  const navigate = useNavigate();
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

  const handlePlanAction = async (planCode, action) => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      // User is not logged in, show auth modal
      setShowAuthModal(true);
      return;
    }

    // Ignore if action is 'none'
    if (action === 'none') {
      return;
    }

    try {
      // Create order (backend will calculate actual amount based on current prices)
      const orderResponse = await orderAPI.createOrder(planCode, billingCycle);

      if (orderResponse.data.code !== 0 || !orderResponse.data.data) {
        showError('创建订单失败：' + (orderResponse.data.message || '未知错误'));
        return;
      }

      const order = orderResponse.data.data;

      // Navigate to order confirmation page where user can review and pay
      navigate('/order-confirmation', { state: { orderNo: order.order_no } });
    } catch (error) {
      const actionText = action === 'renew' ? '续期' : '订阅';
      showError(`${actionText}失败，请稍后重试`);
      console.error(`${actionText} failed:`, error);
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
    // For yearly: original price per month is always based on current monthly price
    return plan.current_price_monthly || plan.price_monthly;
  };

  const hasDiscount = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly !== plan.current_price_monthly;
    }
    // For yearly: compare configured yearly price with monthly price × 12
    const monthlyBasedYearlyPrice = (plan.current_price_monthly || plan.price_monthly) * 12;
    const actualYearlyPrice = plan.current_price_yearly || plan.price_yearly;
    return monthlyBasedYearlyPrice > actualYearlyPrice;
  };

  const getOriginalTotalPrice = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    // For yearly: original total is always monthly price × 12
    return ((plan.current_price_monthly || plan.price_monthly) * 12).toFixed(2);
  };

  const isCurrentPlan = (planCode) => {
    return currentPlan && currentPlan.plan_code === planCode;
  };

  // Determine button state and text for each plan
  const getPlanButtonInfo = (planCode) => {
    const token = localStorage.getItem('user_token');

    // Plan hierarchy: free < pro < max
    const planOrder = { 'free': 0, 'pro': 1, 'max': 2 };

    // Not logged in
    if (!token) {
      if (planCode === 'free') {
        return { text: '免费使用', disabled: true, action: 'none' };
      }
      return { text: '立即订阅', disabled: false, action: 'subscribe' };
    }

    // Logged in but no subscription data yet (should not happen, but handle gracefully)
    if (!currentPlan) {
      if (planCode === 'free') {
        return { text: '免费使用', disabled: true, action: 'none' };
      }
      return { text: '立即订阅', disabled: false, action: 'subscribe' };
    }

    const currentOrder = planOrder[currentPlan.plan_code];
    const targetOrder = planOrder[planCode];

    // Current plan
    if (planCode === currentPlan.plan_code) {
      if (planCode === 'free') {
        return { text: '当前方案', disabled: true, action: 'none' };
      }
      return { text: '续期订阅', disabled: false, action: 'renew' };
    }

    // Higher plan - upgrade
    if (targetOrder > currentOrder) {
      return { text: '升级至此方案', disabled: false, action: 'upgrade' };
    }

    // Lower plan - cannot downgrade, show disabled
    return { text: '已是更高套餐', disabled: true, action: 'none' };
  };

  // Get total price for display purposes only (actual payment uses backend-calculated order.amount)
  const getTotalPrice = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.current_price_monthly || plan.price_monthly;
    }
    return plan.current_price_yearly || plan.price_yearly;
  };

  // Calculate yearly discount badge text based on backend configuration
  const getYearlyDiscountText = () => {
    // Find any plan with yearly pricing to determine discount display
    const paidPlan = plans.find(p => p.price_yearly > 0);
    if (!paidPlan) return null;

    // Method 1: Percentage discount (if enabled and percentage is set)
    if (paidPlan.yearly_discount_enabled && paidPlan.yearly_discount_percent > 0) {
      return `优惠 ${paidPlan.yearly_discount_percent}%`;
    }

    // Method 2: Price optimization (calculate savings if prices differ)
    if (paidPlan.price_yearly > paidPlan.current_price_yearly) {
      const savings = paidPlan.price_yearly - paidPlan.current_price_yearly;
      return `省 ¥${savings.toFixed(0)}`;
    }

    // Fallback: Calculate equivalent months saved (original behavior)
    const monthlyEquivalent = paidPlan.price_monthly * 12;
    if (monthlyEquivalent > paidPlan.current_price_yearly) {
      const monthsSaved = Math.round((monthlyEquivalent - paidPlan.current_price_yearly) / paidPlan.price_monthly);
      if (monthsSaved > 0) {
        return `省 ${monthsSaved} 个月`;
      }
    }

    return null;
  };

  // Simplify multi-level feature display
  // If all unlimited -> "无限制请求"
  // If some have limits -> "较少次数限制"
  // If all disabled -> "-"
  const formatMultiLevelFeature = (low, mid, high) => {
    const features = [low, mid, high].filter(f => f && f !== '-');

    // All disabled
    if (features.length === 0) {
      return '-';
    }

    // Check if all are unlimited
    const allUnlimited = features.every(f =>
      f.includes('无限制') || f.includes('unlimited') || f === '不限'
    );

    if (allUnlimited) {
      return '无限制请求';
    }

    // Some have limits
    return '较少次数限制';
  };

  // Generate dynamic comparison data from plans
  const getComparisonData = () => {
    if (plans.length === 0) return { sections: [] };

    // Find plans by code for easy access
    const plansByCode = {};
    plans.forEach(plan => {
      plansByCode[plan.plan_code] = plan;
    });

    const freePlan = plansByCode['free'];
    const proPlan = plansByCode['pro'];
    const maxPlan = plansByCode['max'];

    if (!freePlan || !proPlan || !maxPlan) {
      return { sections: [] };
    }

    return {
      sections: [
        {
          title: '核心功能',
          features: [
            {
              name: '普通搜索',
              free: freePlan.features?.normal_search?.description || '无限制',
              pro: proPlan.features?.normal_search?.description || '无限制',
              max: maxPlan.features?.normal_search?.description || '无限制'
            },
            { name: '聊天历史记录', free: true, pro: true, max: true },
            { name: '访问网页、iOS 和 Android 应用', free: true, pro: true, max: true },
          ]
        },
        {
          title: 'AI 模型',
          features: [
            {
              name: '高级搜索 - 低级模型',
              free: freePlan.features?.advanced_search_low?.description || '-',
              pro: proPlan.features?.advanced_search_low?.description || '-',
              max: maxPlan.features?.advanced_search_low?.description || '-'
            },
            {
              name: '高级搜索 - 中级模型',
              free: freePlan.features?.advanced_search_mid?.description || '-',
              pro: proPlan.features?.advanced_search_mid?.description || '-',
              max: maxPlan.features?.advanced_search_mid?.description || '-'
            },
            {
              name: '高级搜索 - 高级模型',
              free: freePlan.features?.advanced_search_high?.description || '-',
              pro: proPlan.features?.advanced_search_high?.description || '-',
              max: maxPlan.features?.advanced_search_high?.description || '-'
            },
            {
              name: 'AI 聊天 - 普通模型',
              free: freePlan.features?.ai_chat_normal?.description || '-',
              pro: proPlan.features?.ai_chat_normal?.description || '-',
              max: maxPlan.features?.ai_chat_normal?.description || '-'
            },
            {
              name: 'AI 聊天 - 中级模型',
              free: freePlan.features?.ai_chat_mid?.description || '-',
              pro: proPlan.features?.ai_chat_mid?.description || '-',
              max: maxPlan.features?.ai_chat_mid?.description || '-'
            },
            {
              name: 'AI 聊天 - 高级模型',
              free: freePlan.features?.ai_chat_high?.description || '-',
              pro: proPlan.features?.ai_chat_high?.description || '-',
              max: maxPlan.features?.ai_chat_high?.description || '-'
            },
          ]
        },
        {
          title: '数据与分析',
          features: [
            {
              name: '高级搜索数据',
              free: freePlan.features?.advanced_search_data?.enabled,
              pro: proPlan.features?.advanced_search_data?.enabled,
              max: maxPlan.features?.advanced_search_data?.enabled
            },
            {
              name: 'AI 对话历史数据',
              free: freePlan.features?.ai_history_data?.enabled,
              pro: proPlan.features?.ai_history_data?.enabled,
              max: maxPlan.features?.ai_history_data?.enabled
            },
          ]
        }
      ]
    };
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
      {/* Header with Logo - fixed at top, full width */}
      <div
        className="pricing-top-header"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          zIndex: 1000,
          background: '#212121',
          padding: '20px 24px'
        }}
      >
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
            按年付费 {getYearlyDiscountText() && <span className="save-badge">{getYearlyDiscountText()}</span>}
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
                  {plan.plan_code === 'free' && '体验基础学术搜索能力，开启研究之旅'}
                  {plan.plan_code === 'pro' && '为学术研究提供更高级的AI分析能力'}
                  {plan.plan_code === 'max' && '提供最全面的学术研究工具和无限制访问'}
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
                    <span className="feature-label">高级搜索：</span>
                    <span className="feature-value">
                      {formatMultiLevelFeature(
                        plan.features.advanced_search_low.description,
                        plan.features.advanced_search_mid.description,
                        plan.features.advanced_search_high.description
                      )}
                    </span>
                  </li>
                  <li>
                    <span className="feature-label">AI 聊天：</span>
                    <span className="feature-value">
                      {formatMultiLevelFeature(
                        plan.features.ai_chat_normal.description,
                        plan.features.ai_chat_mid.description,
                        plan.features.ai_chat_high.description
                      )}
                    </span>
                  </li>
                </ul>
              </div>

              <div className="plan-action">
                {(() => {
                  const buttonInfo = getPlanButtonInfo(plan.plan_code);

                  // Determine button CSS class based on action
                  let buttonClass = 'btn-upgrade';
                  if (buttonInfo.disabled) {
                    buttonClass = buttonInfo.action === 'none' && plan.plan_code === 'free' ? 'btn-free' : 'btn-current';
                  } else if (buttonInfo.action === 'renew') {
                    buttonClass = 'btn-renew';
                  }

                  return (
                    <button
                      className={buttonClass}
                      onClick={() => handlePlanAction(plan.plan_code, buttonInfo.action)}
                      disabled={buttonInfo.disabled}
                    >
                      {buttonInfo.text}
                    </button>
                  );
                })()}
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

          {getComparisonData().sections.map((section, sectionIndex) => (
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

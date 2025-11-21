import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/ToastContainer';
import AuthModal from '../components/AuthModal';
import './Pricing.css';

const PLAN_DISPLAY_ORDER = ['free', 'pro', 'max'];

const HERO_STATS = [
  { value: '2亿+', label: '可检索文献' },
  { value: '< 10 秒', label: '平均响应时间' },
  { value: '99.9%', label: '服务可用率' }
];

const HERO_CARD_BULLETS = [
  '批量摘要与引用溯源',
  '多模态搜索 + 对话',
  '团队共享与历史同步'
];

const PLAN_DESCRIPTIONS = {
  free: '体验基础检索与 AI 问答，快速验证灵感',
  pro: '稳定调用高级模型，满足日常深入研究',
  max: '无限访问与最强模型，覆盖高频科研场景'
};

const PLAN_BADGES = {
  pro: '最受欢迎',
  max: '旗舰方案'
};

const FAQ_ITEMS = [
  {
    question: '如何升级我的订阅？',
    answer: '点击任意付费方案的“立即订阅”或“升级至此方案”按钮即可完成升级，支付成功后立即生效。'
  },
  {
    question: '订阅会自动续费吗？',
    answer: '目前订阅不会自动续费，到期前我们会提醒您手动续费，也可在订阅管理页查看到期时间。'
  },
  {
    question: '我可以随时取消订阅吗？',
    answer: '可以。取消后将在当前订阅周期结束时生效，期间仍可继续使用已付费的所有服务。'
  },
  {
    question: '支持哪些支付方式？',
    answer: '我们支持支付宝等方式，陆续推出更多支付方式，确保支付过程安全可靠。'
  }
];

const formatPrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return '--';
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return value;
  }
  if (Number.isInteger(numeric)) {
    return numeric.toString();
  }
  return numeric.toFixed(2);
};

const getPlanDescription = (planCode) => PLAN_DESCRIPTIONS[planCode] || '保持高效研究节奏';
const getPlanBadge = (planCode) => PLAN_BADGES[planCode];
const Pricing = () => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly'); // monthly or yearly
  const [showAuthModal, setShowAuthModal] = useState(false);

  const scrollToPlans = () => {
    const section = document.getElementById('plans-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fetchPlans = useCallback(async () => {
    try {
      const response = await api.get('/user/subscription/plans');
      if (response.data.code === 0) {
        setPlans(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      showError('获取套餐列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const fetchCurrentSubscription = useCallback(async () => {
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
      showError('获取当前订阅信息失败，请稍后重试');
    }
  }, [showError]);

  useEffect(() => {
    document.body.classList.add('pricing-page-active');
    return () => {
      document.body.classList.remove('pricing-page-active');
    };
  }, []);

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
  }, [fetchPlans, fetchCurrentSubscription]);

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

    // Navigate to order confirmation page with plan details (order will be created on payment)
    navigate('/order-confirmation', {
      state: {
        planCode,
        billingCycle
      }
    });
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
      return plan.price_monthly ?? plan.current_price_monthly ?? 0;
    }
    // For yearly: original total is always monthly price × 12
    const monthlyBase = plan.current_price_monthly ?? plan.price_monthly ?? 0;
    return Number((monthlyBase * 12).toFixed(2));
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

  const getPlanFeatureList = (plan) => {
    const featureSet = plan.features || {};
    const features = [
      {
        key: 'normal',
        label: '学术检索',
        value: featureSet.normal_search?.description || '无限制'
      },
      {
        key: 'advanced',
        label: '智能分析',
        value: formatMultiLevelFeature(
          featureSet.advanced_search_low?.description,
          featureSet.advanced_search_mid?.description,
          featureSet.advanced_search_high?.description
        )
      },
      {
        key: 'chat',
        label: 'AI 聊天',
        value: formatMultiLevelFeature(
          featureSet.ai_chat_normal?.description,
          featureSet.ai_chat_mid?.description,
          featureSet.ai_chat_high?.description
        )
      },
      {
        key: 'history',
        label: '历史记录',
        value: featureSet.ai_history_data?.enabled ? '云端同步与多端共享' : '最近会话'
      },
      {
        key: 'data',
        label: '数据洞察',
        value: featureSet.advanced_search_data?.enabled ? '智能分析数据导出' : '基础使用统计'
      }
    ];

    if (plan.plan_code === 'max') {
      features.push({
        key: 'early-access',
        label: '提前尝鲜新功能',
        value: '优先体验最新能力'
      });
    }

    return features;
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
              name: '学术检索',
              free: freePlan.features?.normal_search?.description || '无限制',
              pro: proPlan.features?.normal_search?.description || '无限制',
              max: maxPlan.features?.normal_search?.description || '无限制'
            },
            { name: '聊天历史记录', free: true, pro: true, max: true },
            { name: '访问网页、移动端应用', free: true, pro: true, max: true },
          ]
        },
        {
          title: 'AI 模型',
          features: [
            {
              name: '智能分析 - 低级模型',
              free: freePlan.features?.advanced_search_low?.description || '-',
              pro: proPlan.features?.advanced_search_low?.description || '-',
              max: maxPlan.features?.advanced_search_low?.description || '-'
            },
            {
              name: '智能分析 - 中级模型',
              free: freePlan.features?.advanced_search_mid?.description || '-',
              pro: proPlan.features?.advanced_search_mid?.description || '-',
              max: maxPlan.features?.advanced_search_mid?.description || '-'
            },
            {
              name: '智能分析 - 高级模型',
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
              name: '智能分析数据',
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

  const yearlyDiscountText = getYearlyDiscountText();
  const comparisonData = getComparisonData();
  const orderedPlans = PLAN_DISPLAY_ORDER
    .map(code => plans.find(plan => plan.plan_code === code))
    .filter(Boolean);
  const remainingPlans = plans.filter(plan => !PLAN_DISPLAY_ORDER.includes(plan.plan_code));
  const finalPlans = [...orderedPlans, ...remainingPlans];
  const showcasePlan = finalPlans.find(plan => plan.plan_code === 'pro') || finalPlans[0];

  if (loading) {
    return (
      <div className="pricing-page">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="pricing-page">
      <div className="pricing-nav">
        <div className="nav-logo" onClick={() => navigate('/')}>
          <img src="/logo.png" alt="Scholay" />
          <span>Scholay</span>
        </div>
        <div className="nav-actions">
          <button type="button" className="nav-link" onClick={() => navigate('/')}>
            返回首页
          </button>
          <button type="button" className="nav-cta" onClick={scrollToPlans}>
            查看套餐
          </button>
        </div>
      </div>

      <main className="pricing-main">
        <section className="pricing-hero">
          <div className="hero-grid">
            <div className="hero-content">
              <span className="hero-pill">针对学术研究优化</span>
              <h1>升级到更懂你的 AI 学术助手</h1>
              <p className="hero-subtitle">
                多模型协作、深度引用链追踪与团队共享，帮助你更快完成文献筛选、综述撰写与灵感验证。
              </p>

              <div className="hero-actions">
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
                    按年付费 {yearlyDiscountText && <span className="save-badge">{yearlyDiscountText}</span>}
                  </button>
                </div>
                <span className="billing-hint">
                  {billingCycle === 'yearly'
                    ? `按年支付${yearlyDiscountText ? ` · ${yearlyDiscountText}` : ' · 低至 8.5 折'}`
                    : '按月结算 · 随时升级或取消'}
                </span>
              </div>

              <div className="hero-meta">
                {HERO_STATS.map(stat => (
                  <div key={stat.label} className="hero-meta-item">
                    <span className="hero-meta-value">{stat.value}</span>
                    <span className="hero-meta-label">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-showcase">
              <div className="hero-card">
                <div className="hero-card-header">
                  <span>即时体验</span>
                  <p>智能提炼要点、生成引用，并保持多终端同步。</p>
                </div>
                <div className="hero-card-body">
                  <h3>{showcasePlan ? `${showcasePlan.plan_name} 套餐` : '升级套餐'}</h3>
                  {showcasePlan && (
                    <div className="hero-card-price">
                      <span className="currency">¥</span>
                      <span className="amount">
                        {formatPrice(
                          billingCycle === 'monthly'
                            ? getPricePerMonth(showcasePlan)
                            : getTotalPrice(showcasePlan)
                        )}
                      </span>
                      <span className="period">{billingCycle === 'monthly' ? '/月' : '/年'}</span>
                    </div>
                  )}
                  <ul>
                    {HERO_CARD_BULLETS.map(bullet => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
                <div className="hero-card-footer">
                  <span>覆盖 PRO / MAX 的全部高级模型</span>
                  <button type="button" onClick={scrollToPlans}>查看方案</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="plans-section" className="plan-grid-section">
          <div className="section-heading">
            <div>
              <h2>根据研究节奏选择方案</h2>
            </div>
            <p className="section-description">
              从基础体验到高频研究，灵活切换；将支持团队扩展以及 API 联动。
            </p>
          </div>
          <div className="plan-grid">
            {finalPlans.length === 0 ? (
              <div className="empty-state">暂无可用套餐，请稍后再试。</div>
            ) : (
              finalPlans.map(plan => {
                const buttonInfo = getPlanButtonInfo(plan.plan_code);
                const planBadge = getPlanBadge(plan.plan_code);
                const isCurrent = isCurrentPlan(plan.plan_code);
                const isFreePlan = plan.price_monthly === 0 && plan.price_yearly === 0;
                const displayPrice = billingCycle === 'monthly'
                  ? plan.current_price_monthly ?? plan.price_monthly ?? 0
                  : getTotalPrice(plan) ?? 0;
                const originalPrice = billingCycle === 'monthly'
                  ? plan.price_monthly ?? plan.current_price_monthly ?? 0
                  : getOriginalTotalPrice(plan);
                const showOriginalPrice = hasDiscount(plan) && Number(originalPrice) > Number(displayPrice);
                const savingsValue = showOriginalPrice ? Number(originalPrice) - Number(displayPrice) : 0;

                let buttonClass = 'btn-upgrade';
                if (buttonInfo.disabled) {
                  buttonClass = buttonInfo.action === 'none' && plan.plan_code === 'free' ? 'btn-free' : 'btn-current';
                } else if (buttonInfo.action === 'renew') {
                  buttonClass = 'btn-renew';
                }

                return (
                  <article
                    key={plan.plan_code}
                    className={`plan-card plan-${plan.plan_code} ${isCurrent ? 'is-current' : ''}`}
                  >
                    <div className="plan-card-header">
                      <div className="plan-name-row">
                        <span className="plan-name">{plan.plan_name}</span>
                        {planBadge && <span className="plan-badge">{planBadge}</span>}
                      </div>
                      <p className="plan-description">{getPlanDescription(plan.plan_code)}</p>
                      {isCurrent && <span className="current-chip">当前订阅</span>}
                    </div>

                    <div className="plan-price-block">
                      {showOriginalPrice && (
                        <div className="original-price">
                          <span className="currency">¥</span>
                          <span className="amount">{formatPrice(originalPrice)}</span>
                          <span className="period">{billingCycle === 'monthly' ? '/月' : '/年'}</span>
                        </div>
                      )}
                      <div className="price-amount">
                        <span className="currency">¥</span>
                        <span className="amount">{formatPrice(displayPrice)}</span>
                        <span className="period">{billingCycle === 'monthly' ? '/月' : '/年'}</span>
                      </div>
                      {!isFreePlan && (
                        <p className="plan-total">
                          {billingCycle === 'yearly'
                            ? `折合 ¥${formatPrice(getPricePerMonth(plan))}/月`
                            : '按月结算 · 随时升级'}
                          {savingsValue > 0 && (
                            <span className="plan-savings">节省 ¥{formatPrice(savingsValue)}</span>
                          )}
                        </p>
                      )}
                    </div>

                    <ul className="plan-feature-list">
                      {getPlanFeatureList(plan).map(feature => (
                        <li key={feature.key}>
                          <span className="feature-name">{feature.label}</span>
                          <span className="feature-desc">{feature.value}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="plan-cta">
                      <button
                        className={buttonClass}
                        onClick={() => handlePlanAction(plan.plan_code, buttonInfo.action)}
                        disabled={buttonInfo.disabled}
                      >
                        {buttonInfo.text}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {comparisonData.sections.length > 0 && (
          <section className="plan-comparison">
            <div className="comparison-heading">
              <h2>细致比较每项能力</h2>
              <p>了解不同套餐在模型、配额与协作能力上的差异，帮助你快速决策。</p>
            </div>
            <div className="comparison-plan-cards">
              {finalPlans.map(plan => (
                <div key={plan.plan_code} className="comparison-plan-card">
                  <p className="plan-tier-label">{plan.plan_name}</p>
                  <p className="plan-tier-price">
                    {plan.plan_code === 'free'
                      ? '免费使用'
                      : `¥${formatPrice(plan.current_price_monthly ?? plan.price_monthly ?? 0)}/月`}
                  </p>
                  <button
                    className={`plan-tier-btn ${plan.plan_code === 'free' ? 'btn-free' : 'btn-upgrade'}`}
                    onClick={() => handlePlanAction(plan.plan_code, plan.plan_code === 'free' ? 'none' : 'subscribe')}
                  >
                    {plan.plan_code === 'free' ? '免费使用' : '立即订阅'}
                  </button>
                </div>
              ))}
            </div>
            <div className="comparison-table">
              <div className="table-header">
                <div className="table-header-cell">功能</div>
                {['free', 'pro', 'max'].map(code => {
                  const plan = plans.find(p => p.plan_code === code);
                  return (
                    <div key={code} className="table-header-cell">
                      {plan ? plan.plan_name : code.toUpperCase()}
                    </div>
                  );
                })}
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
          </section>
        )}

        <section className="pricing-faq">
          <div className="section-heading">
            <p className="section-eyebrow">常见问题</p>
            <h2>关于订阅的更多解答</h2>
            <p className="section-description">
              如果还有疑问，随时联系支持团队，我们会第一时间响应。
            </p>
          </div>
          <div className="faq-grid">
            {FAQ_ITEMS.map(item => (
              <div key={item.question} className="faq-item">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default Pricing;

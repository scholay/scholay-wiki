import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api from '../services/api';
import AppSidebar from '../components/AppSidebar';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [activeTab, setActiveTab] = useState('profile'); // profile, account, ai, highlight, subscription
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile form state
  const [profile, setProfile] = useState({
    name: '',
    userId: '',
    bio: ''
  });

  // Account security form state
  const [accountForm, setAccountForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Subscription state
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    fetchUserProfile();
    fetchSubscriptionData();
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (activeTab === 'subscription') {
      fetchSubscriptionData();
    }
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const fetchUserProfile = async () => {
    try {
      // Assuming there's an API endpoint to get user profile
      // For now, we'll use the user data from AuthContext
      if (user) {
        setProfile({
          name: user.username || user.email || '',
          userId: user.id || '',
          bio: user.bio || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  };

  const fetchSubscriptionData = async () => {
    try {
      setSubscriptionLoading(true);

      // Fetch current subscription
      const subResponse = await api.get('/user/subscription/my');
      if (subResponse.data.code === 0) {
        setCurrentSubscription(subResponse.data.data);
      }

      // Fetch available plans
      const plansResponse = await api.get('/user/subscription/plans');
      if (plansResponse.data.code === 0) {
        setAvailablePlans(plansResponse.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription data:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleProfileSave = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // API call to update profile
      const response = await api.put('/user/profile', {
        username: profile.name,
        bio: profile.bio
      });

      if (response.data.code === 0) {
        setMessage({ type: 'success', text: '个人信息已保存' });
      } else {
        setMessage({ type: 'error', text: '保存失败：' + response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败，请稍后重试' });
      console.error('Failed to update profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' });
      return;
    }

    if (accountForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: '新密码长度至少为8个字符' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await api.post('/user/change-password', {
        current_password: accountForm.currentPassword,
        new_password: accountForm.newPassword
      });

      if (response.data.code === 0) {
        setMessage({ type: 'success', text: '密码修改成功' });
        setAccountForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setMessage({ type: 'error', text: '密码修改失败：' + response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '密码修改失败，请稍后重试' });
      console.error('Failed to change password:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planCode) => {
    setSubscriptionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const duration = billingCycle === 'monthly' ? 1 : 12;
      const response = await api.post('/user/subscription/upgrade', {
        plan_code: planCode,
        duration: duration
      });

      if (response.data.code === 0) {
        setMessage({ type: 'success', text: '订阅成功！' });
        fetchSubscriptionData();
      } else {
        setMessage({ type: 'error', text: '订阅失败：' + response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '订阅失败，请稍后重试' });
      console.error('Failed to subscribe:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!currentSubscription) return;

    setSubscriptionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const duration = billingCycle === 'monthly' ? 1 : 12;
      const response = await api.post('/user/subscription/renew', {
        duration: duration
      });

      if (response.data.code === 0) {
        setMessage({ type: 'success', text: '续期成功！' });
        fetchSubscriptionData();
      } else {
        setMessage({ type: 'error', text: '续期失败：' + response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '续期失败，请稍后重试' });
      console.error('Failed to renew:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const getPlanPrice = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    return plan.price_yearly;
  };

  const getPricePerMonth = (plan) => {
    if (billingCycle === 'monthly') {
      return plan.price_monthly;
    }
    return (plan.price_yearly / 12).toFixed(2);
  };

  const canUpgradeTo = (planCode) => {
    if (!currentSubscription) return planCode !== 'free';

    const planOrder = { 'free': 0, 'pro': 1, 'max': 2 };
    return planOrder[planCode] > planOrder[currentSubscription.plan_code];
  };

  const isCurrentPlan = (planCode) => {
    return currentSubscription && currentSubscription.plan_code === planCode;
  };

  const renderProfileTab = () => (
    <div className="settings-section">
      <h2>我的介绍</h2>

      <div className="profile-avatar-section">
        <div className="avatar-wrapper">
          <div className="avatar-circle">
            {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <button className="avatar-edit-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>名字</label>
        <div className="input-with-clear">
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="输入你的名字"
          />
          {profile.name && (
            <button
              className="clear-btn"
              onClick={() => setProfile({ ...profile, name: '' })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>用户号</label>
        <div className="input-with-clear">
          <input
            type="text"
            value={profile.userId}
            readOnly
            disabled
            placeholder="自动生成"
          />
          {profile.userId && (
            <button className="clear-btn" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>简介</label>
        <textarea
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          placeholder="介绍一下自己"
          rows="4"
        />
      </div>

      <button
        className="btn-save"
        onClick={handleProfileSave}
        disabled={loading}
      >
        {loading ? '保存中...' : '保存'}
      </button>
    </div>
  );

  const renderAccountTab = () => (
    <div className="settings-section">
      <h2>账户管理</h2>

      <div className="account-info-card">
        <div className="info-row">
          <span className="info-label">登录邮箱</span>
          <span className="info-value">{user?.email || '未设置'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">账号创建时间</span>
          <span className="info-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '未知'}</span>
        </div>
      </div>

      <h3>修改密码</h3>

      <div className="form-group">
        <label>当前密码</label>
        <input
          type="password"
          value={accountForm.currentPassword}
          onChange={(e) => setAccountForm({ ...accountForm, currentPassword: e.target.value })}
          placeholder="输入当前密码"
        />
      </div>

      <div className="form-group">
        <label>新密码</label>
        <input
          type="password"
          value={accountForm.newPassword}
          onChange={(e) => setAccountForm({ ...accountForm, newPassword: e.target.value })}
          placeholder="输入新密码（至少8个字符）"
        />
      </div>

      <div className="form-group">
        <label>确认新密码</label>
        <input
          type="password"
          value={accountForm.confirmPassword}
          onChange={(e) => setAccountForm({ ...accountForm, confirmPassword: e.target.value })}
          placeholder="再次输入新密码"
        />
      </div>

      <button
        className="btn-save"
        onClick={handlePasswordChange}
        disabled={loading || !accountForm.currentPassword || !accountForm.newPassword}
      >
        {loading ? '修改中...' : '修改密码'}
      </button>
    </div>
  );

  const renderAITab = () => (
    <div className="settings-section">
      <h2>AI设置</h2>
      <div className="coming-soon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <circle cx="12" cy="8" r="0.5" fill="currentColor"/>
        </svg>
        <p>AI模型偏好设置即将推出</p>
      </div>
    </div>
  );

  const renderHighlightTab = () => (
    <div className="settings-section">
      <h2>Highlight设置</h2>
      <div className="coming-soon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <circle cx="12" cy="8" r="0.5" fill="currentColor"/>
        </svg>
        <p>文献高亮设置即将推出</p>
      </div>
    </div>
  );

  const renderSubscriptionTab = () => {
    if (subscriptionLoading) {
      return (
        <div className="settings-section">
          <h2>订阅管理</h2>
          <div className="subscription-loading">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-section subscription-section">
        <h2>订阅管理</h2>

        {/* Current Plan Card */}
        {currentSubscription && (
          <div className="current-subscription-card">
            <div className="subscription-header">
              <div>
                <h3>当前订阅</h3>
                <div className="plan-badge-container">
                  <span className={`plan-badge plan-badge-${currentSubscription.plan_code}`}>
                    {currentSubscription.plan_name}
                  </span>
                  {currentSubscription.plan_code !== 'free' && currentSubscription.end_date && (
                    <span className="expiry-date">
                      到期: {new Date(currentSubscription.end_date).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
              {currentSubscription.plan_code !== 'free' && (
                <button className="btn-renew" onClick={handleRenew} disabled={subscriptionLoading}>
                  续期订阅
                </button>
              )}
            </div>

            {/* Plan Features */}
            {currentSubscription.features && (
              <div className="subscription-features">
                <div className="feature-grid">
                  <div className="feature-col">
                    <h4>搜索功能</h4>
                    <div className="feature-list">
                      <div className="feature-item-small">
                        <span className="feature-label">普通搜索</span>
                        <span className="feature-value">{currentSubscription.features.normal_search?.description}</span>
                      </div>
                      <div className="feature-item-small">
                        <span className="feature-label">高级搜索（低模）</span>
                        <span className="feature-value">{currentSubscription.features.advanced_search_low?.description}</span>
                      </div>
                      <div className="feature-item-small">
                        <span className="feature-label">高级搜索（中模）</span>
                        <span className="feature-value">{currentSubscription.features.advanced_search_mid?.description}</span>
                      </div>
                      <div className="feature-item-small">
                        <span className="feature-label">高级搜索（高模）</span>
                        <span className="feature-value">{currentSubscription.features.advanced_search_high?.description}</span>
                      </div>
                    </div>
                  </div>
                  <div className="feature-col">
                    <h4>AI对话</h4>
                    <div className="feature-list">
                      <div className="feature-item-small">
                        <span className="feature-label">普通模型</span>
                        <span className="feature-value">{currentSubscription.features.ai_chat_normal?.description}</span>
                      </div>
                      <div className="feature-item-small">
                        <span className="feature-label">中级模型</span>
                        <span className="feature-value">{currentSubscription.features.ai_chat_mid?.description}</span>
                      </div>
                      <div className="feature-item-small">
                        <span className="feature-label">高级模型</span>
                        <span className="feature-value">{currentSubscription.features.ai_chat_high?.description}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upgrade Section */}
        {currentSubscription && currentSubscription.plan_code !== 'max' && (
          <div className="upgrade-section">
            <h3>升级订阅</h3>
            <p className="upgrade-desc">选择更高级别的套餐，享受更多功能</p>

            {/* Billing Cycle Toggle */}
            <div className="billing-cycle-toggle">
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
                按年付费 <span className="save-tag">省 2 个月</span>
              </button>
            </div>

            {/* Available Plans */}
            <div className="subscription-plans">
              {availablePlans
                .filter(plan => canUpgradeTo(plan.plan_code))
                .map(plan => (
                  <div key={plan.plan_code} className={`subscription-plan-card ${plan.plan_code === 'pro' ? 'recommended' : ''}`}>
                    {plan.plan_code === 'pro' && (
                      <div className="recommended-badge">推荐</div>
                    )}
                    <div className="plan-header">
                      <h4>{plan.plan_name}</h4>
                      <div className="plan-price">
                        <span className="price-currency">¥</span>
                        <span className="price-amount">{getPricePerMonth(plan)}</span>
                        <span className="price-period">/月</span>
                      </div>
                      {billingCycle === 'yearly' && (
                        <div className="total-price">年付 ¥{plan.price_yearly}</div>
                      )}
                    </div>

                    <div className="plan-features-list">
                      <div className="plan-feature">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>高级搜索: {plan.features.advanced_search_high?.description}</span>
                      </div>
                      <div className="plan-feature">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>AI对话: {plan.features.ai_chat_high?.description}</span>
                      </div>
                      <div className="plan-feature">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>无限制普通搜索</span>
                      </div>
                    </div>

                    <button
                      className="btn-subscribe"
                      onClick={() => handleSubscribe(plan.plan_code)}
                      disabled={subscriptionLoading}
                    >
                      {isCurrentPlan(plan.plan_code) ? '当前方案' : '升级至此方案'}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Link to Full Subscription Management */}
        <div className="subscription-link">
          <p>查看完整的订阅管理和账单历史</p>
          <button
            className="btn-link"
            onClick={() => navigate('/subscription')}
          >
            前往订阅管理
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const renderExternalLinks = () => (
    <div className="settings-section external-links">
      <a href="#" className="external-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span>公告</span>
      </a>
      <a href="#" className="external-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="10" r="3"/>
          <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
        </svg>
        <span>客户</span>
      </a>
      <a href="#" className="external-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>服务条款</span>
      </a>
      <a href="#" className="external-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>隐私政策</span>
      </a>
      <a href="#" className="external-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <span>用户指南</span>
      </a>
    </div>
  );

  const renderLogoutSection = () => (
    <div className="settings-section logout-section">
      <button className="btn-logout" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>注销登录</span>
      </button>
    </div>
  );

  return (
    <div className="settings-page">
      {isAuthenticated && (
        <AppSidebar
          user={user}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showHistory={false}
        />
      )}

      <div className={`settings-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
        <div className="settings-layout">
          {/* Left Sidebar */}
          <div className="settings-sidebar">
            <h1 className="settings-title">设置</h1>

            <div className="settings-menu">
              <div className="menu-section">
                <div className="menu-section-title">我的账户</div>
                <button
                  className={`menu-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => setActiveTab('profile')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="12" cy="10" r="3"/>
                    <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
                  </svg>
                  <span>我的介绍</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'account' ? 'active' : ''}`}
                  onClick={() => setActiveTab('account')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span>账户管理</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'ai' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ai')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
                    <polyline points="7.5 19.79 7.5 14.6 3 12"/>
                    <polyline points="21 12 16.5 14.6 16.5 19.79"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                  <span>AI设置</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'highlight' ? 'active' : ''}`}
                  onClick={() => setActiveTab('highlight')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  <span>Highlight设置</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'subscription' ? 'active' : ''}`}
                  onClick={() => setActiveTab('subscription')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="6" width="18" height="14" rx="2" ry="2"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                    <line x1="7" y1="14" x2="7.01" y2="14"/>
                    <line x1="11" y1="14" x2="13" y2="14"/>
                  </svg>
                  <span>订阅</span>
                </button>
              </div>

              {renderExternalLinks()}
              {renderLogoutSection()}
            </div>
          </div>

          {/* Right Content */}
          <div className="settings-content">
            {message.text && (
              <div className={`message message-${message.type}`}>
                {message.text}
              </div>
            )}

            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'account' && renderAccountTab()}
            {activeTab === 'ai' && renderAITab()}
            {activeTab === 'highlight' && renderHighlightTab()}
            {activeTab === 'subscription' && renderSubscriptionTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

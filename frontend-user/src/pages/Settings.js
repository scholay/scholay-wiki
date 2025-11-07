import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/ToastContainer';
import api, { orderAPI, paymentAPI } from '../services/api';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();

  const [activeTab, setActiveTab] = useState('profile'); // profile, account, ai, highlight, subscription, legal
  const [loading, setLoading] = useState(false);

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

  // Binding form state
  const [bindPhone, setBindPhone] = useState('');
  const [bindEmail, setBindEmail] = useState('');
  const [bindPhoneCode, setBindPhoneCode] = useState('');
  const [bindEmailCode, setBindEmailCode] = useState('');
  const [phoneCodeCountdown, setPhoneCodeCountdown] = useState(0);
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);

  // Account management modal state
  const [accountModal, setAccountModal] = useState({
    show: false,
    type: '', // 'bind-email', 'bind-phone', 'bind-wechat', 'unbind-email', 'unbind-phone', 'unbind-wechat', 'rebind-email', 'rebind-phone'
    title: '',
    currentValue: '', // for unbind/rebind
    step: 1 // 1 = enter email/phone, 2 = enter verification code
  });
  const [modalForm, setModalForm] = useState({
    email: '',
    phone: '',
    code: '',
    password: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [modalCodeCountdown, setModalCodeCountdown] = useState(0);

  // Subscription state
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Legal documents state
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [termsOfService, setTermsOfService] = useState('');
  const [legalLoading, setLegalLoading] = useState(false);

  useEffect(() => {
    // Allow authenticated users to stay on this page
    // No redirect needed - if not authenticated, they can still view the page structure
    if (isAuthenticated) {
      fetchUserProfile();
      fetchSubscriptionData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === 'subscription') {
      fetchSubscriptionData();
    } else if (activeTab === 'legal') {
      fetchLegalDocuments();
    }
  }, [activeTab]);


  // Countdown for phone code
  useEffect(() => {
    if (phoneCodeCountdown > 0) {
      const timer = setTimeout(() => setPhoneCodeCountdown(phoneCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneCodeCountdown]);

  // Countdown for email code
  useEffect(() => {
    if (emailCodeCountdown > 0) {
      const timer = setTimeout(() => setEmailCodeCountdown(emailCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [emailCodeCountdown]);

  // Countdown for modal code
  useEffect(() => {
    if (modalCodeCountdown > 0) {
      const timer = setTimeout(() => setModalCodeCountdown(modalCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [modalCodeCountdown]);

  const fetchUserProfile = async () => {
    try {
      // Call refreshUser to get latest data from backend
      const userData = await refreshUser();
      if (userData) {
        setProfile({
          name: userData.username || userData.email || '',
          userId: userData.id || '',
          bio: userData.bio || ''
        });
      } else if (user) {
        // Fallback to cached user data
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

  const fetchLegalDocuments = async () => {
    setLegalLoading(true);
    try {
      // Fetch privacy policy
      const privacyResponse = await fetch('/api/v1/config/privacy-policy');
      const privacyData = await privacyResponse.json();
      if (privacyData.code === 0 && privacyData.data) {
        setPrivacyPolicy(privacyData.data.content || '');
      }

      // Fetch terms of service
      const termsResponse = await fetch('/api/v1/config/terms-of-service');
      const termsData = await termsResponse.json();
      if (termsData.code === 0 && termsData.data) {
        setTermsOfService(termsData.data.content || '');
      }
    } catch (error) {
      console.error('Failed to fetch legal documents:', error);
      showError('加载法律条款失败');
    } finally {
      setLegalLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };


  const handleProfileSave = async () => {
    setLoading(true);

    try {
      // API call to update profile
      const response = await api.put('/user/profile', {
        username: profile.name,
        bio: profile.bio
      });

      if (response.data.code === 0) {
        showSuccess('个人信息已保存');
      } else {
        showError('保存失败：' + response.data.message);
      }
    } catch (error) {
      showError('保存失败，请稍后重试');
      console.error('Failed to update profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (accountForm.newPassword.length < 8) {
      showError('新密码长度至少为8个字符');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/change-password', {
        current_password: accountForm.currentPassword,
        new_password: accountForm.newPassword
      });

      if (response.data.code === 0) {
        showSuccess('密码修改成功');
        setAccountForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        showError('密码修改失败：' + response.data.message);
      }
    } catch (error) {
      showError('密码修改失败,请稍后重试');
      console.error('Failed to change password:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send phone verification code
  const handleSendPhoneCode = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }

    if (phoneCodeCountdown > 0) return;

    setLoading(true);

    try {
      const response = await api.post('/user/send-phone-code', {
        phone: bindPhone,
        purpose: 'bind'
      });

      if (response.data.code === 0) {
        setPhoneCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      console.error('Failed to send phone code:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send email verification code
  const handleSendEmailCode = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    if (emailCodeCountdown > 0) return;

    setLoading(true);

    try {
      const response = await api.post('/user/send-code', {
        email: bindEmail,
        purpose: 'bind'
      });

      if (response.data.code === 0) {
        setEmailCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      console.error('Failed to send email code:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bind phone
  const handleBindPhone = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }

    if (!bindPhoneCode) {
      showError('请输入验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/bind-phone', {
        phone: bindPhone,
        code: bindPhoneCode
      });

      if (response.data.code === 0) {
        showSuccess('手机号绑定成功');
        setBindPhone('');
        setBindPhoneCode('');
        // Refresh user profile
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      console.error('Failed to bind phone:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bind email
  const handleBindEmail = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    if (!bindEmailCode) {
      showError('请输入验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/bind-email', {
        email: bindEmail,
        code: bindEmailCode
      });

      if (response.data.code === 0) {
        showSuccess('邮箱绑定成功');
        setBindEmail('');
        setBindEmailCode('');
        // Refresh user profile
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      console.error('Failed to bind email:', error);
    } finally {
      setLoading(false);
    }
  };

  // WeChat binding
  const handleBindWeChat = async () => {
    try {
      // Generate random state for CSRF protection
      const state = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wechat_bind_state', state);
      localStorage.setItem('wechat_bind_mode', 'bind'); // Mark as binding mode

      // Get WeChat login URL from backend
      const response = await api.get('/user/wechat/login-url', { params: { state } });

      if (response.data.code === 0 && response.data.data) {
        const loginURL = response.data.data.login_url;
        // Redirect to WeChat OAuth page
        window.location.href = loginURL;
      } else {
        showError('获取微信登录链接失败');
      }
    } catch (err) {
      console.error('WeChat binding error:', err);
      showError('微信绑定失败,请稍后重试');
    }
  };

  // Count available login methods
  const getLoginMethodCount = () => {
    let count = 0;
    if (user?.email) count++;
    if (user?.phone) count++;
    if (user?.wechat_openid) count++;
    return count;
  };

  // Modal handlers
  const handleOpenModal = (type, currentValue) => {
    const titles = {
      'bind-email': '绑定邮箱',
      'bind-phone': '绑定手机号',
      'rebind-email': '换绑邮箱',
      'rebind-phone': '换绑手机号',
      'unbind-email': '解绑邮箱',
      'unbind-phone': '解绑手机号',
      'unbind-wechat': '解绑微信',
      'change-password': '修改密码'
    };

    setAccountModal({
      show: true,
      type,
      title: titles[type] || '',
      currentValue,
      step: 1 // Always start at step 1
    });

    // Reset form
    setModalForm({
      email: '',
      phone: '',
      code: '',
      password: '',
      newPassword: '',
      confirmPassword: ''
    });
    setModalCodeCountdown(0);
  };

  const handleCloseModal = () => {
    setAccountModal({
      show: false,
      type: '',
      title: '',
      currentValue: '',
      step: 1
    });
    setModalForm({
      email: '',
      phone: '',
      code: '',
      password: '',
      newPassword: '',
      confirmPassword: ''
    });
    setModalCodeCountdown(0);
  };

  // Check availability and proceed to step 2 (for bind/rebind operations)
  const handleCheckAvailability = async () => {
    const type = accountModal.type;
    setLoading(true);

    try {
      let response;

      if (type.includes('email')) {
        // Validate email format
        if (!modalForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForm.email)) {
          showError('请输入有效的邮箱地址');
          setLoading(false);
          return;
        }

        // Check email availability
        response = await api.post('/user/check-email-availability', {
          email: modalForm.email
        });
      } else if (type.includes('phone')) {
        // Validate phone format
        if (!modalForm.phone || !/^1[3-9]\d{9}$/.test(modalForm.phone)) {
          showError('请输入有效的手机号码');
          setLoading(false);
          return;
        }

        // Check phone availability
        response = await api.post('/user/check-phone-availability', {
          phone: modalForm.phone
        });
      }

      if (response && response.data.code === 0) {
        if (response.data.data.available) {
          // Available - proceed to step 2
          setAccountModal(prev => ({ ...prev, step: 2 }));
          showSuccess('验证通过,请继续输入验证码');
        } else {
          // Not available
          if (type.includes('email')) {
            showError('该邮箱已被其他账号绑定');
          } else {
            showError('该手机号已被其他账号绑定');
          }
        }
      } else {
        showError('检查失败：' + (response?.data?.message || '未知错误'));
      }
    } catch (error) {
      showError('检查失败,请稍后重试');
      console.error('Failed to check availability:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send modal verification code
  const handleSendModalCode = async () => {
    if (modalCodeCountdown > 0) return;

    const type = accountModal.type;
    let endpoint = '';
    let payload = {};
    let purpose = '';

    // Determine endpoint and purpose based on modal type
    if (type.includes('email')) {
      if (!modalForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForm.email)) {
        showError('请输入有效的邮箱地址');
        return;
      }
      endpoint = '/user/send-code';
      payload = { email: modalForm.email, purpose: type.includes('bind') ? 'bind' : 'unbind' };
    } else if (type.includes('phone')) {
      if (!modalForm.phone || !/^1[3-9]\d{9}$/.test(modalForm.phone)) {
        showError('请输入有效的手机号码');
        return;
      }
      endpoint = '/user/send-phone-code';
      payload = { phone: modalForm.phone, purpose: type.includes('bind') ? 'bind' : 'unbind' };
    }

    setLoading(true);

    try {
      const response = await api.post(endpoint, payload);

      if (response.data.code === 0) {
        setModalCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      console.error('Failed to send code:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle modal submit
  const handleModalSubmit = async () => {
    const type = accountModal.type;
    setLoading(true);

    try {
      let response;

      switch (type) {
        case 'bind-email':
          if (!modalForm.email || !modalForm.code) {
            showError('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-email', {
            email: modalForm.email,
            code: modalForm.code
          });
          break;

        case 'bind-phone':
          if (!modalForm.phone || !modalForm.code) {
            showError('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-phone', {
            phone: modalForm.phone,
            code: modalForm.code
          });
          break;

        case 'rebind-email':
          if (!modalForm.email || !modalForm.code) {
            showError('请填写完整信息');
            setLoading(false);
            return;
          }
          // Direct replacement - bind new email (will replace the old one)
          response = await api.post('/user/bind-email', {
            email: modalForm.email,
            code: modalForm.code
          });
          break;

        case 'rebind-phone':
          if (!modalForm.phone || !modalForm.code) {
            showError('请填写完整信息');
            setLoading(false);
            return;
          }
          // Direct replacement - bind new phone (will replace the old one)
          response = await api.post('/user/bind-phone', {
            phone: modalForm.phone,
            code: modalForm.code
          });
          break;

        case 'unbind-email':
          if (!modalForm.code) {
            showError('请输入验证码');
            setLoading(false);
            return;
          }
          response = await api.post('/user/unbind-email', { code: modalForm.code });
          break;

        case 'unbind-phone':
          if (!modalForm.code) {
            showError('请输入验证码');
            setLoading(false);
            return;
          }
          response = await api.post('/user/unbind-phone', { code: modalForm.code });
          break;

        case 'unbind-wechat':
          response = await api.post('/user/unbind-wechat');
          break;

        case 'change-password':
          if (!modalForm.password || !modalForm.newPassword || !modalForm.confirmPassword) {
            showError('请填写完整信息');
            setLoading(false);
            return;
          }
          if (modalForm.newPassword !== modalForm.confirmPassword) {
            showError('两次输入的密码不一致');
            setLoading(false);
            return;
          }
          if (modalForm.newPassword.length < 8) {
            showError('新密码长度至少为8个字符');
            setLoading(false);
            return;
          }
          response = await api.post('/user/change-password', {
            current_password: modalForm.password,
            new_password: modalForm.newPassword
          });
          break;

        default:
          setLoading(false);
          return;
      }

      if (response && response.data.code === 0) {
        showSuccess('操作成功');
        handleCloseModal();
        // Refresh user profile
        fetchUserProfile();
      } else {
        showError('操作失败：' + (response?.data?.message || '未知错误'));
      }
    } catch (error) {
      showError('操作失败,请稍后重试');
      console.error('Modal submit error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Render modal content based on type
  const renderModalContent = () => {
    const type = accountModal.type;
    const step = accountModal.step;

    if (type === 'bind-email' || type === 'rebind-email') {
      if (step === 1) {
        // Step 1: Enter email and check availability
        return (
          <>
            {type === 'rebind-email' && (
              <div className="modal-info">
                <p>当前邮箱: <strong>{accountModal.currentValue}</strong></p>
                <p>请输入新邮箱地址</p>
              </div>
            )}
            <div className="modal-form-group">
              <label>新邮箱地址</label>
              <input
                type="email"
                value={modalForm.email}
                onChange={(e) => setModalForm({ ...modalForm, email: e.target.value })}
                placeholder="输入邮箱地址"
              />
            </div>
            <button className="btn-modal-submit" onClick={handleCheckAvailability} disabled={loading}>
              {loading ? '检查中...' : '继续'}
            </button>
          </>
        );
      } else {
        // Step 2: Enter verification code
        return (
          <>
            <div className="modal-info">
              <p>邮箱: <strong>{modalForm.email}</strong></p>
              <button
                className="btn-link"
                onClick={() => setAccountModal(prev => ({ ...prev, step: 1 }))}
              >
                返回修改
              </button>
            </div>
            <div className="modal-form-group">
              <label>验证码</label>
              <div className="modal-code-input">
                <input
                  type="text"
                  value={modalForm.code}
                  onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                  placeholder="输入验证码"
                  maxLength={6}
                />
                <button
                  className="btn-send-code"
                  onClick={handleSendModalCode}
                  disabled={modalCodeCountdown > 0 || loading}
                >
                  {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
                </button>
              </div>
            </div>
            <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
              {loading ? '处理中...' : '确认'}
            </button>
          </>
        );
      }
    }

    if (type === 'bind-phone' || type === 'rebind-phone') {
      if (step === 1) {
        // Step 1: Enter phone and check availability
        return (
          <>
            {type === 'rebind-phone' && (
              <div className="modal-info">
                <p>当前手机号: <strong>{accountModal.currentValue}</strong></p>
                <p>请输入新手机号</p>
              </div>
            )}
            <div className="modal-form-group">
              <label>新手机号</label>
              <input
                type="tel"
                value={modalForm.phone}
                onChange={(e) => setModalForm({ ...modalForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="输入11位手机号码"
                maxLength={11}
              />
            </div>
            <button className="btn-modal-submit" onClick={handleCheckAvailability} disabled={loading}>
              {loading ? '检查中...' : '继续'}
            </button>
          </>
        );
      } else {
        // Step 2: Enter verification code
        return (
          <>
            <div className="modal-info">
              <p>手机号: <strong>{modalForm.phone}</strong></p>
              <button
                className="btn-link"
                onClick={() => setAccountModal(prev => ({ ...prev, step: 1 }))}
              >
                返回修改
              </button>
            </div>
            <div className="modal-form-group">
              <label>验证码</label>
              <div className="modal-code-input">
                <input
                  type="text"
                  value={modalForm.code}
                  onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                  placeholder="输入验证码"
                  maxLength={6}
                />
                <button
                  className="btn-send-code"
                  onClick={handleSendModalCode}
                  disabled={modalCodeCountdown > 0 || loading}
                >
                  {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
                </button>
              </div>
            </div>
            <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
              {loading ? '处理中...' : '确认'}
            </button>
          </>
        );
      }
    }

    if (type === 'unbind-email') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑邮箱: <strong>{accountModal.currentValue}</strong></p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <div className="modal-form-group">
            <label>验证码（将发送到当前邮箱）</label>
            <div className="modal-code-input">
              <input
                type="text"
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <button
                className="btn-send-code"
                onClick={async () => {
                  if (modalCodeCountdown > 0) return;
                  setLoading(true);
                  try {
                    const response = await api.post('/user/send-code', {
                      email: user.email,
                      purpose: 'unbind'
                    });
                    if (response.data.code === 0) {
                      setModalCodeCountdown(60);
                      showSuccess('验证码已发送');
                    } else {
                      showError(response.data.message);
                    }
                  } catch (err) {
                    showError('发送失败');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </button>
            </div>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-phone') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑手机号: <strong>{accountModal.currentValue}</strong></p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <div className="modal-form-group">
            <label>验证码（将发送到当前手机）</label>
            <div className="modal-code-input">
              <input
                type="text"
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <button
                className="btn-send-code"
                onClick={async () => {
                  if (modalCodeCountdown > 0) return;
                  setLoading(true);
                  try {
                    const response = await api.post('/user/send-phone-code', {
                      phone: user.phone,
                      purpose: 'unbind'
                    });
                    if (response.data.code === 0) {
                      setModalCodeCountdown(60);
                      showSuccess('验证码已发送');
                    } else {
                      showError(response.data.message);
                    }
                  } catch (err) {
                    showError('发送失败');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </button>
            </div>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-wechat') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑微信账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'change-password') {
      return (
        <>
          <div className="modal-form-group">
            <label>当前密码</label>
            <input
              type="password"
              value={modalForm.password}
              onChange={(e) => setModalForm({ ...modalForm, password: e.target.value })}
              placeholder="输入当前密码"
            />
          </div>
          <div className="modal-form-group">
            <label>新密码</label>
            <input
              type="password"
              value={modalForm.newPassword}
              onChange={(e) => setModalForm({ ...modalForm, newPassword: e.target.value })}
              placeholder="输入新密码（至少8个字符）"
            />
          </div>
          <div className="modal-form-group">
            <label>确认新密码</label>
            <input
              type="password"
              value={modalForm.confirmPassword}
              onChange={(e) => setModalForm({ ...modalForm, confirmPassword: e.target.value })}
              placeholder="再次输入新密码"
            />
          </div>
          <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认修改'}
          </button>
        </>
      );
    }

    return null;
  };

  const handleSubscribe = async (planCode) => {
    setSubscriptionLoading(true);

    try {
      // Create order
      const orderResponse = await orderAPI.createOrder(planCode, billingCycle);

      if (orderResponse.data.code !== 0 || !orderResponse.data.data) {
        showError('创建订单失败：' + (orderResponse.data.message || '未知错误'));
        setSubscriptionLoading(false);
        return;
      }

      const order = orderResponse.data.data;

      // Navigate to order confirmation page
      navigate('/order-confirmation', { state: { orderNo: order.order_no } });
    } catch (error) {
      showError('订阅失败，请稍后重试');
      console.error('Failed to subscribe:', error);
      setSubscriptionLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!currentSubscription) return;

    setSubscriptionLoading(true);

    try {
      // Create order for renewal (use current plan)
      const orderResponse = await orderAPI.createOrder(currentSubscription.plan_code, billingCycle);

      if (orderResponse.data.code !== 0 || !orderResponse.data.data) {
        showError('创建续期订单失败：' + (orderResponse.data.message || '未知错误'));
        setSubscriptionLoading(false);
        return;
      }

      const order = orderResponse.data.data;

      // Navigate to order confirmation page
      navigate('/order-confirmation', { state: { orderNo: order.order_no } });
    } catch (error) {
      showError('续期失败，请稍后重试');
      console.error('Failed to renew:', error);
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

      {/* Account Binding Cards */}
      <div className="account-bindings">
        {/* Email Card */}
        <div className="account-binding-card">
          <div className="binding-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">邮箱</div>
            <div className="binding-value">{user?.email || '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.email ? (
              <>
                <button className="btn-action btn-action-secondary" onClick={() => handleOpenModal('rebind-email', user.email)}>
                  换绑
                </button>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-email', user.email)}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={() => handleOpenModal('bind-email', '')}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* Phone Card */}
        <div className="account-binding-card">
          <div className="binding-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">手机号</div>
            <div className="binding-value">{user?.phone || '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.phone ? (
              <>
                <button className="btn-action btn-action-secondary" onClick={() => handleOpenModal('rebind-phone', user.phone)}>
                  换绑
                </button>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-phone', user.phone)}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={() => handleOpenModal('bind-phone', '')}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* WeChat Card */}
        <div className="account-binding-card">
          <div className="binding-icon binding-icon-wechat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">微信</div>
            <div className="binding-value">{user?.wechat_openid ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.wechat_openid ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-wechat', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindWeChat}>
                绑定
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Change Password Button */}
      <div className="password-change-section">
        <button className="btn-change-password" onClick={() => handleOpenModal('change-password', '')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>修改密码</span>
        </button>
      </div>

      {/* Account Modal */}
      {accountModal.show && (
        <div className="account-modal-overlay" onClick={handleCloseModal}>
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{accountModal.title}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {renderModalContent()}
            </div>
          </div>
        </div>
      )}
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

  const renderLegalTab = () => {
    return (
      <div className="tab-content">
        <h2>法律条款</h2>
        <p className="tab-description">查看我们的使用条款和隐私政策</p>

        {legalLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        ) : (
          <div className="legal-documents">
            <div className="legal-document-section">
              <h3 className="document-title">使用条款</h3>
              <div className="document-content">
                <pre className="legal-text">{termsOfService}</pre>
              </div>
            </div>

            <div className="legal-document-section">
              <h3 className="document-title">隐私政策</h3>
              <div className="document-content">
                <pre className="legal-text">{privacyPolicy}</pre>
              </div>
            </div>
          </div>
        )}
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
      <div className="settings-container">
        <div className="settings-layout">
          {/* Left Sidebar */}
          <div className="settings-sidebar">
            {/* Logo and Brand */}
            <div className="settings-brand">
              <div className="brand-logo">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="url(#gradient)" />
                  <path d="M8 9h8M8 12h8M8 15h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="gradient" x1="3" y1="3" x2="21" y2="21">
                      <stop offset="0%" stopColor="#10a37f" />
                      <stop offset="100%" stopColor="#1a7f64" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="brand-name">Scholar</span>
            </div>

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
                <button
                  className={`menu-item ${activeTab === 'legal' ? 'active' : ''}`}
                  onClick={() => setActiveTab('legal')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  <span>法律条款</span>
                </button>
              </div>

              {renderExternalLinks()}
              {renderLogoutSection()}
            </div>
          </div>

          {/* Right Content */}
          <div className="settings-content">
            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'account' && renderAccountTab()}
            {activeTab === 'ai' && renderAITab()}
            {activeTab === 'highlight' && renderHighlightTab()}
            {activeTab === 'subscription' && renderSubscriptionTab()}
            {activeTab === 'legal' && renderLegalTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

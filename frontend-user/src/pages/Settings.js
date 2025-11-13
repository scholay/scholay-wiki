import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/ToastContainer';
import api, { orderAPI, paymentAPI } from '../services/api';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();

  const [activeTab, setActiveTab] = useState('profile'); // profile, account, subscription, invitation
  const [loading, setLoading] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); // 控制个人介绍编辑状态

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
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // Billing history state
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingPage, setBillingPage] = useState(1);
  const [billingTotal, setBillingTotal] = useState(0);
  const [billingLoading, setBillingLoading] = useState(false);

  // Invitation state
  const [invitation, setInvitation] = useState(null);
  const [invitees, setInvitees] = useState([]);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  // Handle URL parameters for WeChat/GitHub binding feedback and tab switching
  useEffect(() => {
    const tab = searchParams.get('tab');
    const wechatBindStatus = searchParams.get('wechat_bind_status');
    const githubBindStatus = searchParams.get('github_bind_status');
    const message = searchParams.get('message');

    // Switch to specified tab if provided
    if (tab && ['profile', 'account', 'subscription', 'invitation'].includes(tab)) {
      setActiveTab(tab);
    }

    // Show WeChat binding feedback
    if (wechatBindStatus && message) {
      if (wechatBindStatus === 'success') {
        showSuccess(message);
      } else if (wechatBindStatus === 'error') {
        showError(message);
      }

      // Clean up URL parameters after showing toast
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('wechat_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }

    // Show GitHub binding feedback
    if (githubBindStatus && message) {
      if (githubBindStatus === 'success') {
        showSuccess(message);
        // Refresh user profile to show updated GitHub binding
        fetchUserProfile();
      } else if (githubBindStatus === 'error') {
        showError(message);
      }

      // Clean up URL parameters after showing toast
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('github_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }
  }, [searchParams, setSearchParams, showSuccess, showError]);

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
      fetchBillingHistory(1);
    } else if (activeTab === 'invitation') {
      fetchInvitationData();
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

      // Fetch current subscription only
      const subResponse = await api.get('/user/subscription/my');
      if (subResponse.data.code === 0) {
        setCurrentSubscription(subResponse.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription data:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const fetchBillingHistory = async (page = 1) => {
    try {
      setBillingLoading(true);
      const response = await orderAPI.getBillingHistory(page, 10);
      if (response.data.code === 0) {
        setBillingHistory(response.data.data.orders || []);
        setBillingTotal(response.data.data.total || 0);
        setBillingPage(page);
      }
    } catch (error) {
      console.error('Failed to fetch billing history:', error);
      showError('获取历史账单失败');
    } finally {
      setBillingLoading(false);
    }
  };

  const fetchInvitationData = async () => {
    setInvitationLoading(true);
    try {
      // 获取邀请信息
      const inviteRes = await api.get('/user/invitation/my');
      if (inviteRes.data.code === 0) {
        // 新的API返回格式: { invitation: {...}, has_invitation: true/false }
        const { invitation: invitationData, has_invitation } = inviteRes.data.data;
        setInvitation(has_invitation ? invitationData : null);

        // 只有当用户有邀请码时才获取统计信息
        if (has_invitation) {
          // 获取邀请统计（包含被邀请者列表）
          const statsRes = await api.get('/user/invitation/statistics');
          if (statsRes.data.code === 0) {
            setInvitees(statsRes.data.data.relationships || []);
          }
        } else {
          // 没有邀请码时清空被邀请者列表
          setInvitees([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch invitation data:', error);
    } finally {
      setInvitationLoading(false);
    }
  };

  const generateInvitation = async () => {
    try {
      const response = await api.post('/user/invitation/generate');
      if (response.data.code === 0) {
        setInvitation(response.data.data);
        showSuccess('邀请码生成成功！');
      }
    } catch (error) {
      showError('生成邀请码失败：' + (error.response?.data?.message || error.message));
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(label);
      showSuccess(`${label}已复制到剪贴板！`);
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      showError('复制失败，请手动复制');
    }
  };

  const maskEmail = (email) => {
    if (!email) return '***';
    const [username, domain] = email.split('@');
    if (username.length <= 2) {
      return `${username[0]}***@${domain}`;
    }
    return `${username.substring(0, 2)}***@${domain}`;
  };

  const maskPhone = (phone) => {
    if (!phone) return '***';
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  };

  const getInvitationUrl = () => {
    if (!invitation) return '';
    return `${window.location.origin}/?invite=${invitation.invitation_code}`;
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
        // 保存成功后重新获取用户信息
        await fetchUserProfile();
        // 退出编辑模式
        setIsEditingProfile(false);
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
      // Clean up old state before starting new binding flow
      localStorage.removeItem('wechat_bind_state');

      // Mark as binding mode
      localStorage.setItem('wechat_bind_mode', 'bind');

      // Get WeChat login URL from backend (backend will generate state)
      const response = await api.get('/user/wechat/login-url');

      if (response.data.code === 0 && response.data.data) {
        const loginURL = response.data.data.login_url;
        const state = response.data.data.state;

        // Save backend-generated state for verification after callback
        localStorage.setItem('wechat_bind_state', state);

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

  // Handle GitHub binding
  const handleBindGitHub = async () => {
    try {
      // Save current page URL for return after binding
      const currentPath = window.location.pathname + window.location.search;
      localStorage.setItem('github_return_url', currentPath);

      // Get GitHub login URL
      const response = await api.get('/user/github/login-url');

      if (response.data.code === 0 && response.data.data) {
        const { url, state } = response.data.data;

        // Store state and bind mode in localStorage for verification
        localStorage.setItem('github_bind_state', state);
        localStorage.setItem('github_bind_mode', 'bind');

        // Redirect to GitHub OAuth
        window.location.href = url;
      } else {
        showError('获取 GitHub 登录链接失败');
      }
    } catch (err) {
      console.error('GitHub binding error:', err);
      showError('GitHub 绑定失败,请稍后重试');
    }
  };

  // Count available login methods
  const getLoginMethodCount = () => {
    let count = 0;
    if (user?.email) count++;
    if (user?.phone) count++;
    if (user?.wechat_openid) count++;
    if (user?.github_id) count++;
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
      'unbind-github': '解绑 GitHub',
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

        case 'unbind-github':
          response = await api.post('/user/unbind-github');
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

    if (type === 'unbind-github') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 GitHub 账号</p>
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


  const renderProfileTab = () => (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>我的介绍</h2>
        {!isEditingProfile && (
          <button
            className="btn-edit"
            onClick={() => setIsEditingProfile(true)}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #10a37f 0%, #1a7f64 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(16, 163, 127, 0.3)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            编辑
          </button>
        )}
      </div>

      <div className="profile-avatar-section">
        <div className="avatar-wrapper">
          <div className="avatar-circle">
            {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </div>

      {isEditingProfile ? (
        // 编辑模式
        <>
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
            <label>简介</label>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="介绍一下自己"
              rows="4"
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn-save"
              onClick={handleProfileSave}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
            <button
              className="btn-cancel"
              onClick={() => {
                setIsEditingProfile(false);
                // 取消时重新加载数据，恢复到原始状态
                fetchUserProfile();
              }}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#e5e7eb',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              取消
            </button>
          </div>
        </>
      ) : (
        // 展示模式 - 使用现有暗色设计风格
        <>
          <div className="form-group">
            <label>名字</label>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'rgba(255, 255, 255, 0.9)'
            }}>
              {profile.name || '未设置'}
            </div>
          </div>

          <div className="form-group">
            <label>简介</label>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              minHeight: '100px',
              whiteSpace: 'pre-wrap',
              color: 'rgba(255, 255, 255, 0.9)'
            }}>
              {profile.bio || '未设置简介'}
            </div>
          </div>
        </>
      )}
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

        {/* GitHub Card */}
        <div className="account-binding-card">
          <div className="binding-icon binding-icon-github">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">GitHub</div>
            <div className="binding-value">{user?.github_id ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.github_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-github', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindGitHub}>
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

  // Invitation Tab
  const renderInvitationTab = () => {

    if (invitationLoading) {
      return (
        <div className="settings-section">
          <h2>邀请推广</h2>
          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
            加载中...
          </div>
        </div>
      );
    }

    return (
      <div className="settings-section">
        <h2>邀请推广</h2>
        <p className="section-description">
          邀请好友注册，双方都可获得折扣券奖励
        </p>

        {/* Invitation Code Card */}
        <div className="invitation-card" style={{
          background: 'linear-gradient(135deg, rgba(16, 163, 127, 0.15) 0%, rgba(13, 133, 102, 0.1) 100%)',
          border: '1px solid rgba(16, 163, 127, 0.2)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          color: 'white'
        }}>
          {!invitation ? (
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 16px 0', color: 'white' }}>开始邀请好友</h3>
              <p style={{ margin: '0 0 20px 0', color: 'rgba(255, 255, 255, 0.7)' }}>
                生成你的专属邀请码，分享给好友即可获得奖励
              </p>
              <button
                onClick={generateInvitation}
                style={{
                  background: 'linear-gradient(135deg, #10a37f 0%, #0d8566 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 32px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(16, 163, 127, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
              >
                生成邀请码
              </button>
            </div>
          ) : (
            <div>
              <h3 style={{ margin: '0 0 20px 0' }}>我的邀请码</h3>

              {/* Invitation Code */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '500' }}>
                  邀请码
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={invitation.invitation_code}
                    readOnly
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 163, 127, 0.3)',
                      background: 'rgba(16, 163, 127, 0.08)',
                      color: '#10a37f',
                      fontSize: '18px',
                      fontWeight: '700',
                      letterSpacing: '3px',
                      textAlign: 'center'
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(invitation.invitation_code, '邀请码')}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 163, 127, 0.3)',
                      background: copySuccess === '邀请码' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 163, 127, 0.1)',
                      color: copySuccess === '邀请码' ? '#10b981' : '#10a37f',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      if (copySuccess !== '邀请码') {
                        e.target.style.background = 'rgba(16, 163, 127, 0.15)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (copySuccess !== '邀请码') {
                        e.target.style.background = 'rgba(16, 163, 127, 0.1)';
                      }
                    }}
                  >
                    {copySuccess === '邀请码' ? '✓ 已复制' : '复制'}
                  </button>
                </div>
              </div>

              {/* Invitation URL */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '500' }}>
                  邀请链接
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={getInvitationUrl()}
                    readOnly
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 163, 127, 0.3)',
                      background: 'rgba(16, 163, 127, 0.08)',
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '13px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(getInvitationUrl(), '邀请链接')}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 163, 127, 0.3)',
                      background: copySuccess === '邀请链接' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 163, 127, 0.1)',
                      color: copySuccess === '邀请链接' ? '#10b981' : '#10a37f',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      if (copySuccess !== '邀请链接') {
                        e.target.style.background = 'rgba(16, 163, 127, 0.15)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (copySuccess !== '邀请链接') {
                        e.target.style.background = 'rgba(16, 163, 127, 0.1)';
                      }
                    }}
                  >
                    {copySuccess === '邀请链接' ? '✓ 已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Invitees List */}
        {invitation && (
          <div>
            <h3 style={{ marginBottom: '16px' }}>被邀请者列表</h3>
            {invitees.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  还没有人使用你的邀请码注册
                </p>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>
                        用户信息
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>
                        注册时间
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>
                        状态
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitees.map((invitee, index) => (
                      <tr key={index} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {invitee.invitee_email ? maskEmail(invitee.invitee_email) :
                           invitee.invitee_phone ? maskPhone(invitee.invitee_phone) : '用户***'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                          {new Date(invitee.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: invitee.has_purchased ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 163, 127, 0.1)',
                            border: invitee.has_purchased ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(16, 163, 127, 0.2)',
                            color: invitee.has_purchased ? '#10b981' : '#10a37f'
                          }}>
                            {invitee.has_purchased ? '✓ 已付费' : '已注册'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSubscriptionTab = () => {
    if (subscriptionLoading) {
      return (
        <div className="settings-section">
          <h2>订阅</h2>
          <div className="subscription-loading">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-section subscription-section">
        <h2>订阅</h2>

        {/* Current Subscription Card */}
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
            </div>

            {/* Simple description */}
            <div className="subscription-description">
              <p>
                {currentSubscription.plan_code === 'free' && '免费方案提供基础功能，升级至付费方案以享受更多权益'}
                {currentSubscription.plan_code === 'pro' && '您正在使用 PRO 方案，享受扩展访问权限和高级功能'}
                {currentSubscription.plan_code === 'max' && '您正在使用 MAX 方案，畅享所有功能无限使用'}
              </p>
            </div>

            {/* View Plans Button */}
            <button
              className="btn-view-pricing"
              onClick={() => navigate('/pricing')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <span>查看所有订阅方案</span>
            </button>
          </div>
        )}

        {/* Billing History */}
        <div className="billing-history-section">
          <h3>历史账单</h3>
          {billingLoading ? (
            <div className="billing-loading">
              <div className="spinner"></div>
              <p>加载中...</p>
            </div>
          ) : billingHistory.length > 0 ? (
            <>
              <div className="billing-table">
                <table>
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>套餐</th>
                      <th>金额</th>
                      <th>支付时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistory.map((order) => (
                      <tr key={order.id}>
                        <td className="order-no">{order.order_no}</td>
                        <td>
                          <div className="plan-info">
                            <span className="plan-name">{order.plan_name}</span>
                            <span className="billing-cycle">
                              {order.billing_cycle === 'monthly' ? '月付' : '年付'}
                            </span>
                          </div>
                        </td>
                        <td className="amount">
                          <div className="amount-details">
                            {order.discount_amount > 0 ? (
                              <>
                                <span className="final-amount">¥{order.final_amount.toFixed(2)}</span>
                                <span className="original-amount">¥{order.amount.toFixed(2)}</span>
                                <span className="discount-badge">已优惠¥{order.discount_amount.toFixed(2)}</span>
                              </>
                            ) : (
                              <span className="final-amount">¥{order.final_amount.toFixed(2)}</span>
                            )}
                          </div>
                        </td>
                        <td className="payment-time">
                          {new Date(order.payment_time).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {billingTotal > 10 && (
                <div className="pagination">
                  <button
                    className="pagination-btn"
                    disabled={billingPage === 1}
                    onClick={() => fetchBillingHistory(billingPage - 1)}
                  >
                    上一页
                  </button>
                  <span className="pagination-info">
                    第 {billingPage} 页，共 {Math.ceil(billingTotal / 10)} 页
                  </span>
                  <button
                    className="pagination-btn"
                    disabled={billingPage >= Math.ceil(billingTotal / 10)}
                    onClick={() => fetchBillingHistory(billingPage + 1)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-billing">
              <p>暂无订单记录</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderExternalLinks = () => null;

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
      {/* Header with Logo - fixed at top, full width */}
      <div
        className="settings-header"
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

      <div className="settings-container">
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
                  className={`menu-item ${activeTab === 'invitation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('invitation')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>邀请推广</span>
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
            {activeTab === 'subscription' && renderSubscriptionTab()}
            {activeTab === 'invitation' && renderInvitationTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

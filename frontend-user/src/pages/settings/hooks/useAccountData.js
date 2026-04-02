/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 账号授权管理相关状态和数据获取 Hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../../../services/client';
import { useToast } from '../../../components/ToastContainer';
import logger from '../../../utils/logger';

const useAccountData = (user) => {
  const { showSuccess, showError } = useToast();

  // 用于存储成功回调的 ref
  const onSuccessRef = useRef(null);

  // Loading state
  const [loading, setLoading] = useState(false);

  // Account management modal state
  const [accountModal, setAccountModal] = useState({
    show: false,
    type: '', // 'bind-email', 'bind-phone', 'rebind-email', 'rebind-phone', 'unbind-email', 'unbind-phone', 'unbind-wechat', 'unbind-github', 'change-password'
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

  // Modal countdown timer
  useEffect(() => {
    if (modalCodeCountdown > 0) {
      const timer = setTimeout(() => setModalCodeCountdown(modalCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [modalCodeCountdown]);

  // Handle WeChat binding
  const handleBindWeChat = useCallback(async () => {
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
      logger.error('WeChat binding error:', err);
      showError('微信绑定失败,请稍后重试');
    }
  }, [showError]);

  // Handle GitHub binding
  const handleBindGitHub = useCallback(async () => {
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
      logger.error('GitHub binding error:', err);
      showError('GitHub 绑定失败,请稍后重试');
    }
  }, [showError]);

  // 恩特学术（Discourse）绑定
  const handleBindDiscourse = useCallback(async () => {
    try {
      const currentPath = window.location.pathname + window.location.search;
      localStorage.setItem('discourse_return_url', currentPath);

      const response = await api.get('/user/discourse/login-url');
      if (response.data.code === 0 && response.data.data) {
        const { url, nonce } = response.data.data;
        localStorage.setItem('discourse_sso_nonce', nonce);
        localStorage.setItem('discourse_bind_mode', 'bind');
        window.location.href = url;
      } else {
        showError('获取恩特学术登录链接失败');
      }
    } catch (err) {
      logger.error('Discourse binding error:', err);
      showError('恩特学术绑定失败，请稍后重试');
    }
  }, [showError]);

  // Count available login methods
  const getLoginMethodCount = useCallback(() => {
    let count = 0;
    if (user?.email) count++;
    if (user?.phone) count++;
    if (user?.wechat_openid) count++;
    if (user?.github_id) count++;
    if (user?.discourse_id) count++;
    return count;
  }, [user]);

  // Modal handlers
  const handleOpenModal = useCallback((type, currentValue) => {
    const titles = {
      'bind-email': '绑定邮箱',
      'bind-phone': '绑定手机号',
      'rebind-email': '换绑邮箱',
      'rebind-phone': '换绑手机号',
      'unbind-email': '解绑邮箱',
      'unbind-phone': '解绑手机号',
      'unbind-wechat': '解绑微信',
      'unbind-github': '解绑 GitHub',
      'unbind-discourse': '解绑恩特学术',
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
  }, []);

  const handleCloseModal = useCallback(() => {
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
  }, []);

  // Check availability and proceed to step 2 (for bind/rebind operations)
  const handleCheckAvailability = useCallback(async () => {
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
      logger.error('Failed to check availability:', error);
    } finally {
      setLoading(false);
    }
  }, [accountModal.type, modalForm.email, modalForm.phone, showError, showSuccess]);

  // Send modal verification code
  const handleSendModalCode = useCallback(async () => {
    if (modalCodeCountdown > 0) return;

    const type = accountModal.type;
    let endpoint = '';
    let payload = {};

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
      logger.error('Failed to send code:', error);
    } finally {
      setLoading(false);
    }
  }, [modalCodeCountdown, accountModal.type, modalForm.email, modalForm.phone, showError, showSuccess]);

  // Send unbind verification code
  const handleSendUnbindCode = useCallback(async (type) => {
    if (modalCodeCountdown > 0) return;
    setLoading(true);

    try {
      let response;
      if (type === 'email') {
        response = await api.post('/user/send-code', {
          email: user.email,
          purpose: 'unbind'
        });
      } else if (type === 'phone') {
        response = await api.post('/user/send-phone-code', {
          phone: user.phone,
          purpose: 'unbind'
        });
      }

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
  }, [modalCodeCountdown, user?.email, user?.phone, showSuccess, showError]);

  // Handle modal submit
  const handleModalSubmit = useCallback(async () => {
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

        case 'unbind-discourse':
          response = await api.post('/user/unbind-discourse');
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
        // 调用成功回调（如刷新用户数据）
        if (onSuccessRef.current) {
          onSuccessRef.current();
        }
      } else {
        showError('操作失败：' + (response?.data?.message || '未知错误'));
      }
    } catch (error) {
      showError('操作失败,请稍后重试');
      logger.error('Modal submit error:', error);
    } finally {
      setLoading(false);
    }
  }, [accountModal.type, modalForm, showError, showSuccess, handleCloseModal]);

  // 设置成功回调的函数
  const setOnSuccess = useCallback((callback) => {
    onSuccessRef.current = callback;
  }, []);

  return {
    // Loading
    loading,
    setLoading,

    // Modal state
    accountModal,
    setAccountModal,
    modalForm,
    setModalForm,
    modalCodeCountdown,
    setModalCodeCountdown,

    // Actions
    handleBindWeChat,
    handleBindGitHub,
    handleBindDiscourse,
    getLoginMethodCount,
    handleOpenModal,
    handleCloseModal,
    handleCheckAvailability,
    handleSendModalCode,
    handleSendUnbindCode,
    handleModalSubmit,

    // Callback setter
    setOnSuccess,
  };
};

export default useAccountData;

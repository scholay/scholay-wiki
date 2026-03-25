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
import { App } from 'antd';
import { httpClient as api } from 'shared/api/client';
import logger from '../../../utils/logger';

const useAccountData = (user) => {
  const { message } = App.useApp();

  const onSuccessRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const [accountModal, setAccountModal] = useState({
    show: false,
    type: '',
    title: '',
    currentValue: '',
    step: 1,
  });
  const [modalForm, setModalForm] = useState({
    email: '',
    phone: '',
    code: '',
    password: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [modalCodeCountdown, setModalCodeCountdown] = useState(0);

  useEffect(() => {
    if (modalCodeCountdown > 0) {
      const timer = setTimeout(() => setModalCodeCountdown(modalCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [modalCodeCountdown]);

  const handleBindWeChat = useCallback(async () => {
    try {
      localStorage.removeItem('wechat_bind_state');
      localStorage.setItem('wechat_bind_mode', 'bind');

      const response = await api.get('/user/wechat/login-url');

      if (response.data.code === 0 && response.data.data) {
        const loginURL = response.data.data.login_url;
        const state = response.data.data.state;
        localStorage.setItem('wechat_bind_state', state);
        window.location.href = loginURL;
      } else {
        message.error('获取微信登录链接失败');
      }
    } catch (err) {
      logger.error('WeChat binding error:', err);
      message.error('微信绑定失败,请稍后重试');
    }
  }, [message]);

  const handleBindGitHub = useCallback(async () => {
    try {
      const currentPath = window.location.pathname + window.location.search;
      localStorage.setItem('github_return_url', currentPath);

      const response = await api.get('/user/github/login-url');

      if (response.data.code === 0 && response.data.data) {
        const { url, state } = response.data.data;
        localStorage.setItem('github_bind_state', state);
        localStorage.setItem('github_bind_mode', 'bind');
        window.location.href = url;
      } else {
        message.error('获取 GitHub 登录链接失败');
      }
    } catch (err) {
      logger.error('GitHub binding error:', err);
      message.error('GitHub 绑定失败,请稍后重试');
    }
  }, [message]);

  const getLoginMethodCount = useCallback(() => {
    let count = 0;
    if (user?.email) count++;
    if (user?.phone) count++;
    if (user?.wechat_openid) count++;
    if (user?.github_id) count++;
    return count;
  }, [user]);

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
      'change-password': '修改密码',
    };

    setAccountModal({
      show: true,
      type,
      title: titles[type] || '',
      currentValue,
      step: 1,
    });

    setModalForm({
      email: '', phone: '', code: '',
      password: '', newPassword: '', confirmPassword: '',
    });
    setModalCodeCountdown(0);
  }, []);

  const handleCloseModal = useCallback(() => {
    setAccountModal({
      show: false, type: '', title: '', currentValue: '', step: 1,
    });
    setModalForm({
      email: '', phone: '', code: '',
      password: '', newPassword: '', confirmPassword: '',
    });
    setModalCodeCountdown(0);
  }, []);

  const handleCheckAvailability = useCallback(async () => {
    const type = accountModal.type;
    setLoading(true);

    try {
      let response;

      if (type.includes('email')) {
        if (!modalForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForm.email)) {
          message.error('请输入有效的邮箱地址');
          setLoading(false);
          return;
        }
        response = await api.post('/user/check-email-availability', {
          email: modalForm.email,
        });
      } else if (type.includes('phone')) {
        if (!modalForm.phone || !/^1[3-9]\d{9}$/.test(modalForm.phone)) {
          message.error('请输入有效的手机号码');
          setLoading(false);
          return;
        }
        response = await api.post('/user/check-phone-availability', {
          phone: modalForm.phone,
        });
      }

      if (response && response.data.code === 0) {
        if (response.data.data.available) {
          setAccountModal((prev) => ({ ...prev, step: 2 }));
          message.success('验证通过,请继续输入验证码');
        } else {
          if (type.includes('email')) {
            message.error('该邮箱已被其他账号绑定');
          } else {
            message.error('该手机号已被其他账号绑定');
          }
        }
      } else {
        message.error('检查失败：' + (response?.data?.message || '未知错误'));
      }
    } catch (error) {
      message.error('检查失败,请稍后重试');
      logger.error('Failed to check availability:', error);
    } finally {
      setLoading(false);
    }
  }, [accountModal.type, modalForm.email, modalForm.phone, message]);

  const handleSendModalCode = useCallback(async () => {
    if (modalCodeCountdown > 0) return;

    const type = accountModal.type;
    let endpoint = '';
    let payload = {};

    if (type.includes('email')) {
      if (!modalForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForm.email)) {
        message.error('请输入有效的邮箱地址');
        return;
      }
      endpoint = '/user/send-code';
      payload = { email: modalForm.email, purpose: type.includes('bind') ? 'bind' : 'unbind' };
    } else if (type.includes('phone')) {
      if (!modalForm.phone || !/^1[3-9]\d{9}$/.test(modalForm.phone)) {
        message.error('请输入有效的手机号码');
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
        message.success('验证码已发送');
      } else {
        message.error('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      message.error('发送验证码失败,请稍后重试');
      logger.error('Failed to send code:', error);
    } finally {
      setLoading(false);
    }
  }, [modalCodeCountdown, accountModal.type, modalForm.email, modalForm.phone, message]);

  const handleSendUnbindCode = useCallback(async (type) => {
    if (modalCodeCountdown > 0) return;
    setLoading(true);

    try {
      let response;
      if (type === 'email') {
        response = await api.post('/user/send-code', {
          email: user.email,
          purpose: 'unbind',
        });
      } else if (type === 'phone') {
        response = await api.post('/user/send-phone-code', {
          phone: user.phone,
          purpose: 'unbind',
        });
      }

      if (response.data.code === 0) {
        setModalCodeCountdown(60);
        message.success('验证码已发送');
      } else {
        message.error(response.data.message);
      }
    } catch (err) {
      message.error('发送失败');
    } finally {
      setLoading(false);
    }
  }, [modalCodeCountdown, user?.email, user?.phone, message]);

  const handleModalSubmit = useCallback(async () => {
    const type = accountModal.type;
    setLoading(true);

    try {
      let response;

      switch (type) {
        case 'bind-email':
          if (!modalForm.email || !modalForm.code) {
            message.error('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-email', {
            email: modalForm.email,
            code: modalForm.code,
          });
          break;

        case 'bind-phone':
          if (!modalForm.phone || !modalForm.code) {
            message.error('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-phone', {
            phone: modalForm.phone,
            code: modalForm.code,
          });
          break;

        case 'rebind-email':
          if (!modalForm.email || !modalForm.code) {
            message.error('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-email', {
            email: modalForm.email,
            code: modalForm.code,
          });
          break;

        case 'rebind-phone':
          if (!modalForm.phone || !modalForm.code) {
            message.error('请填写完整信息');
            setLoading(false);
            return;
          }
          response = await api.post('/user/bind-phone', {
            phone: modalForm.phone,
            code: modalForm.code,
          });
          break;

        case 'unbind-email':
          if (!modalForm.code) {
            message.error('请输入验证码');
            setLoading(false);
            return;
          }
          response = await api.post('/user/unbind-email', { code: modalForm.code });
          break;

        case 'unbind-phone':
          if (!modalForm.code) {
            message.error('请输入验证码');
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
            message.error('请填写完整信息');
            setLoading(false);
            return;
          }
          if (modalForm.newPassword !== modalForm.confirmPassword) {
            message.error('两次输入的密码不一致');
            setLoading(false);
            return;
          }
          if (modalForm.newPassword.length < 8) {
            message.error('新密码长度至少为8个字符');
            setLoading(false);
            return;
          }
          response = await api.post('/user/change-password', {
            current_password: modalForm.password,
            new_password: modalForm.newPassword,
          });
          break;

        default:
          setLoading(false);
          return;
      }

      if (response && response.data.code === 0) {
        message.success('操作成功');
        handleCloseModal();
        if (onSuccessRef.current) {
          onSuccessRef.current();
        }
      } else {
        message.error('操作失败：' + (response?.data?.message || '未知错误'));
      }
    } catch (error) {
      message.error('操作失败,请稍后重试');
      logger.error('Modal submit error:', error);
    } finally {
      setLoading(false);
    }
  }, [accountModal.type, modalForm, message, handleCloseModal]);

  const setOnSuccess = useCallback((callback) => {
    onSuccessRef.current = callback;
  }, []);

  return {
    loading,
    setLoading,
    accountModal,
    setAccountModal,
    modalForm,
    setModalForm,
    modalCodeCountdown,
    setModalCodeCountdown,
    handleBindWeChat,
    handleBindGitHub,
    getLoginMethodCount,
    handleOpenModal,
    handleCloseModal,
    handleCheckAvailability,
    handleSendModalCode,
    handleSendUnbindCode,
    handleModalSubmit,
    setOnSuccess,
  };
};

export default useAccountData;

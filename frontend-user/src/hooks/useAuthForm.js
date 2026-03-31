/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useAuthForm - 认证表单自定义 Hook
 * 封装登录/注册表单的通用逻辑
 */

import { useState, useCallback, useEffect } from 'react';
import { userAPI } from '../services/user.api';
import logger from '../utils/logger';

/**
 * 密码验证规则
 */
const validatePassword = (password) => {
  if (password.length < 8) {
    return '密码长度至少8位';
  }
  if (password.length > 32) {
    return '密码长度不能超过32位';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return '密码必须包含字母';
  }
  if (!/[0-9]/.test(password)) {
    return '密码必须包含数字';
  }
  return '';
};

/**
 * 邮箱验证
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 手机号验证（中国大陆）
 */
const validatePhone = (phone) => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * useAuthForm Hook
 * @param {Object} options 配置选项
 * @param {Function} options.onSuccess 成功回调
 * @param {Function} options.showError 显示错误消息
 * @param {Function} options.showSuccess 显示成功消息
 * @param {Function} options.login 登录函数（来自 AuthContext）
 */
const useAuthForm = ({ onSuccess, showError, showSuccess, login }) => {
  // 表单状态
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false);
  
  // UI 状态
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [passwordError, setPasswordError] = useState('');

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 重置表单
  const resetForm = useCallback(() => {
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setAgreedToPolicy(false);
    setPasswordError('');
    setUseCodeLogin(false);
  }, []);

  // 验证密码
  const handlePasswordChange = useCallback((value) => {
    setPassword(value);
    if (value) {
      setPasswordError(validatePassword(value));
    } else {
      setPasswordError('');
    }
  }, []);

  // 发送邮箱验证码
  const sendEmailCode = useCallback(async (turnstileToken, purpose = 'register') => {
    if (!email) {
      showError('请输入邮箱地址');
      return false;
    }
    if (!validateEmail(email)) {
      showError('请输入有效的邮箱地址');
      return false;
    }

    setLoading(true);
    try {
      const response = await userAPI.sendEmailCode(email, purpose, turnstileToken);
      if (response.data.code === 0) {
        showSuccess('验证码已发送');
        setCountdown(60);
        return true;
      } else {
        showError(response.data.message || '发送失败');
        return false;
      }
    } catch (error) {
      logger.error('Send email code error:', error);
      showError(error.response?.data?.message || '发送失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, showError, showSuccess]);

  // 发送手机验证码
  const sendPhoneCode = useCallback(async (turnstileToken, purpose = 'register') => {
    if (!phone) {
      showError('请输入手机号码');
      return false;
    }
    if (!validatePhone(phone)) {
      showError('请输入有效的手机号码');
      return false;
    }

    setLoading(true);
    try {
      const response = await userAPI.sendPhoneCode(phone, purpose, turnstileToken);
      if (response.data.code === 0) {
        showSuccess('验证码已发送');
        setCountdown(60);
        return true;
      } else {
        showError(response.data.message || '发送失败');
        return false;
      }
    } catch (error) {
      logger.error('Send phone code error:', error);
      showError(error.response?.data?.message || '发送失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [phone, showError, showSuccess]);

  // 邮箱登录
  const loginWithEmail = useCallback(async (turnstileToken) => {
    if (!email || !password) {
      showError('请填写邮箱和密码');
      return false;
    }

    setLoading(true);
    try {
      const response = await userAPI.loginWithEmail(email, password, turnstileToken);
      if (response.data.code === 0) {
        const { token, user } = response.data.data;
        login(token, user);
        showSuccess('登录成功');
        onSuccess?.();
        return true;
      } else {
        showError(response.data.message || '登录失败');
        return false;
      }
    } catch (error) {
      logger.error('Email login error:', error);
      showError(error.response?.data?.message || '登录失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, password, login, showError, showSuccess, onSuccess]);

  // 手机号登录
  const loginWithPhone = useCallback(async (turnstileToken) => {
    if (!phone) {
      showError('请输入手机号码');
      return false;
    }

    if (useCodeLogin) {
      if (!code) {
        showError('请输入验证码');
        return false;
      }
    } else {
      if (!password) {
        showError('请输入密码');
        return false;
      }
    }

    setLoading(true);
    try {
      const response = useCodeLogin
        ? await userAPI.loginWithPhoneCode(phone, code, turnstileToken)
        : await userAPI.loginWithPhone(phone, password, turnstileToken);

      if (response.data.code === 0) {
        const { token, user } = response.data.data;
        login(token, user);
        showSuccess('登录成功');
        onSuccess?.();
        return true;
      } else {
        showError(response.data.message || '登录失败');
        return false;
      }
    } catch (error) {
      logger.error('Phone login error:', error);
      showError(error.response?.data?.message || '登录失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [phone, password, code, useCodeLogin, login, showError, showSuccess, onSuccess]);

  // 邮箱注册
  const registerWithEmail = useCallback(async (turnstileToken) => {
    if (!email || !password || !code) {
      showError('请填写完整信息');
      return false;
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      showError(pwdError);
      return false;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return false;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意用户协议和隐私政策');
      return false;
    }

    setLoading(true);
    try {
      const response = await userAPI.registerWithEmail(
        email, 
        password, 
        code, 
        undefined,
        turnstileToken
      );
      if (response.data.code === 0) {
        const { token, user } = response.data.data;
        login(token, user);
        showSuccess('注册成功');
        onSuccess?.();
        return true;
      } else {
        showError(response.data.message || '注册失败');
        return false;
      }
    } catch (error) {
      logger.error('Email register error:', error);
      showError(error.response?.data?.message || '注册失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, code, agreedToPolicy, login, showError, showSuccess, onSuccess]);

  // 手机号注册
  const registerWithPhone = useCallback(async (turnstileToken) => {
    if (!phone || !password || !code) {
      showError('请填写完整信息');
      return false;
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      showError(pwdError);
      return false;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return false;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意用户协议和隐私政策');
      return false;
    }

    setLoading(true);
    try {
      const response = await userAPI.registerWithPhone(
        phone, 
        password, 
        code, 
        undefined,
        turnstileToken
      );
      if (response.data.code === 0) {
        const { token, user } = response.data.data;
        login(token, user);
        showSuccess('注册成功');
        onSuccess?.();
        return true;
      } else {
        showError(response.data.message || '注册失败');
        return false;
      }
    } catch (error) {
      logger.error('Phone register error:', error);
      showError(error.response?.data?.message || '注册失败，请稍后重试');
      return false;
    } finally {
      setLoading(false);
    }
  }, [phone, password, confirmPassword, code, agreedToPolicy, login, showError, showSuccess, onSuccess]);

  return {
    // 表单状态
    email,
    setEmail,
    phone,
    setPhone,
    password,
    confirmPassword,
    setConfirmPassword,
    code,
    setCode,
    agreedToPolicy,
    setAgreedToPolicy,
    useCodeLogin,
    setUseCodeLogin,
    
    // UI 状态
    loading,
    countdown,
    passwordError,
    
    // 方法
    resetForm,
    handlePasswordChange,
    sendEmailCode,
    sendPhoneCode,
    loginWithEmail,
    loginWithPhone,
    registerWithEmail,
    registerWithPhone,
    
    // 验证函数
    validateEmail,
    validatePhone,
    validatePassword,
  };
};

export default useAuthForm;


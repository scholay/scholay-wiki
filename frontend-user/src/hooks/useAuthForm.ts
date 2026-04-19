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
import type { User } from '../types/user';

export type CodePurpose = 'register' | 'login' | 'reset' | string;

export interface UseAuthFormOptions {
  onSuccess?: () => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  login: (token: string, user: User) => void;
}

export interface UseAuthFormResult {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  phone: string;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  confirmPassword: string;
  setConfirmPassword: React.Dispatch<React.SetStateAction<string>>;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  agreedToPolicy: boolean;
  setAgreedToPolicy: React.Dispatch<React.SetStateAction<boolean>>;
  useCodeLogin: boolean;
  setUseCodeLogin: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  countdown: number;
  passwordError: string;
  resetForm: () => void;
  handlePasswordChange: (value: string) => void;
  sendEmailCode: (turnstileToken: string, purpose?: CodePurpose) => Promise<boolean>;
  sendPhoneCode: (turnstileToken: string, purpose?: CodePurpose) => Promise<boolean>;
  loginWithEmail: (turnstileToken: string) => Promise<boolean>;
  loginWithPhone: (turnstileToken: string) => Promise<boolean>;
  registerWithEmail: (turnstileToken: string) => Promise<boolean>;
  registerWithPhone: (turnstileToken: string) => Promise<boolean>;
  validateEmail: (email: string) => boolean;
  validatePhone: (phone: string) => boolean;
  validatePassword: (password: string) => string;
}

/**
 * 密码验证规则
 */
const validatePassword = (password: string): string => {
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
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 手机号验证（中国大陆）
 */
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

// Axios error shape used by our API services. We only inspect a couple of
// fields, so a narrow type beats pulling in axios' generics here.
interface ApiError extends Error {
  response?: { data?: { message?: string } };
}

const useAuthForm = ({ onSuccess, showError, showSuccess, login }: UseAuthFormOptions): UseAuthFormResult => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const resetForm = useCallback((): void => {
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setAgreedToPolicy(false);
    setPasswordError('');
    setUseCodeLogin(false);
  }, []);

  const handlePasswordChange = useCallback((value: string): void => {
    setPassword(value);
    if (value) {
      setPasswordError(validatePassword(value));
    } else {
      setPasswordError('');
    }
  }, []);

  const sendEmailCode = useCallback(
    async (turnstileToken: string, purpose: CodePurpose = 'register'): Promise<boolean> => {
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Send email code error:', error);
        showError(e.response?.data?.message || '发送失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [email, showError, showSuccess],
  );

  const sendPhoneCode = useCallback(
    async (turnstileToken: string, purpose: CodePurpose = 'register'): Promise<boolean> => {
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Send phone code error:', error);
        showError(e.response?.data?.message || '发送失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [phone, showError, showSuccess],
  );

  const loginWithEmail = useCallback(
    async (turnstileToken: string): Promise<boolean> => {
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Email login error:', error);
        showError(e.response?.data?.message || '登录失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [email, password, login, showError, showSuccess, onSuccess],
  );

  const loginWithPhone = useCallback(
    async (turnstileToken: string): Promise<boolean> => {
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Phone login error:', error);
        showError(e.response?.data?.message || '登录失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [phone, password, code, useCodeLogin, login, showError, showSuccess, onSuccess],
  );

  const registerWithEmail = useCallback(
    async (turnstileToken: string): Promise<boolean> => {
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
          turnstileToken,
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Email register error:', error);
        showError(e.response?.data?.message || '注册失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [email, password, confirmPassword, code, agreedToPolicy, login, showError, showSuccess, onSuccess],
  );

  const registerWithPhone = useCallback(
    async (turnstileToken: string): Promise<boolean> => {
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
          turnstileToken,
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
      } catch (error: unknown) {
        const e = error as ApiError;
        logger.error('Phone register error:', error);
        showError(e.response?.data?.message || '注册失败，请稍后重试');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [phone, password, confirmPassword, code, agreedToPolicy, login, showError, showSuccess, onSuccess],
  );

  return {
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

    loading,
    countdown,
    passwordError,

    resetForm,
    handlePasswordChange,
    sendEmailCode,
    sendPhoneCode,
    loginWithEmail,
    loginWithPhone,
    registerWithEmail,
    registerWithPhone,

    validateEmail,
    validatePhone,
    validatePassword,
  };
};

export default useAuthForm;

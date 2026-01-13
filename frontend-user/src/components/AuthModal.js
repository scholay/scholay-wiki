/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import TurnstileCaptcha from './TurnstileCaptcha';
import { useToast } from './ToastContainer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { trackUserLogin, trackUserRegister } from '../utils/usageTracker';
import logger from '../utils/logger';
import './styles/auth-modal/index.css';

const AuthModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();
  const [mode, setMode] = useState('welcome'); // 'welcome', 'login', 'register', 'phone-welcome', 'phone-login', 'phone-register', 'forgot-password-email', 'forgot-password-phone', 'wechat-qrcode'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false); // Toggle between password and code login

  // Refs for captcha components
  const emailCaptchaRef = useRef(null);
  const phoneCaptchaRef = useRef(null);

  // 微信二维码相关状态
  const [wechatQRCodeLoading, setWechatQRCodeLoading] = useState(false);
  const [wechatState, setWechatState] = useState('');
  const wechatQRCodeRef = useRef(null);

  // 每次打开弹窗时重置条款同意状态
  useEffect(() => {
    if (isOpen) {
      setAgreedToPolicy(false);
    }
  }, [isOpen]);
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyType, setPolicyType] = useState('privacy'); // 'privacy' or 'terms'
  const [privacyContent, setPrivacyContent] = useState('');
  const [termsContent, setTermsContent] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [enableTurnstile, setEnableTurnstile] = useState(false);
  const [enableGithubOAuth, setEnableGithubOAuth] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态

  // 读取URL中的邀请码参数
  useEffect(() => {
    if (isOpen) {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteParam = urlParams.get('invite');
      if (inviteParam) {
        setInvitationCode(inviteParam);
        // 可以在这里调用API验证邀请码并获取邀请人信息
        // 暂时不验证,直接使用
      }
    }
  }, [isOpen]);

  // 获取隐私协议、用户协议和系统配置
  useEffect(() => {
    if (isOpen) {
      // 获取隐私协议
      fetch('/api/v1/config/privacy-policy')
        .then(res => res.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            setPrivacyContent(data.data.content);
          }
        })
        .catch(() => {
          setPrivacyContent('隐私协议加载失败');
        });

      // 获取用户协议
      fetch('/api/v1/config/terms-of-service')
        .then(res => res.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            setTermsContent(data.data.content);
          }
        })
        .catch(() => {
          setTermsContent('用户协议加载失败');
        });

      // 获取系统配置
      fetch('/api/v1/config/system')
        .then(res => res.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            setRequireEmailVerification(data.data.require_email_verification ?? true);
            const turnstileEnabled = data.data.enable_turnstile ?? false;
            setEnableTurnstile(turnstileEnabled);
            // GitHub login is available if client_id is configured
            setEnableGithubOAuth(!!(data.data.github_client_id && data.data.github_client_id.trim() !== ''));
            // If Turnstile is disabled, set a placeholder token to allow form submission
            if (!turnstileEnabled) {
              setTurnstileToken('disabled');
            }
          }
        })
        .catch(() => {
          setRequireEmailVerification(true);
          setEnableTurnstile(false);
          setEnableGithubOAuth(false);
          // On error, assume Turnstile is disabled and set placeholder token
          setTurnstileToken('disabled');
        });
    }
  }, [isOpen]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 验证确认密码
  const validateConfirmPassword = () => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
    } else {
      setPasswordError('');
    }
  };

  // 重置状态
  const resetState = () => {
    setMode('welcome');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setTurnstileToken('');
    setAgreedToPolicy(false);
    setPasswordError('');
    setInvitationCode('');
    setUseCodeLogin(false);
    setWechatQRCodeLoading(false);
    setWechatState('');
  };

  // 清空输入框内容（切换登录方式时使用）
  const clearInputs = () => {
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setPasswordError('');
    setCountdown(0);
    if (emailCaptchaRef.current) {
      emailCaptchaRef.current.reset();
    }
    if (phoneCaptchaRef.current) {
      phoneCaptchaRef.current.reset();
    }
  };

  // 关闭弹窗
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 检查邮箱并进入下一步
  const handleEmailContinue = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    

    try {
      const response = await fetch('/api/v1/user/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.code === 0) {
        // 根据邮箱是否存在决定是登录还是注册
        setMode(data.data.exists ? 'login' : 'register');
      } else {
        showError(data.message || '检查邮箱失败');
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 发送验证码
  const handleSendCode = async (purpose = 'register') => {
    if (countdown > 0) return;

    setLoading(true);


    try {
      const response = await fetch('/api/v1/user/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });

      const data = await response.json();

      if (data.code === 0) {
        setCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError(data.message || '发送验证码失败');
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async () => {
    if (!password) {
      showError('请输入密码');
      return;
    }

    // Only check Turnstile token if Turnstile is enabled
    if (enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const response = await fetch('/api/v1/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstile_token: turnstileToken }),
      });

      const data = await response.json();

      if (data.code === 0) {
        trackUserLogin(); // 记录登录统计
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        // Reset captcha state to allow re-verification
        setTurnstileToken('');
        if (emailCaptchaRef.current) {
          emailCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
      // Reset captcha state to allow re-verification
      setTurnstileToken('');
      if (emailCaptchaRef.current) {
        emailCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    if (!password || password.length < 8) {
      showError('密码长度至少8位');
      return;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (requireEmailVerification && !code) {
      showError('请输入验证码');
      return;
    }

    // Only check Turnstile token if Turnstile is enabled
    if (enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const requestBody = {
        email,
        password,
        code,
        turnstile_token: turnstileToken
      };

      // 如果有邀请码，添加到请求中
      if (invitationCode) {
        requestBody.invitation_code = invitationCode;
      }

      const response = await fetch('/api/v1/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.code === 0) {
        trackUserRegister(); // 记录注册统计
        logger.log('[AuthModal] Registration success, register_gift_gold:', data.data.register_gift_gold);
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        
        // 如果有注册赠送经费，保存到localStorage供App层显示欢迎弹窗
        if (data.data.register_gift_gold && data.data.register_gift_gold > 0) {
          logger.log('[AuthModal] Saving welcome modal data to localStorage');
          localStorage.setItem('pending_welcome_modal', JSON.stringify({
            giftAmount: data.data.register_gift_gold,
            timestamp: Date.now()
          }));
          // 触发自定义事件通知App层显示欢迎弹窗
          logger.log('[AuthModal] Dispatching show:welcome_modal event');
          window.dispatchEvent(new CustomEvent('show:welcome_modal'));
        }
        
        handleClose();
      } else {
        showError(data.message || '注册失败');
        // Reset verification state but keep password and countdown
        setCode('');
        setTurnstileToken('');
        // Reset turnstile captcha to allow re-verification
        if (emailCaptchaRef.current) {
          emailCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset verification state but keep password and countdown
      setCode('');
      setTurnstileToken('');
      // Reset turnstile captcha to allow re-verification
      if (emailCaptchaRef.current) {
        emailCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 检查手机号并进入下一步
  const handlePhoneContinue = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      showError('请输入有效的手机号码');
      return;
    }

    setLoading(true);
    

    try {
      const response = await fetch('/api/v1/user/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (data.code === 0) {
        // 根据手机号是否存在决定是登录还是注册
        setMode(data.data.exists ? 'phone-login' : 'phone-register');
      } else {
        showError(data.message || '检查手机号失败');
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 发送手机验证码
  const handleSendPhoneCode = async (purpose) => {
    if (countdown > 0) return;

    setLoading(true);
    

    try {
      const response = await fetch('/api/v1/user/send-phone-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose }),
      });

      const data = await response.json();

      if (data.code === 0) {
        setCountdown(60);
        
      } else {
        showError(data.message || '发送验证码失败');
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 手机号登录
  const handlePhoneLogin = async () => {
    if (!password) {
      showError('请输入密码');
      return;
    }

    // Only check Turnstile token if Turnstile is enabled
    if (enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const response = await fetch('/api/v1/user/login-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      const data = await response.json();

      if (data.code === 0) {
        trackUserLogin(); // 记录登录统计
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        // Reset captcha state to allow re-verification
        setTurnstileToken('');
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset captcha state to allow re-verification
      setTurnstileToken('');
      if (phoneCaptchaRef.current) {
        phoneCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 手机号注册
  const handlePhoneRegister = async () => {
    if (!password || password.length < 8) {
      showError('密码长度至少8位');
      return;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (!code) {
      showError('请输入验证码');
      return;
    }

    // Only check Turnstile token if Turnstile is enabled
    if (enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const requestBody = {
        phone,
        password,
        code
      };

      // 如果有邀请码，添加到请求中
      if (invitationCode) {
        requestBody.invitation_code = invitationCode;
      }

      const response = await fetch('/api/v1/user/register-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.code === 0) {
        trackUserRegister(); // 记录注册统计
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        
        // 如果有注册赠送经费，保存到localStorage供App层显示欢迎弹窗
        if (data.data.register_gift_gold && data.data.register_gift_gold > 0) {
          localStorage.setItem('pending_welcome_modal', JSON.stringify({
            giftAmount: data.data.register_gift_gold,
            timestamp: Date.now()
          }));
          // 触发自定义事件通知App层显示欢迎弹窗
          window.dispatchEvent(new CustomEvent('show:welcome_modal'));
        }
        
        handleClose();
      } else {
        showError(data.message || '注册失败');
        // Reset verification state but keep password and countdown
        setCode('');
        setTurnstileToken('');
        // Reset turnstile captcha to allow re-verification
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset verification state but keep password and countdown
      setCode('');
      setTurnstileToken('');
      // Reset turnstile captcha to allow re-verification
      if (phoneCaptchaRef.current) {
        phoneCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 邮箱重置密码
  const handleResetPassword = async () => {
    if (!code) {
      showError('请输入验证码');
      return;
    }

    if (!password || password.length < 8) {
      showError('密码长度至少8位');
      return;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/user/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: password }),
      });

      const data = await response.json();

      if (data.code === 0) {
        showSuccess('密码重置成功');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setCode('');
      } else {
        showError(data.message || '重置密码失败');
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 手机号重置密码
  const handleResetPasswordPhone = async () => {
    if (!code) {
      showError('请输入验证码');
      return;
    }

    if (!password || password.length < 8) {
      showError('密码长度至少8位');
      return;
    }

    if (password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/user/reset-password-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, new_password: password }),
      });

      const data = await response.json();

      if (data.code === 0) {
        showSuccess('密码重置成功');
        setMode('phone-login');
        setPassword('');
        setConfirmPassword('');
        setCode('');
      } else {
        showError(data.message || '重置密码失败');
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 手机号验证码登录
  const handleLoginPhoneWithCode = async () => {
    if (!code) {
      showError('请输入验证码');
      return;
    }

    // Only check Turnstile token if Turnstile is enabled
    if (enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/user/login-phone-with-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, turnstile_token: turnstileToken }),
      });

      const data = await response.json();

      if (data.code === 0) {
        trackUserLogin(); // 记录登录统计
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        setCode('');
        setTurnstileToken('');
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
      setCode('');
      setTurnstileToken('');
      if (phoneCaptchaRef.current) {
        phoneCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 微信登录 - 显示内嵌二维码
  const handleWeChatLogin = async () => {
    try {
      // CRITICAL: Clean up any bind-related data from previous operations
      localStorage.removeItem('wechat_bind_state');
      localStorage.removeItem('wechat_bind_mode');

      setWechatQRCodeLoading(true);
      setMode('wechat-qrcode');

      // 获取微信内嵌二维码配置
      const response = await userAPI.getWeChatQRCodeConfig();

      if (response.data.code === 0 && response.data.data) {
        const { app_id, redirect_uri, state, scope } = response.data.data;

        // 保存 state 用于回调验证
        localStorage.setItem('wechat_oauth_state', state);
        setWechatState(state);

        // 保存当前 URL 用于登录后返回
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/') {
          localStorage.setItem('wechat_return_url', currentPath);
        }

        // 保存邀请码（如果有）
        const urlParams = new URLSearchParams(window.location.search);
        const inviteParam = urlParams.get('invite');
        if (inviteParam) {
          localStorage.setItem('oauth_invitation_code', inviteParam);
        } else {
          localStorage.removeItem('oauth_invitation_code');
        }

        // 加载微信 JS SDK 并渲染二维码
        loadWeChatQRCode(app_id, redirect_uri, state, scope || 'snsapi_login');
      } else {
        showError(response.data.message || '获取微信登录配置失败');
        setMode('welcome');
      }
    } catch (err) {
      logger.error('WeChat login error:', err);
      showError('微信登录失败，请稍后重试');
      setMode('welcome');
    } finally {
      setWechatQRCodeLoading(false);
    }
  };

  // 加载微信 JS SDK 并渲染内嵌二维码
  const loadWeChatQRCode = useCallback((appId, redirectUri, state, scope) => {
    // 清空之前的二维码
    if (wechatQRCodeRef.current) {
      wechatQRCodeRef.current.innerHTML = '';
    }

    // 检查是否已加载微信 JS SDK
    if (window.WxLogin) {
      renderWeChatQRCode(appId, redirectUri, state, scope);
      return;
    }

    // 动态加载微信 JS SDK
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
    script.async = true;
    script.onload = () => {
      renderWeChatQRCode(appId, redirectUri, state, scope);
    };
    script.onerror = () => {
      showError('加载微信登录组件失败，请刷新页面重试');
      setMode('welcome');
    };
    document.body.appendChild(script);
  }, [showError]);

  // 渲染微信二维码
  const renderWeChatQRCode = (appId, redirectUri, state, scope) => {
    if (!window.WxLogin || !wechatQRCodeRef.current) {
      return;
    }

    try {
      // 使用微信 JS SDK 渲染二维码
      new window.WxLogin({
        self_redirect: false, // false 表示在新窗口打开回调页面
        id: 'wechat-qrcode-container',
        appid: appId,
        scope: scope,
        redirect_uri: encodeURIComponent(redirectUri),
        state: state,
        style: 'black', // 二维码样式，black 或 white
        href: '', // 可以自定义二维码样式的 CSS 链接
      });
    } catch (err) {
      logger.error('Render WeChat QR code error:', err);
      showError('渲染微信二维码失败');
      setMode('welcome');
    }
  };

  // GitHub 登录
  const handleGithubLogin = async () => {
    try {
      // Get GitHub login URL from backend
      const response = await userAPI.getGithubLoginURL();

      if (response.data.code === 0 && response.data.data) {
        const loginURL = response.data.data.url;
        const state = response.data.data.state;

        // Save state for verification after callback
        localStorage.setItem('github_oauth_state', state);

        // Save current URL for redirect after login
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/') {
          localStorage.setItem('github_return_url', currentPath);
        }

        // 保存邀请码（如果有）- 用于OAuth回调后处理新用户注册
        const urlParams = new URLSearchParams(window.location.search);
        const inviteParam = urlParams.get('invite');
        if (inviteParam) {
          localStorage.setItem('oauth_invitation_code', inviteParam);
        } else {
          localStorage.removeItem('oauth_invitation_code');
        }

        // Redirect to GitHub OAuth page
        window.location.href = loginURL;
      } else {
        showError(response.data.message || '获取 GitHub 登录链接失败');
      }
    } catch (err) {
      logger.error('GitHub login error:', err);
      showError('GitHub 登录失败，请稍后重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container">
        <button className="auth-modal-close" onClick={handleClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="auth-modal-body">
        {/* 欢迎页面 */}
        {mode === 'welcome' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">欢迎使用</h1>
              <p className="auth-subtitle">在以下登录方式中选择任意一种</p>
            </div>

            <div className="auth-form">
              <div className="auth-social-buttons">
                <button className="auth-social-button" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>手机号登录</span>
                </button>
                <button className="auth-social-button auth-wechat-button" onClick={handleWeChatLogin}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-0.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                  </svg>
                  <span>微信登录</span>
                </button>
                {enableGithubOAuth && (
                  <button className="auth-social-button auth-github-button" onClick={handleGithubLogin}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>Github 登录</span>
                  </button>
                )}
              </div>

              <div className="auth-separator">
                <span>或</span>
              </div>

              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="电子邮件地址"
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => e.key === 'Enter' && !isComposing && handleEmailContinue()}
                autoFocus
              />

              <button
                className="auth-button auth-button-primary"
                onClick={handleEmailContinue}
                disabled={loading}
              >
                {loading ? '检查中...' : '登录'}
              </button>
            </div>
          </div>
        )}

        {/* 微信二维码页面 */}
        {mode === 'wechat-qrcode' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">微信扫码登录</h1>
              <p className="auth-subtitle">请使用微信扫描二维码登录</p>
            </div>

            <div className="auth-wechat-qrcode-wrapper">
              {wechatQRCodeLoading ? (
                <div className="auth-wechat-qrcode-loading">
                  <div className="auth-loading-spinner"></div>
                  <span>正在加载二维码...</span>
                </div>
              ) : (
                <div
                  id="wechat-qrcode-container"
                  ref={wechatQRCodeRef}
                  className="auth-wechat-qrcode-container"
                ></div>
              )}
            </div>

            <div className="auth-wechat-tips">
              <p>打开微信，扫一扫登录</p>
            </div>

            <div className="auth-divider">
              <button className="auth-link" onClick={() => { clearInputs(); setMode('welcome'); }}>
                返回其他登录方式
              </button>
            </div>
          </div>
        )}

        {/* 登录页面 */}
        {mode === 'login' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">输入密码</h1>
            </div>

            <div className="auth-form">
              <div className="auth-email-input-group">
                <input
                  type="email"
                  className="auth-input"
                  value={email}
                  disabled
                  placeholder="电子邮件地址"
                />
                <button className="auth-edit-button" onClick={() => { clearInputs(); setMode('welcome'); }}>编辑</button>
              </div>

              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => e.key === 'Enter' && !isComposing && handleLogin()}
                autoFocus
              />

              <div className="auth-forgot-password">
                <button className="auth-link" onClick={() => setMode('forgot-password-email')}>
                  忘记了密码?
                </button>
              </div>

              <div className="auth-turnstile">
                <TurnstileCaptcha
                  ref={emailCaptchaRef}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onFail={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>

              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>
                      使用条款
                    </button>
                    和
                    <button className="auth-policy-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>
                      隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handleLogin}
                disabled={loading || (enableTurnstile && !turnstileToken) || !agreedToPolicy}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </div>
        )}

        {/* 注册页面 */}
        {mode === 'register' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">注册 Scholay</h1>
              <p className="auth-subtitle">1 分钟完成，立即上手。</p>
            </div>

            <div className="auth-email-display">
              <span>{email || '输入邮箱地址'}</span>
              {email && (
                <button className="auth-change-email" onClick={() => { clearInputs(); setMode('welcome'); }}>更换</button>
              )}
            </div>

            <div className="auth-form">
              {!email && (
                <input
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="电子邮件地址"
                  autoFocus
                />
              )}

              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少8位）"
                autoFocus={!!email}
              />

              <input
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={validateConfirmPassword}
                placeholder="确认密码"
              />

              {/* 密码错误提示 - 预留位置 */}
              <div className="auth-password-error-placeholder">
                {passwordError && <div className="auth-password-error">{passwordError}</div>}
              </div>

              {requireEmailVerification && (
                <div className="auth-code-group">
                  <input
                    type="text"
                    className="auth-input auth-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="验证码"
                    maxLength={6}
                  />
                  <button
                    className="auth-code-button"
                    onClick={() => handleSendCode('register')}
                    disabled={countdown > 0 || loading || !email}
                  >
                    {countdown > 0 ? `${countdown}秒` : '发送'}
                  </button>
                </div>
              )}

              <input
                type="text"
                className={`auth-input ${invitationCode ? 'auth-input-highlight' : ''}`}
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                placeholder="邀请码（可选）"
                maxLength={20}
              />

              <div className="auth-turnstile">
                <TurnstileCaptcha
                  ref={emailCaptchaRef}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onFail={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>


              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>
                      使用条款
                    </button>
                    和
                    <button className="auth-policy-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>
                      隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handleRegister}
                disabled={(enableTurnstile && !turnstileToken) || !agreedToPolicy}
              >
                注册
              </button>
            </div>
          </div>
        )}

        {/* 手机号欢迎页面 */}
        {mode === 'phone-welcome' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">手机快速登录</h1>
              <p className="auth-subtitle">短信验证，更快进入。</p>
            </div>

            <div className="auth-form">
              <input
                type="tel"
                className="auth-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="手机号码"
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => e.key === 'Enter' && !isComposing && handlePhoneContinue()}
                maxLength={11}
                autoFocus
              />


              <button
                className="auth-button auth-button-primary"
                onClick={handlePhoneContinue}
                disabled={loading}
              >
                {loading ? '检查中...' : '登录'}
              </button>

              <div className="auth-divider">
                <button className="auth-link" onClick={() => { clearInputs(); setMode('welcome'); }}>更多登录方式</button>
              </div>
            </div>
          </div>
        )}

        {/* 手机号登录页面 */}
        {mode === 'phone-login' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">使用手机登录</h1>
              <p className="auth-subtitle">密码或验证码皆可。</p>
            </div>

            <div className="auth-email-display">
              <span>{phone}</span>
              <button className="auth-change-email" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>更换</button>
            </div>

            <div className="auth-form">
              {!useCodeLogin ? (
                <>
                  <input
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码"
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => e.key === 'Enter' && !isComposing && handlePhoneLogin()}
                    autoFocus
                  />

                  <div className="auth-forgot-password">
                    <button className="auth-link" onClick={() => setUseCodeLogin(true)}>
                      使用验证码
                    </button>
                    <button className="auth-link" onClick={() => setMode('forgot-password-phone')}>
                      忘记密码？
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="auth-code-group">
                    <input
                      type="text"
                      className="auth-input auth-code-input"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="验证码"
                      maxLength={6}
                      autoFocus
                    />
                    <button
                      className="auth-code-button"
                      onClick={() => handleSendPhoneCode('login')}
                      disabled={countdown > 0 || loading || !phone}
                    >
                      {countdown > 0 ? `${countdown}秒` : '发送'}
                    </button>
                  </div>

                  <div className="auth-forgot-password">
                    <button className="auth-link" onClick={() => setUseCodeLogin(false)}>
                      使用密码
                    </button>
                  </div>
                </>
              )}

              <div className="auth-turnstile">
                <TurnstileCaptcha
                  ref={phoneCaptchaRef}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onFail={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>

              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>
                      使用条款
                    </button>
                    和
                    <button className="auth-policy-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>
                      隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={useCodeLogin ? handleLoginPhoneWithCode : handlePhoneLogin}
                disabled={loading || (enableTurnstile && !turnstileToken) || !agreedToPolicy}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </div>
        )}

        {/* 手机号注册页面 */}
        {mode === 'phone-register' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">注册 Scholay</h1>
              <p className="auth-subtitle">输入手机号 快速上手。</p>
            </div>

            <div className="auth-email-display">
              <span>{phone || '输入手机号码'}</span>
              {phone && (
                <button className="auth-change-email" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>更换</button>
              )}
            </div>

            <div className="auth-form">
              {!phone && (
                <input
                  type="tel"
                  className="auth-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="手机号码"
                  maxLength={11}
                  autoFocus
                />
              )}

              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码(至少8位)"
                autoFocus={!!phone}
              />

              <input
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={validateConfirmPassword}
                placeholder="确认密码"
              />

              {/* 密码错误提示 - 预留位置 */}
              <div className="auth-password-error-placeholder">
                {passwordError && <div className="auth-password-error">{passwordError}</div>}
              </div>

              <div className="auth-code-group">
                <input
                  type="text"
                  className="auth-input auth-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="验证码"
                  maxLength={6}
                />
                <button
                  className="auth-code-button"
                  onClick={() => handleSendPhoneCode('register')}
                  disabled={countdown > 0 || loading || !phone}
                >
                  {countdown > 0 ? `${countdown}秒` : '发送'}
                </button>
              </div>

              <input
                type="text"
                className={`auth-input ${invitationCode ? 'auth-input-highlight' : ''}`}
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                placeholder="邀请码（可选）"
                maxLength={20}
              />

              <div className="auth-turnstile">
                <TurnstileCaptcha
                  ref={phoneCaptchaRef}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onFail={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>


              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>
                      使用条款
                    </button>
                    和
                    <button className="auth-policy-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>
                      隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handlePhoneRegister}
                disabled={(enableTurnstile && !turnstileToken) || !agreedToPolicy}
              >
                注册
              </button>
            </div>
          </div>
        )}

        {/* 忘记密码 - 邮箱 */}
        {mode === 'forgot-password-email' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">重置密码</h1>
              <p className="auth-subtitle">输入验证码后立刻修改。</p>
            </div>

            <div className="auth-email-display">
              <span>{email}</span>
              <button className="auth-change-email" onClick={() => setMode('welcome')}>更换</button>
            </div>

            <div className="auth-form">
              <div className="auth-code-group">
                <input
                  type="text"
                  className="auth-input auth-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="验证码"
                  maxLength={6}
                  autoFocus
                />
                <button
                  className="auth-code-button"
                  onClick={() => handleSendCode('reset_password')}
                  disabled={countdown > 0 || loading || !email}
                >
                  {countdown > 0 ? `${countdown}秒` : '发送'}
                </button>
              </div>

              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="新密码（至少8位）"
              />

              <input
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={validateConfirmPassword}
                placeholder="确认新密码"
              />

              {/* 密码错误提示 - 预留位置 */}
              <div className="auth-password-error-placeholder">
                {passwordError && <div className="auth-password-error">{passwordError}</div>}
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handleResetPassword}
                disabled={loading}
              >
                {loading ? '重置中...' : '重置密码'}
              </button>
            </div>
          </div>
        )}

        {/* 忘记密码 - 手机号 */}
        {mode === 'forgot-password-phone' && (
          <div className="auth-content">
            <div className="auth-headline">
              <h1 className="auth-title">短信重置密码</h1>
              <p className="auth-subtitle">短信验证码后即可修改。</p>
            </div>

            <div className="auth-email-display">
              <span>{phone}</span>
              <button className="auth-change-email" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>更换</button>
            </div>

            <div className="auth-form">
              <div className="auth-code-group">
                <input
                  type="text"
                  className="auth-input auth-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="验证码"
                  maxLength={6}
                  autoFocus
                />
                <button
                  className="auth-code-button"
                  onClick={() => handleSendPhoneCode('reset_password')}
                  disabled={countdown > 0 || loading || !phone}
                >
                  {countdown > 0 ? `${countdown}秒` : '发送'}
                </button>
              </div>

              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="新密码（至少8位）"
              />

              <input
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={validateConfirmPassword}
                placeholder="确认新密码"
              />

              {/* 密码错误提示 - 预留位置 */}
              <div className="auth-password-error-placeholder">
                {passwordError && <div className="auth-password-error">{passwordError}</div>}
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handleResetPasswordPhone}
                disabled={loading}
              >
                {loading ? '重置中...' : '重置密码'}
              </button>
            </div>
          </div>
        )}

        {/* 只在没有政策复选框的页面显示 footer */}
        {mode !== 'login' && mode !== 'register' && mode !== 'phone-login' && mode !== 'phone-register' && (
          <div className="auth-footer">
            <button className="auth-footer-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>使用条款</button>
            <span>|</span>
            <button className="auth-footer-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>隐私政策</button>
          </div>
        )}
        </div>

        {/* 隐私协议弹窗 */}
        {showPolicy && (
          <div className="policy-overlay" onClick={() => setShowPolicy(false)}>
            <div className="policy-container" onClick={(e) => e.stopPropagation()}>
              <div className="policy-header">
                <h3>{policyType === 'privacy' ? '隐私政策' : '使用条款'}</h3>
                <button onClick={() => setShowPolicy(false)}>×</button>
              </div>
              <div className="policy-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {policyType === 'privacy' ? privacyContent : termsContent}
                </ReactMarkdown>
              </div>
              <div className="policy-footer">
                <button
                  className="auth-button auth-button-primary"
                  onClick={() => {
                    setAgreedToPolicy(true);
                    setShowPolicy(false);
                  }}
                >
                  同意并继续
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;

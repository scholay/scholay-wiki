import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import SliderCaptcha from './SliderCaptcha';
import { useToast } from './ToastContainer';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();
  const [mode, setMode] = useState('welcome'); // 'welcome', 'login', 'register', 'phone-welcome', 'phone-login', 'phone-register', 'forgot-password-email', 'forgot-password-phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false); // Toggle between password and code login

  // Refs for captcha components
  const emailCaptchaRef = useRef(null);
  const phoneCaptchaRef = useRef(null);

  // 每次打开弹窗时重置条款同意状态
  useEffect(() => {
    if (isOpen) {
      setAgreedToPolicy(false);
    }
  }, [isOpen]);
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyContent, setPolicyContent] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);

  // 获取隐私协议和系统配置
  useEffect(() => {
    if (isOpen) {
      // 获取隐私协议
      fetch('/api/v1/config/privacy-policy')
        .then(res => res.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            setPolicyContent(data.data.content);
          }
        })
        .catch(() => {
          setPolicyContent('隐私协议加载失败');
        });

      // 获取系统配置
      fetch('/api/v1/config/system')
        .then(res => res.json())
        .then(data => {
          if (data.code === 0 && data.data) {
            setRequireEmailVerification(data.data.require_email_verification ?? true);
          }
        })
        .catch(() => {
          setRequireEmailVerification(true);
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
    setCaptchaVerified(false);
    setAgreedToPolicy(false);
    setPasswordError('');
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

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);
    

    try {
      const response = await fetch('/api/v1/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.code === 0) {
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        // Reset captcha state to allow re-verification
        setCaptchaVerified(false);
        if (emailCaptchaRef.current) {
          emailCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
      // Reset captcha state to allow re-verification
      setCaptchaVerified(false);
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

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const response = await fetch('/api/v1/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      });

      const data = await response.json();

      if (data.code === 0) {
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '注册失败');
        // Reset verification state but keep password and countdown
        setCode('');
        setCaptchaVerified(false);
        // Reset slider captcha to allow re-verification
        if (emailCaptchaRef.current) {
          emailCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset verification state but keep password and countdown
      setCode('');
      setCaptchaVerified(false);
      // Reset slider captcha to allow re-verification
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

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
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
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        // Reset captcha state to allow re-verification
        setCaptchaVerified(false);
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset captcha state to allow re-verification
      setCaptchaVerified(false);
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

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);


    try {
      const response = await fetch('/api/v1/user/register-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, code }),
      });

      const data = await response.json();

      if (data.code === 0) {
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '注册失败');
        // Reset verification state but keep password and countdown
        setCode('');
        setCaptchaVerified(false);
        // Reset slider captcha to allow re-verification
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误,请稍后重试');
      // Reset verification state but keep password and countdown
      setCode('');
      setCaptchaVerified(false);
      // Reset slider captcha to allow re-verification
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

  // 邮箱验证码登录
  const handleLoginWithCode = async () => {
    if (!code) {
      showError('请输入验证码');
      return;
    }

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/user/login-with-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (data.code === 0) {
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        setCode('');
        setCaptchaVerified(false);
        if (emailCaptchaRef.current) {
          emailCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
      setCode('');
      setCaptchaVerified(false);
      if (emailCaptchaRef.current) {
        emailCaptchaRef.current.reset();
      }
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

    if (!captchaVerified) {
      showError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      showError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/user/login-phone-with-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await response.json();

      if (data.code === 0) {
        login(data.data.token, data.data.user);
        if (onLoginSuccess) onLoginSuccess(data.data.user);
        handleClose();
      } else {
        showError(data.message || '登录失败');
        setCode('');
        setCaptchaVerified(false);
        if (phoneCaptchaRef.current) {
          phoneCaptchaRef.current.reset();
        }
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
      setCode('');
      setCaptchaVerified(false);
      if (phoneCaptchaRef.current) {
        phoneCaptchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  // 微信登录
  const handleWeChatLogin = async () => {
    try {
      // Generate random state for CSRF protection
      const state = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wechat_oauth_state', state);

      // Get WeChat login URL from backend
      const response = await userAPI.getWeChatLoginURL(state);

      if (response.data.code === 0 && response.data.data) {
        const loginURL = response.data.data.login_url;
        // Redirect to WeChat OAuth page
        window.location.href = loginURL;
      } else {
        showError(response.data.message || '获取微信登录链接失败');
      }
    } catch (err) {
      console.error('WeChat login error:', err);
      showError('微信登录失败,请稍后重试');
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

        {/* 欢迎页面 */}
        {mode === 'welcome' && (
          <div className="auth-content">
            <h1 className="auth-title">欢迎回来</h1>

            <div className="auth-form">
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="电子邮件地址"
                onKeyPress={(e) => e.key === 'Enter' && handleEmailContinue()}
                autoFocus
              />


              <button
                className="auth-button auth-button-primary"
                onClick={handleEmailContinue}
                disabled={loading}
              >
                {loading ? '检查中...' : '继续'}
              </button>

              <div className="auth-divider">
                <span>还没有账户？</span>
                <button className="auth-link" onClick={() => setMode('register')}>请注册</button>
              </div>

              <div className="auth-separator">
                <span>或</span>
              </div>

              <div className="auth-social-buttons">
                <button className="auth-social-button" onClick={() => setMode('phone-welcome')}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>继续使用手机登录</span>
                </button>
              </div>
            </div>

            <div className="auth-footer">
              <button className="auth-footer-link" onClick={() => setShowPolicy(true)}>使用条款</button>
              <span>|</span>
              <button className="auth-footer-link" onClick={() => setShowPolicy(true)}>隐私政策</button>
            </div>
          </div>
        )}

        {/* 登录页面 */}
        {mode === 'login' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('welcome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">登录</h1>

            <div className="auth-email-display">
              <span>{email}</span>
              <button className="auth-change-email" onClick={() => setMode('welcome')}>更换</button>
            </div>

            <div className="auth-form">
              {/* Login method toggle */}
              <div className="auth-login-method-toggle">
                <button
                  className={`auth-toggle-btn ${!useCodeLogin ? 'active' : ''}`}
                  onClick={() => setUseCodeLogin(false)}
                >
                  密码登录
                </button>
                <button
                  className={`auth-toggle-btn ${useCodeLogin ? 'active' : ''}`}
                  onClick={() => setUseCodeLogin(true)}
                >
                  验证码登录
                </button>
              </div>

              {!useCodeLogin ? (
                <>
                  <input
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码"
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    autoFocus
                  />

                  <div className="auth-forgot-password">
                    <button className="auth-link" onClick={() => setMode('forgot-password-email')}>
                      忘记密码？
                    </button>
                  </div>
                </>
              ) : (
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
                    onClick={() => handleSendCode('login')}
                    disabled={countdown > 0 || loading || !email}
                  >
                    {countdown > 0 ? `${countdown}秒` : '发送'}
                  </button>
                </div>
              )}

              <SliderCaptcha
                ref={emailCaptchaRef}
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />

              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => setShowPolicy(true)}>
                      使用条款和隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={useCodeLogin ? handleLoginWithCode : handleLogin}
                disabled={loading || !captchaVerified || !agreedToPolicy}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </div>
        )}

        {/* 注册页面 */}
        {mode === 'register' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('welcome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">注册账户</h1>

            <div className="auth-email-display">
              <span>{email || '输入邮箱地址'}</span>
              {email && (
                <button className="auth-change-email" onClick={() => setMode('welcome')}>更换</button>
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
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading || !email}
                  >
                    {countdown > 0 ? `${countdown}秒` : '发送'}
                  </button>
                </div>
              )}

              <SliderCaptcha
                ref={emailCaptchaRef}
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />


              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => setShowPolicy(true)}>
                      使用条款和隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handleRegister}
                disabled={!captchaVerified || !agreedToPolicy}
              >
                注册
              </button>

              <div className="auth-divider">
                <span>已有账户？</span>
                <button className="auth-link" onClick={() => setMode('welcome')}>立即登录</button>
              </div>
            </div>
          </div>
        )}

        {/* 手机号欢迎页面 */}
        {mode === 'phone-welcome' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('welcome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">手机号登录</h1>

            <div className="auth-form">
              <input
                type="tel"
                className="auth-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="手机号码"
                onKeyPress={(e) => e.key === 'Enter' && handlePhoneContinue()}
                maxLength={11}
                autoFocus
              />


              <button
                className="auth-button auth-button-primary"
                onClick={handlePhoneContinue}
                disabled={loading}
              >
                {loading ? '检查中...' : '继续'}
              </button>

              <div className="auth-divider">
                <span>还没有账户?</span>
                <button className="auth-link" onClick={() => setMode('phone-register')}>请注册</button>
              </div>
            </div>

            <div className="auth-footer">
              <button className="auth-footer-link" onClick={() => setShowPolicy(true)}>使用条款</button>
              <span>|</span>
              <button className="auth-footer-link" onClick={() => setShowPolicy(true)}>隐私政策</button>
            </div>
          </div>
        )}

        {/* 手机号登录页面 */}
        {mode === 'phone-login' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('phone-welcome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">登录</h1>

            <div className="auth-email-display">
              <span>{phone}</span>
              <button className="auth-change-email" onClick={() => setMode('phone-welcome')}>更换</button>
            </div>

            <div className="auth-form">
              {/* Login method toggle */}
              <div className="auth-login-method-toggle">
                <button
                  className={`auth-toggle-btn ${!useCodeLogin ? 'active' : ''}`}
                  onClick={() => setUseCodeLogin(false)}
                >
                  密码登录
                </button>
                <button
                  className={`auth-toggle-btn ${useCodeLogin ? 'active' : ''}`}
                  onClick={() => setUseCodeLogin(true)}
                >
                  验证码登录
                </button>
              </div>

              {!useCodeLogin ? (
                <>
                  <input
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码"
                    onKeyPress={(e) => e.key === 'Enter' && handlePhoneLogin()}
                    autoFocus
                  />

                  <div className="auth-forgot-password">
                    <button className="auth-link" onClick={() => setMode('forgot-password-phone')}>
                      忘记密码？
                    </button>
                  </div>
                </>
              ) : (
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
              )}

              <SliderCaptcha
                ref={phoneCaptchaRef}
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />

              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => setShowPolicy(true)}>
                      使用条款和隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={useCodeLogin ? handleLoginPhoneWithCode : handlePhoneLogin}
                disabled={loading || !captchaVerified || !agreedToPolicy}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </div>
        )}

        {/* 手机号注册页面 */}
        {mode === 'phone-register' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('phone-welcome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">注册账户</h1>

            <div className="auth-email-display">
              <span>{phone || '输入手机号码'}</span>
              {phone && (
                <button className="auth-change-email" onClick={() => setMode('phone-welcome')}>更换</button>
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

              <SliderCaptcha
                ref={phoneCaptchaRef}
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />


              <div className="auth-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  />
                  <span>
                    我已阅读并同意
                    <button className="auth-policy-link" onClick={() => setShowPolicy(true)}>
                      使用条款和隐私政策
                    </button>
                  </span>
                </label>
              </div>

              <button
                className="auth-button auth-button-primary"
                onClick={handlePhoneRegister}
                disabled={!captchaVerified || !agreedToPolicy}
              >
                注册
              </button>

              <div className="auth-divider">
                <span>已有账户?</span>
                <button className="auth-link" onClick={() => setMode('phone-welcome')}>立即登录</button>
              </div>
            </div>
          </div>
        )}

        {/* 忘记密码 - 邮箱 */}
        {mode === 'forgot-password-email' && (
          <div className="auth-content">
            <button className="auth-back" onClick={() => setMode('login')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">重置密码</h1>

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
            <button className="auth-back" onClick={() => setMode('phone-login')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <h1 className="auth-title">重置密码</h1>

            <div className="auth-email-display">
              <span>{phone}</span>
              <button className="auth-change-email" onClick={() => setMode('phone-welcome')}>更换</button>
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

        {/* 隐私协议弹窗 */}
        {showPolicy && (
          <div className="policy-overlay" onClick={() => setShowPolicy(false)}>
            <div className="policy-container" onClick={(e) => e.stopPropagation()}>
              <div className="policy-header">
                <h3>使用条款和隐私政策</h3>
                <button onClick={() => setShowPolicy(false)}>×</button>
              </div>
              <div className="policy-body">
                <pre>{policyContent}</pre>
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

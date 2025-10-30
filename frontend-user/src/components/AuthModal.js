import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import SliderCaptcha from './SliderCaptcha';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const [mode, setMode] = useState('welcome'); // 'welcome', 'login', 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

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
  const [error, setError] = useState('');
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

  // 重置状态
  const resetState = () => {
    setMode('welcome');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setCaptchaVerified(false);
    setAgreedToPolicy(false);
    setError('');
  };

  // 关闭弹窗
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 检查邮箱并进入下一步
  const handleEmailContinue = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    setError('');

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
        setError(data.message || '检查邮箱失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    if (countdown > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/user/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'register' }),
      });

      const data = await response.json();

      if (data.code === 0) {
        setCountdown(60);
        setError('');
      } else {
        setError(data.message || '发送验证码失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async () => {
    if (!password) {
      setError('请输入密码');
      return;
    }

    if (!captchaVerified) {
      setError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      setError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);
    setError('');

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
        setError(data.message || '登录失败');
        setCaptchaVerified(false);
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      setCaptchaVerified(false);
    } finally {
      setLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    if (!password || password.length < 8) {
      setError('密码长度至少8位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (requireEmailVerification && !code) {
      setError('请输入验证码');
      return;
    }

    if (!captchaVerified) {
      setError('请完成滑块验证');
      return;
    }

    if (!agreedToPolicy) {
      setError('请同意使用条款和隐私政策');
      return;
    }

    setLoading(true);
    setError('');

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
        setError(data.message || '注册失败');
        setCaptchaVerified(false);
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      setCaptchaVerified(false);
    } finally {
      setLoading(false);
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

              {error && <div className="auth-error">{error}</div>}

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
                <button className="auth-social-button" disabled>
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>继续使用 Google 登录</span>
                </button>

                <button className="auth-social-button" disabled>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>继续使用 Apple 登录</span>
                </button>

                <button className="auth-social-button" disabled>
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                    <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                  <span>继续使用 Microsoft 登录</span>
                </button>

                <button className="auth-social-button" disabled>
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
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
              />

              <SliderCaptcha
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />

              {error && <div className="auth-error">{error}</div>}

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
                onClick={handleLogin}
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
                placeholder="确认密码"
              />

              {requireEmailVerification && (
                <div className="auth-code-group">
                  <input
                    type="text"
                    className="auth-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="验证码"
                    maxLength={6}
                  />
                  <button
                    className="auth-button auth-button-secondary"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading || !email}
                  >
                    {countdown > 0 ? `${countdown}秒` : '发送'}
                  </button>
                </div>
              )}

              <SliderCaptcha
                onSuccess={() => setCaptchaVerified(true)}
                onFail={() => setCaptchaVerified(false)}
              />

              {error && <div className="auth-error">{error}</div>}

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

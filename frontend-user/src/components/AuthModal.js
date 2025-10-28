import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import SliderCaptcha from './SliderCaptcha';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const [step, setStep] = useState(1); // 1: 输入邮箱, 2: 登录/注册
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
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
    setStep(1);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setIsExistingUser(false);
    setCaptchaVerified(false);
    setAgreedToPolicy(false);
    setError('');
  };

  // 关闭弹窗
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 检查邮箱是否存在
  const handleEmailNext = async () => {
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
        setIsExistingUser(data.data.exists);
        setStep(2);
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
      setError('请同意隐私协议');
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
        // Use AuthContext login function to update state
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
      setError('请同意隐私协议');
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
        // Use AuthContext login function to update state
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
      <div className="auth-modal-content">
        <button className="auth-modal-close" onClick={handleClose}>×</button>

        <div className="auth-modal-header">
          <h2>{step === 1 ? '登录 / 注册' : (isExistingUser ? '登录' : '注册')}</h2>
        </div>

        {/* 第一步：输入邮箱 */}
        {step === 1 && (
          <div className="auth-modal-body">
            <div className="form-group">
              <label>邮箱地址</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                onKeyPress={(e) => e.key === 'Enter' && handleEmailNext()}
                autoFocus
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button 
              className="btn-primary"
              onClick={handleEmailNext}
              disabled={loading}
            >
              {loading ? '检查中...' : '下一步'}
            </button>
          </div>
        )}

        {/* 第二步：登录 */}
        {step === 2 && isExistingUser && (
          <div className="auth-modal-body">
            <div className="email-display">
              <span>{email}</span>
              <button className="btn-text" onClick={() => setStep(1)}>更换</button>
            </div>

            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
              />
            </div>

            <SliderCaptcha
              onSuccess={() => setCaptchaVerified(true)}
              onFail={() => setCaptchaVerified(false)}
            />

            {error && <div className="error-message">{error}</div>}

            <div className="policy-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={agreedToPolicy}
                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                />
                我已阅读并同意
                <button 
                  className="btn-link"
                  onClick={() => setShowPolicy(true)}
                >
                  《隐私协议》
                </button>
              </label>
            </div>

            <button 
              className="btn-primary"
              onClick={handleLogin}
              disabled={loading || !captchaVerified || !agreedToPolicy}
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
        )}

        {/* 第二步：注册 */}
        {step === 2 && !isExistingUser && (
          <div className="auth-modal-body">
            <div className="email-display">
              <span>{email}</span>
              <button className="btn-text" onClick={() => setStep(1)}>更换</button>
            </div>

            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码（至少8位）"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
              />
            </div>

            {requireEmailVerification && (
              <div className="form-group">
                <label>验证码</label>
                <div className="code-input-group">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入验证码"
                    maxLength={6}
                  />
                  <button
                    className="btn-secondary"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading}
                  >
                    {countdown > 0 ? `${countdown}秒后重试` : '发送验证码'}
                  </button>
                </div>
              </div>
            )}

            <SliderCaptcha
              onSuccess={() => setCaptchaVerified(true)}
              onFail={() => setCaptchaVerified(false)}
            />

            {error && <div className="error-message">{error}</div>}

            <div className="policy-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={agreedToPolicy}
                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                />
                我已阅读并同意
                <button 
                  className="btn-link"
                  onClick={() => setShowPolicy(true)}
                >
                  《隐私协议》
                </button>
              </label>
            </div>

            <button 
              className="btn-primary"
              onClick={handleRegister}
              disabled={loading || !captchaVerified || !agreedToPolicy}
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
        )}

        {/* 隐私协议弹窗 */}
        {showPolicy && (
          <div className="policy-modal-overlay">
            <div className="policy-modal-content">
              <div className="policy-header">
                <h3>隐私协议</h3>
                <button onClick={() => setShowPolicy(false)}>×</button>
              </div>
              <div className="policy-body">
                <pre>{policyContent}</pre>
              </div>
              <div className="policy-footer">
                <button 
                  className="btn-primary"
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

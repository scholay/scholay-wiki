/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AuthModal - 轻量级协调器
 * 管理登录/注册流程状态，将具体表单委派给子组件。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Button, Divider, Segmented, ConfigProvider, theme } from 'antd';
import { useAuth } from '../utils/AuthContext';
import { userAPI, configAPI } from '../services/api';
import { useToast } from './ToastContainer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import logger from '../utils/logger';
import { EmailLoginForm, PhoneLoginForm, RegisterForm, ForgotPasswordForm, AdminLoginForm, WeChatLogin } from './auth';
import './auth/auth.css';

const { darkAlgorithm, defaultAlgorithm } = theme;

/* ---------- SVG 图标 ---------- */
const WeChatSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);
const GithubSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const AuthModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const { showError } = useToast();

  const [mode, setMode] = useState('welcome');
  const [loginMethod, setLoginMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const [config, setConfig] = useState({ requireEmailVerification: true, enableTurnstile: false, enableGithubOAuth: false });
  const [policyState, setPolicyState] = useState({ show: false, type: 'privacy' });
  const [privacyContent, setPrivacyContent] = useState('');
  const [termsContent, setTermsContent] = useState('');

  /* ---------- 获取配置 ---------- */
  useEffect(() => {
    if (!isOpen) return;
    Promise.allSettled([
      configAPI.getPrivacyPolicy(),
      configAPI.getTermsOfService(),
      configAPI.getSystemConfig(),
    ]).then(([privacy, terms, sys]) => {
      if (privacy.status === 'fulfilled' && privacy.value?.data?.code === 0) setPrivacyContent(privacy.value.data.data.content);
      if (terms.status === 'fulfilled' && terms.value?.data?.code === 0) setTermsContent(terms.value.data.data.content);
      if (sys.status === 'fulfilled' && sys.value?.data?.code === 0) {
        const d = sys.value.data.data;
        setConfig({ requireEmailVerification: d.require_email_verification ?? true, enableTurnstile: d.enable_turnstile ?? false, enableGithubOAuth: !!(d.github_client_id?.trim()) });
      }
    });
  }, [isOpen]);

  /* ---------- 回调 ---------- */
  const handleClose = useCallback(() => {
    setMode('welcome'); setEmail(''); setPhone(''); setAdminUsername('');
    setLoginMethod('email'); setLoading(false);
    onClose();
  }, [onClose]);

  const handleLoginSuccess = useCallback((token, user) => {
    login(token, user);
    handleClose();
    if (user?.role === 'admin') window.location.href = '/admin/dashboard';
    else onLoginSuccess?.(user);
  }, [login, handleClose, onLoginSuccess]);

  const handleModeChange = useCallback((m) => setMode(m), []);
  const handleShowPolicy = useCallback((t) => setPolicyState({ show: true, type: t }), []);

  /* ---------- 邮箱/用户名继续 ---------- */
  const handleEmailContinue = async () => {
    if (!email) { showError('请输入邮箱地址或管理员用户名'); return; }
    if (!email.includes('@')) {
      if (/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(email)) {
        setAdminUsername(email); setMode('admin-login'); return;
      }
      showError('请输入有效的邮箱地址，或以字母开头的管理员用户名'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('请输入有效的邮箱地址'); return; }
    setLoading(true);
    try {
      const res = await userAPI.checkEmail(email);
      if (res.data.code === 0) setMode(res.data.data.exists ? 'login' : 'register');
      else showError(res.data.message || '检查邮箱失败');
    } catch { showError('网络错误，请稍后重试'); } finally { setLoading(false); }
  };

  /* ---------- 手机号继续 ---------- */
  const handlePhoneContinue = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) { showError('请输入有效的手机号码'); return; }
    setLoading(true);
    try {
      const res = await userAPI.checkPhone(phone);
      if (res.data.code === 0) setMode(res.data.data.exists ? 'phone-login' : 'phone-register');
      else showError(res.data.message || '检查手机号失败');
    } catch { showError('网络错误,请稍后重试'); } finally { setLoading(false); }
  };

  /* ---------- GitHub ---------- */
  const handleGithubLogin = async () => {
    try {
      const response = await userAPI.getGithubLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('github_oauth_state', response.data.data.state);
        const cur = window.location.pathname + window.location.search;
        if (cur !== '/') localStorage.setItem('github_return_url', cur);
        window.location.href = response.data.data.url;
      } else { showError(response.data.message || '获取 GitHub 登录链接失败'); }
    } catch (err) { logger.error('GitHub login error:', err); showError('GitHub 登录失败，请稍后重试'); }
  };

  /* ---------- 主题 ---------- */
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light';
  const themeConfig = {
    algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
    token: { colorPrimary: '#10a37f', borderRadius: 8 },
    components: {
      Modal: { borderRadiusLG: 28 },
      Input: { borderRadius: 999, controlHeightLG: 48 },
      Button: { borderRadius: 999, controlHeightLG: 48 },
      Segmented: { borderRadius: 12 },
    },
  };

  const commonProps = { config, onLoginSuccess: handleLoginSuccess, onModeChange: handleModeChange, onShowPolicy: handleShowPolicy };
  const hasSocial = config.enableGithubOAuth;
  const showFooter = !['login', 'register', 'phone-login', 'phone-register'].includes(mode);

  /* ---------- 渲染 ---------- */
  const renderContent = () => {
    switch (mode) {
      case 'welcome': return (
        <div className="auth-content">
          <div className="auth-headline">
            <h1 className="auth-title">欢迎使用</h1>
            <p className="auth-subtitle">在以下登录方式中选择任意一种</p>
          </div>
          <div className="auth-social-buttons">
            <button type="button" className="auth-social-button auth-wechat-button" onClick={() => setMode('wechat-qrcode')}>
              <WeChatSvg /><span>微信登录</span>
            </button>
            {hasSocial && (
              <button type="button" className="auth-social-button auth-github-button" onClick={handleGithubLogin}>
                <GithubSvg /><span>Github 登录</span>
              </button>
            )}
          </div>
          <Divider plain>或</Divider>
          <Segmented value={loginMethod} onChange={setLoginMethod} block options={[{ label: '邮箱登录', value: 'email' }, { label: '手机登录', value: 'phone' }]} className="auth-segmented" />
          {loginMethod === 'email' ? (
            <div className="auth-form">
              <Input size="large" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱地址或管理员用户名"
                onCompositionStart={() => setIsComposing(true)} onCompositionEnd={() => setIsComposing(false)}
                onPressEnter={() => !isComposing && handleEmailContinue()} autoFocus />
              <Button type="primary" size="large" block loading={loading} onClick={handleEmailContinue}>继续</Button>
            </div>
          ) : (
            <div className="auth-form">
              <Input size="large" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="手机号码" maxLength={11}
                onCompositionStart={() => setIsComposing(true)} onCompositionEnd={() => setIsComposing(false)}
                onPressEnter={() => !isComposing && handlePhoneContinue()} autoFocus />
              <Button type="primary" size="large" block loading={loading} onClick={handlePhoneContinue}>继续</Button>
            </div>
          )}
        </div>
      );
      case 'login': return <EmailLoginForm email={email} {...commonProps} />;
      case 'register': return <RegisterForm type="email" identifier={email} {...commonProps} />;
      case 'phone-login': return <PhoneLoginForm phone={phone} {...commonProps} />;
      case 'phone-register': return <RegisterForm type="phone" identifier={phone} {...commonProps} />;
      case 'forgot-password-email': return <ForgotPasswordForm type="email" identifier={email} onModeChange={handleModeChange} />;
      case 'forgot-password-phone': return <ForgotPasswordForm type="phone" identifier={phone} onModeChange={handleModeChange} />;
      case 'admin-login': return <AdminLoginForm username={adminUsername} onLoginSuccess={handleLoginSuccess} onModeChange={handleModeChange} />;
      case 'wechat-qrcode': return <WeChatLogin onModeChange={handleModeChange} />;
      default: return null;
    }
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <Modal open={isOpen} onCancel={handleClose} footer={null} centered width={460} destroyOnClose
        className="auth-modal" styles={{ mask: { background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)' } }}>
        {renderContent()}
        {showFooter && (
          <div className="auth-footer">
            <Button type="link" size="small" onClick={() => handleShowPolicy('terms')}>使用条款</Button>
            <span>|</span>
            <Button type="link" size="small" onClick={() => handleShowPolicy('privacy')}>隐私政策</Button>
          </div>
        )}
      </Modal>

      <Modal open={policyState.show} onCancel={() => setPolicyState((s) => ({ ...s, show: false }))}
        title={policyState.type === 'privacy' ? '隐私政策' : '使用条款'} centered width={650} zIndex={10001}
        footer={<Button type="primary" block onClick={() => setPolicyState((s) => ({ ...s, show: false }))}>同意并继续</Button>}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {policyState.type === 'privacy' ? privacyContent : termsContent}
          </ReactMarkdown>
        </div>
      </Modal>
    </ConfigProvider>
  );
};

export default AuthModal;

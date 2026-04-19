/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AuthModal — 认证弹窗（容器组件）
 * 所有表单 UI 已拆分到 auth/ 子组件，此文件只保留状态逻辑和路由。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
// AuthContext is untyped JS; use `any` at the call site to avoid migrating it.
import { useAuth } from '../../utils/AuthContext';
import type { User } from '../../types/user';
import { userAPI } from '../../services/user.api';
import { configAPI } from '../../services/payment.api';
import { useToast } from '../ToastContainer';
import logger from '../../utils/logger';

// Sub-components (untyped JS — typed via `any` props at usage sites where needed)
import WelcomePage from './WelcomePage';
import EmailLoginPage from './EmailLoginPage';
import EmailRegisterPage from './EmailRegisterPage';
import { PhoneWelcomePage, PhoneLoginPage, PhoneRegisterPage } from './PhonePages';
import ResetPasswordPage from './ResetPasswordPage';
import WeChatQRCodePage from './WeChatQRCodePage';
import PolicyModal from './PolicyModal';

import '../styles/auth-modal/index.css';

// ---- Types ----
type AuthMode =
  | 'welcome'
  | 'login'
  | 'register'
  | 'phone-welcome'
  | 'phone-login'
  | 'phone-register'
  | 'forgot-password-email'
  | 'forgot-password-phone'
  | 'wechat-qrcode';

type PolicyType = 'privacy' | 'terms';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (userData: User) => void;
}

interface WeChatConfig {
  appId: string;
  redirectUri: string;
  state: string;
  scope: string;
}

// Minimal interface for the slider captcha imperative handle exposed by sub-components.
interface CaptchaHandle {
  reset: () => void;
}

// window.WxLogin is provided by the dynamically-loaded WeChat SDK script.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WxLogin?: any;
  }
}

// useToast is untyped — narrow it locally.
interface ToastApi {
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const { showError, showSuccess } = useToast() as ToastApi;

  // ---- Core form state ----
  const [mode, setMode] = useState<AuthMode>('welcome');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // ---- Config state ----
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [passwordError, setPasswordError] = useState('');
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [enableTurnstile, setEnableTurnstile] = useState(false);
  const [enableGithubOAuth, setEnableGithubOAuth] = useState(false);
  const [enableDiscourseSSO, setEnableDiscourseSSO] = useState(false);
  const [showMoreOAuth, setShowMoreOAuth] = useState(false);

  // ---- Policy state ----
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyType, setPolicyType] = useState<PolicyType>('privacy');
  const [privacyContent, setPrivacyContent] = useState('');
  const [termsContent, setTermsContent] = useState('');

  // ---- WeChat state ----
  const [wechatQRCodeLoading, setWechatQRCodeLoading] = useState(false);
  const [, setWechatState] = useState('');
  const [wechatConfig, setWechatConfig] = useState<WeChatConfig | null>(null);
  const wechatQRCodeRef = useRef<HTMLDivElement | null>(null);

  const emailCaptchaRef = useRef<CaptchaHandle | null>(null);
  const phoneCaptchaRef = useRef<CaptchaHandle | null>(null);

  // ===========================================================================
  // Effects
  // ===========================================================================
  useEffect(() => { if (isOpen) setAgreedToPolicy(false); }, [isOpen]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (!isOpen) return;
    configAPI.getPrivacyPolicy().then((r) => { if (r.data.code === 0 && r.data.data) setPrivacyContent(r.data.data.content); }).catch(() => setPrivacyContent('隐私协议加载失败'));
    configAPI.getTermsOfService().then((r) => { if (r.data.code === 0 && r.data.data) setTermsContent(r.data.data.content); }).catch(() => setTermsContent('用户协议加载失败'));
    configAPI.getSystemConfig().then((r) => {
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setRequireEmailVerification(d.require_email_verification ?? true);
        const te = d.enable_turnstile ?? false;
        setEnableTurnstile(te);
        setEnableGithubOAuth(!!(d.github_client_id && d.github_client_id.trim() !== ''));
        setEnableDiscourseSSO(!!(d.discourse_site_url && d.discourse_site_url.trim() !== ''));
        if (!te) setTurnstileToken('disabled');
      }
    }).catch(() => { setRequireEmailVerification(true); setEnableTurnstile(false); setEnableGithubOAuth(false); setEnableDiscourseSSO(false); setTurnstileToken('disabled'); });
  }, [isOpen]);

  // WeChat QR re-render
  useEffect(() => {
    if (mode === 'wechat-qrcode' && wechatConfig && !wechatQRCodeLoading && wechatQRCodeRef.current) {
      const timer = setTimeout(() => {
        if (wechatQRCodeRef.current && window.WxLogin) {
          wechatQRCodeRef.current.innerHTML = '';
          const qrStyleURL = `${window.location.origin}/wechat-qr-style.css`;
          try { new window.WxLogin({ self_redirect: false, id: 'wechat-qrcode-container', appid: wechatConfig.appId, scope: wechatConfig.scope, redirect_uri: encodeURIComponent(wechatConfig.redirectUri), state: wechatConfig.state, style: 'black', href: qrStyleURL }); } catch (err) { logger.error('Re-render WeChat QR code error:', err); }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mode, wechatConfig, wechatQRCodeLoading]);

  // ===========================================================================
  // Shared helpers
  // ===========================================================================
  const resetState = useCallback(() => {
    setMode('welcome'); setEmail(''); setPhone(''); setPassword(''); setConfirmPassword('');
    setCode(''); setTurnstileToken(''); setAgreedToPolicy(false); setPasswordError('');
    setUseCodeLogin(false); setWechatQRCodeLoading(false); setWechatState('');
  }, []);

  const clearInputs = useCallback(() => {
    setPassword(''); setConfirmPassword(''); setCode(''); setPasswordError(''); setCountdown(0);
    emailCaptchaRef.current?.reset(); phoneCaptchaRef.current?.reset();
  }, []);

  const handleClose = useCallback(() => { resetState(); onClose(); }, [resetState, onClose]);

  const validateConfirmPassword = useCallback(() => {
    setPasswordError(confirmPassword && password !== confirmPassword ? '两次输入的密码不一致' : '');
  }, [password, confirmPassword]);

  const onSuccess = useCallback((token: string, userData: User) => {
    login(token, userData);
    if (onLoginSuccess) onLoginSuccess(userData);
    handleClose();
  }, [login, onLoginSuccess, handleClose]);

  const resetCaptcha = useCallback((type: 'email' | 'phone' = 'email') => {
    setTurnstileToken('');
    if (type === 'email') emailCaptchaRef.current?.reset(); else phoneCaptchaRef.current?.reset();
  }, []);

  // ===========================================================================
  // Handler factories (business logic stays here, UI in sub-components)
  // ===========================================================================

  const handleEmailContinue = useCallback(async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('请输入有效的邮箱地址'); return; }
    setLoading(true);
    try {
      const r = await userAPI.checkEmail(email);
      if (r.data.code === 0) setMode(r.data.data.exists ? 'login' : 'register');
      else showError(r.data.message || '检查邮箱失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误，请稍后重试'); }
    finally { setLoading(false); }
  }, [email, showError]);

  const handleSendCode = useCallback(async (purpose: string = 'register') => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const r = await userAPI.sendVerificationCode(email, purpose);
      if (r.data.code === 0) { setCountdown(60); showSuccess('验证码已发送'); }
      else showError(r.data.message || '发送验证码失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误，请稍后重试'); }
    finally { setLoading(false); }
  }, [countdown, email, showError, showSuccess]);

  const handleLogin = useCallback(async () => {
    if (!password) { showError('请输入密码'); return; }
    if (enableTurnstile && !turnstileToken) { showError('请完成人机验证'); return; }
    if (!agreedToPolicy) { showError('请阅读并同意使用条款和隐私政策'); return; }
    setLoading(true);
    try {
      const r = await userAPI.login(email, password, turnstileToken);
      if (r.data.code === 0) onSuccess(r.data.data.token, r.data.data.user);
      else { showError(r.data.message || '登录失败'); resetCaptcha('email'); }
    } catch { showError('网络错误，请稍后重试'); resetCaptcha('email'); }
    finally { setLoading(false); }
  }, [password, enableTurnstile, turnstileToken, agreedToPolicy, email, showError, onSuccess, resetCaptcha]);

  const handleRegister = useCallback(async () => {
    if (!password || password.length < 8) { showError('密码长度至少8位'); return; }
    if (password !== confirmPassword) { showError('两次输入的密码不一致'); return; }
    if (requireEmailVerification && !code) { showError('请输入验证码'); return; }
    if (enableTurnstile && !turnstileToken) { showError('请完成人机验证'); return; }
    if (!agreedToPolicy) { showError('请阅读并同意使用条款和隐私政策'); return; }
    setLoading(true);
    try {
      const r = await userAPI.register(email, password, code, undefined, turnstileToken);
      if (r.data.code === 0) onSuccess(r.data.data.token, r.data.data.user);
      else { showError(r.data.message || '注册失败'); setCode(''); resetCaptcha('email'); }
    } catch { showError('网络错误,请稍后重试'); setCode(''); resetCaptcha('email'); }
    finally { setLoading(false); }
  }, [password, confirmPassword, requireEmailVerification, code, enableTurnstile, turnstileToken, agreedToPolicy, email, showError, onSuccess, resetCaptcha]);

  const handlePhoneContinue = useCallback(async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) { showError('请输入有效的手机号码'); return; }
    setLoading(true);
    try {
      const r = await userAPI.checkPhone(phone);
      if (r.data.code === 0) setMode(r.data.data.exists ? 'phone-login' : 'phone-register');
      else showError(r.data.message || '检查手机号失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误,请稍后重试'); }
    finally { setLoading(false); }
  }, [phone, showError]);

  const handleSendPhoneCode = useCallback(async (purpose: string) => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const r = await userAPI.sendPhoneCode(phone, purpose);
      if (r.data.code === 0) setCountdown(60);
      else showError(r.data.message || '发送验证码失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误,请稍后重试'); }
    finally { setLoading(false); }
  }, [countdown, phone, showError]);

  const handlePhoneLogin = useCallback(async () => {
    if (!password) { showError('请输入密码'); return; }
    if (enableTurnstile && !turnstileToken) { showError('请完成人机验证'); return; }
    if (!agreedToPolicy) { showError('请阅读并同意使用条款和隐私政策'); return; }
    setLoading(true);
    try {
      const r = await userAPI.loginWithPhone(phone, password);
      if (r.data.code === 0) onSuccess(r.data.data.token, r.data.data.user);
      else { showError(r.data.message || '登录失败'); resetCaptcha('phone'); }
    } catch { showError('网络错误,请稍后重试'); resetCaptcha('phone'); }
    finally { setLoading(false); }
  }, [password, enableTurnstile, turnstileToken, agreedToPolicy, phone, showError, onSuccess, resetCaptcha]);

  const handlePhoneRegister = useCallback(async () => {
    if (!password || password.length < 8) { showError('密码长度至少8位'); return; }
    if (password !== confirmPassword) { showError('两次输入的密码不一致'); return; }
    if (!code) { showError('请输入验证码'); return; }
    if (enableTurnstile && !turnstileToken) { showError('请完成人机验证'); return; }
    if (!agreedToPolicy) { showError('请阅读并同意使用条款和隐私政策'); return; }
    setLoading(true);
    try {
      const r = await userAPI.registerWithPhone(phone, password, code);
      if (r.data.code === 0) onSuccess(r.data.data.token, r.data.data.user);
      else { showError(r.data.message || '注册失败'); setCode(''); resetCaptcha('phone'); }
    } catch { showError('网络错误,请稍后重试'); setCode(''); resetCaptcha('phone'); }
    finally { setLoading(false); }
  }, [password, confirmPassword, code, enableTurnstile, turnstileToken, agreedToPolicy, phone, showError, onSuccess, resetCaptcha]);

  const handleLoginPhoneWithCode = useCallback(async () => {
    if (!code) { showError('请输入验证码'); return; }
    if (enableTurnstile && !turnstileToken) { showError('请完成人机验证'); return; }
    if (!agreedToPolicy) { showError('请阅读并同意使用条款和隐私政策'); return; }
    setLoading(true);
    try {
      const r = await userAPI.loginWithPhoneCode(phone, code, turnstileToken);
      if (r.data.code === 0) onSuccess(r.data.data.token, r.data.data.user);
      else { showError(r.data.message || '登录失败'); setCode(''); resetCaptcha('phone'); }
    } catch { showError('网络错误，请稍后重试'); setCode(''); resetCaptcha('phone'); }
    finally { setLoading(false); }
  }, [code, enableTurnstile, turnstileToken, agreedToPolicy, phone, showError, onSuccess, resetCaptcha]);

  const handleResetPassword = useCallback(async () => {
    if (!code) { showError('请输入验证码'); return; }
    if (!password || password.length < 8) { showError('密码长度至少8位'); return; }
    if (password !== confirmPassword) { showError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const r = await userAPI.resetPassword(email, code, password);
      if (r.data.code === 0) { showSuccess('密码重置成功'); setMode('login'); setPassword(''); setConfirmPassword(''); setCode(''); }
      else showError(r.data.message || '重置密码失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误，请稍后重试'); }
    finally { setLoading(false); }
  }, [code, password, confirmPassword, email, showError, showSuccess]);

  const handleResetPasswordPhone = useCallback(async () => {
    if (!code) { showError('请输入验证码'); return; }
    if (!password || password.length < 8) { showError('密码长度至少8位'); return; }
    if (password !== confirmPassword) { showError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const r = await userAPI.resetPasswordPhone(phone, code, password);
      if (r.data.code === 0) { showSuccess('密码重置成功'); setMode('phone-login'); setPassword(''); setConfirmPassword(''); setCode(''); }
      else showError(r.data.message || '重置密码失败');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) { showError(err.response?.data?.message || '网络错误，请稍后重试'); }
    finally { setLoading(false); }
  }, [code, password, confirmPassword, phone, showError, showSuccess]);

  const handleWeChatLogin = useCallback(async () => {
    try {
      localStorage.removeItem('wechat_bind_state'); localStorage.removeItem('wechat_bind_mode');
      setWechatQRCodeLoading(true); setMode('wechat-qrcode');
      const r = await userAPI.getWeChatQRCodeConfig();
      if (r.data.code === 0 && r.data.data) {
        const { app_id, redirect_uri, state, scope } = r.data.data;
        localStorage.setItem('wechat_oauth_state', state); setWechatState(state);
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/') localStorage.setItem('wechat_return_url', currentPath);
        const config: WeChatConfig = { appId: app_id, redirectUri: redirect_uri, state, scope: scope || 'snsapi_login' };
        setWechatConfig(config);
        // Load WeChat SDK
        const renderQR = (cfg: WeChatConfig) => {
          if (!window.WxLogin || !wechatQRCodeRef.current) return;
          try {
            const qrStyleURL = `${window.location.origin}/wechat-qr-style.css`;
            new window.WxLogin({ self_redirect: false, id: 'wechat-qrcode-container', appid: cfg.appId, scope: cfg.scope, redirect_uri: encodeURIComponent(cfg.redirectUri), state: cfg.state, style: 'black', href: qrStyleURL });
          } catch (err) { logger.error('Render WeChat QR error:', err); showError('渲染微信二维码失败'); setMode('welcome'); }
        };
        if (window.WxLogin) { renderQR(config); } else {
          const script = document.createElement('script');
          script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
          script.async = true;
          script.onload = () => renderQR(config);
          script.onerror = () => { showError('加载微信登录组件失败'); setMode('welcome'); };
          document.body.appendChild(script);
        }
      } else { showError(r.data.message || '获取微信登录配置失败'); setMode('welcome'); }
    } catch (err) { logger.error('WeChat login error:', err); showError('微信登录失败，请稍后重试'); setMode('welcome'); }
    finally { setWechatQRCodeLoading(false); }
  }, [showError]);

  // ===========================================================================
  // Shared props bundles (reduce prop-drilling verbosity)
  // ===========================================================================
  const sharedProps = { loading, clearInputs, setMode, setPolicyType, setShowPolicy };
  const formProps = { password, setPassword, confirmPassword, setConfirmPassword, code, setCode, countdown, turnstileToken, setTurnstileToken, agreedToPolicy, setAgreedToPolicy, enableTurnstile, passwordError, validateConfirmPassword, isComposing, setIsComposing };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container">
        <button className="auth-modal-close" onClick={handleClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="auth-modal-body">
          {mode === 'welcome' && (
            <WelcomePage email={email} setEmail={setEmail} {...sharedProps} {...formProps}
              enableDiscourseSSO={enableDiscourseSSO} enableGithubOAuth={enableGithubOAuth}
              showMoreOAuth={showMoreOAuth} setShowMoreOAuth={setShowMoreOAuth}
              showError={showError} onEmailContinue={handleEmailContinue} onWeChatLogin={handleWeChatLogin} />
          )}
          {mode === 'wechat-qrcode' && (
            <WeChatQRCodePage wechatQRCodeLoading={wechatQRCodeLoading} wechatQRCodeRef={wechatQRCodeRef} {...sharedProps} />
          )}
          {mode === 'login' && (
            <EmailLoginPage email={email} {...sharedProps} {...formProps} emailCaptchaRef={emailCaptchaRef} onLogin={handleLogin} />
          )}
          {mode === 'register' && (
            <EmailRegisterPage email={email} {...sharedProps} {...formProps}
              requireEmailVerification={requireEmailVerification} emailCaptchaRef={emailCaptchaRef}
              onSendCode={handleSendCode} onRegister={handleRegister} />
          )}
          {mode === 'phone-welcome' && (
            <PhoneWelcomePage phone={phone} setPhone={setPhone} {...sharedProps} {...formProps} onPhoneContinue={handlePhoneContinue} />
          )}
          {mode === 'phone-login' && (
            <PhoneLoginPage phone={phone} {...sharedProps} {...formProps}
              useCodeLogin={useCodeLogin} setUseCodeLogin={setUseCodeLogin}
              phoneCaptchaRef={phoneCaptchaRef}
              onPhoneLogin={handlePhoneLogin} onPhoneCodeLogin={handleLoginPhoneWithCode} onSendPhoneCode={handleSendPhoneCode} />
          )}
          {mode === 'phone-register' && (
            <PhoneRegisterPage phone={phone} setPhone={setPhone} {...sharedProps} {...formProps}
              phoneCaptchaRef={phoneCaptchaRef}
              onSendPhoneCode={handleSendPhoneCode} onPhoneRegister={handlePhoneRegister} />
          )}
          {mode === 'forgot-password-email' && (
            <ResetPasswordPage type="email" identifier={email} {...sharedProps} {...formProps}
              onSendCode={() => handleSendCode('reset_password')} onReset={handleResetPassword} />
          )}
          {mode === 'forgot-password-phone' && (
            <ResetPasswordPage type="phone" identifier={phone} {...sharedProps} {...formProps}
              onSendCode={() => handleSendPhoneCode('reset_password')} onReset={handleResetPasswordPhone} />
          )}

          {mode !== 'login' && mode !== 'register' && mode !== 'phone-login' && mode !== 'phone-register' && (
            <div className="auth-footer">
              <button className="auth-footer-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>使用条款</button>
              <span>|</span>
              <button className="auth-footer-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>隐私政策</button>
            </div>
          )}
        </div>

        <PolicyModal showPolicy={showPolicy} setShowPolicy={setShowPolicy}
          policyType={policyType} privacyContent={privacyContent} termsContent={termsContent}
          setAgreedToPolicy={setAgreedToPolicy} />
      </div>
    </div>
  );
};

export default AuthModal;

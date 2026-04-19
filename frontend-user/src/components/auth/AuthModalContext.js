/**
 * AuthModal shared context — holds form state, handlers, and config
 * that multiple auth sub-components (EmailLogin, PhoneLogin, etc.) need.
 */
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../utils/AuthContext';
import { userAPI } from '../../services/user.api';
import { configAPI } from '../../services/payment.api';
import { useToast } from '../common/ToastContainer';
import logger from '../../utils/logger';

const AuthModalContext = createContext(null);

export const useAuthModal = () => {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
};

export function AuthModalProvider({ isOpen, onClose, onLoginSuccess, children }) {
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();

  // --- Core form state ---
  const [mode, setMode] = useState('welcome');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // --- Config state ---
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [passwordError, setPasswordError] = useState('');
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [enableTurnstile, setEnableTurnstile] = useState(false);
  const [enableGithubOAuth, setEnableGithubOAuth] = useState(false);
  const [enableDiscourseSSO, setEnableDiscourseSSO] = useState(false);
  const [showMoreOAuth, setShowMoreOAuth] = useState(false);

  // --- Policy state ---
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyType, setPolicyType] = useState('privacy');
  const [privacyContent, setPrivacyContent] = useState('');
  const [termsContent, setTermsContent] = useState('');

  // --- WeChat state ---
  const [wechatQRCodeLoading, setWechatQRCodeLoading] = useState(false);
  const [, setWechatState] = useState('');
  const [wechatConfig, setWechatConfig] = useState(null);
  const wechatQRCodeRef = useRef(null);

  const emailCaptchaRef = useRef(null);
  const phoneCaptchaRef = useRef(null);

  // --- Effects ---
  useEffect(() => {
    if (isOpen) setAgreedToPolicy(false);
  }, [isOpen]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (!isOpen) return;
    configAPI.getPrivacyPolicy()
      .then(res => { if (res.data.code === 0 && res.data.data) setPrivacyContent(res.data.data.content); })
      .catch(() => setPrivacyContent('隐私协议加载失败'));
    configAPI.getTermsOfService()
      .then(res => { if (res.data.code === 0 && res.data.data) setTermsContent(res.data.data.content); })
      .catch(() => setTermsContent('用户协议加载失败'));
    configAPI.getSystemConfig()
      .then(res => {
        if (res.data.code === 0 && res.data.data) {
          const d = res.data.data;
          setRequireEmailVerification(d.require_email_verification ?? true);
          const te = d.enable_turnstile ?? false;
          setEnableTurnstile(te);
          setEnableGithubOAuth(!!(d.github_client_id && d.github_client_id.trim() !== ''));
          setEnableDiscourseSSO(!!(d.discourse_site_url && d.discourse_site_url.trim() !== ''));
          if (!te) setTurnstileToken('disabled');
        }
      })
      .catch(() => {
        setRequireEmailVerification(true);
        setEnableTurnstile(false);
        setEnableGithubOAuth(false);
        setEnableDiscourseSSO(false);
        setTurnstileToken('disabled');
      });
  }, [isOpen]);

  // --- Shared helpers ---
  const resetState = useCallback(() => {
    setMode('welcome');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setTurnstileToken('');
    setAgreedToPolicy(false);
    setPasswordError('');
    setUseCodeLogin(false);
    setWechatQRCodeLoading(false);
    setWechatState('');
  }, []);

  const clearInputs = useCallback(() => {
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setPasswordError('');
    setCountdown(0);
    emailCaptchaRef.current?.reset();
    phoneCaptchaRef.current?.reset();
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const validateConfirmPassword = useCallback(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
    } else {
      setPasswordError('');
    }
  }, [password, confirmPassword]);

  const handleLoginSuccess = useCallback((token, userData) => {
    login(token, userData);
    if (onLoginSuccess) onLoginSuccess(userData);
    handleClose();
  }, [login, onLoginSuccess, handleClose]);

  const resetCaptcha = useCallback((type = 'email') => {
    setTurnstileToken('');
    if (type === 'email') emailCaptchaRef.current?.reset();
    else phoneCaptchaRef.current?.reset();
  }, []);

  const value = {
    // State
    mode, setMode,
    email, setEmail,
    phone, setPhone,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    code, setCode,
    turnstileToken, setTurnstileToken,
    agreedToPolicy, setAgreedToPolicy,
    useCodeLogin, setUseCodeLogin,
    isComposing, setIsComposing,
    loading, setLoading,
    countdown, setCountdown,
    passwordError, setPasswordError,
    requireEmailVerification,
    enableTurnstile,
    enableGithubOAuth,
    enableDiscourseSSO,
    showMoreOAuth, setShowMoreOAuth,
    showPolicy, setShowPolicy,
    policyType, setPolicyType,
    privacyContent, termsContent,
    wechatQRCodeLoading, setWechatQRCodeLoading,
    wechatConfig, setWechatConfig,
    setWechatState,
    wechatQRCodeRef,
    emailCaptchaRef, phoneCaptchaRef,

    // Helpers
    handleClose,
    clearInputs,
    resetState,
    validateConfirmPassword,
    handleLoginSuccess,
    resetCaptcha,
    showError, showSuccess,
    isOpen,
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
}

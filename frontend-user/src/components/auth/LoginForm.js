/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LoginForm - 登录表单组件
 * 从 AuthModal.js 提取
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * 邮箱登录表单
 */
const EmailLoginForm = memo(({
  email,
  password,
  code,
  useCodeLogin,
  countdown,
  loading,
  isComposing,
  onEmailChange,
  onPasswordChange,
  onCodeChange,
  onToggleCodeLogin,
  onSendCode,
  onSubmit,
  onForgotPassword,
  onSwitchToRegister,
  onSwitchToPhone,
}) => (
  <form onSubmit={onSubmit} className="auth-form">
    <div className="form-group">
      <label>邮箱</label>
      <input
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder="请输入邮箱"
        required
      />
    </div>

    {useCodeLogin ? (
      <div className="form-group">
        <label>验证码</label>
        <div className="code-input-group">
          <input
            type="text"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="请输入验证码"
            maxLength={6}
            required
          />
          <button
            type="button"
            className="send-code-btn"
            onClick={onSendCode}
            disabled={countdown > 0 || loading}
          >
            {countdown > 0 ? `${countdown}秒` : '获取验证码'}
          </button>
        </div>
      </div>
    ) : (
      <div className="form-group">
        <label>密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="请输入密码"
          required
        />
      </div>
    )}

    <div className="form-options">
      <button type="button" className="text-btn" onClick={onToggleCodeLogin}>
        {useCodeLogin ? '密码登录' : '验证码登录'}
      </button>
      <button type="button" className="text-btn" onClick={onForgotPassword}>
        忘记密码？
      </button>
    </div>

    <button type="submit" className="submit-btn" disabled={loading}>
      {loading ? '登录中...' : '登录'}
    </button>

    <div className="form-footer">
      <span>还没有账号？</span>
      <button type="button" className="text-btn" onClick={onSwitchToRegister}>
        立即注册
      </button>
    </div>

    <div className="form-divider">
      <span>或</span>
    </div>

    <button type="button" className="switch-method-btn" onClick={onSwitchToPhone}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
      手机号登录
    </button>
  </form>
));

EmailLoginForm.displayName = 'EmailLoginForm';

EmailLoginForm.propTypes = {
  email: PropTypes.string.isRequired,
  password: PropTypes.string.isRequired,
  code: PropTypes.string.isRequired,
  useCodeLogin: PropTypes.bool.isRequired,
  countdown: PropTypes.number.isRequired,
  loading: PropTypes.bool.isRequired,
  isComposing: PropTypes.bool,
  onEmailChange: PropTypes.func.isRequired,
  onPasswordChange: PropTypes.func.isRequired,
  onCodeChange: PropTypes.func.isRequired,
  onToggleCodeLogin: PropTypes.func.isRequired,
  onSendCode: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onForgotPassword: PropTypes.func.isRequired,
  onSwitchToRegister: PropTypes.func.isRequired,
  onSwitchToPhone: PropTypes.func.isRequired,
};

/**
 * 手机登录表单
 */
const PhoneLoginForm = memo(({
  phone,
  code,
  countdown,
  loading,
  onPhoneChange,
  onCodeChange,
  onSendCode,
  onSubmit,
  onSwitchToRegister,
  onSwitchToEmail,
}) => (
  <form onSubmit={onSubmit} className="auth-form">
    <div className="form-group">
      <label>手机号</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ''))}
        placeholder="请输入手机号"
        maxLength={11}
        required
      />
    </div>

    <div className="form-group">
      <label>验证码</label>
      <div className="code-input-group">
        <input
          type="text"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="请输入验证码"
          maxLength={6}
          required
        />
        <button
          type="button"
          className="send-code-btn"
          onClick={onSendCode}
          disabled={countdown > 0 || loading}
        >
          {countdown > 0 ? `${countdown}秒` : '获取验证码'}
        </button>
      </div>
    </div>

    <button type="submit" className="submit-btn" disabled={loading}>
      {loading ? '登录中...' : '登录'}
    </button>

    <div className="form-footer">
      <span>还没有账号？</span>
      <button type="button" className="text-btn" onClick={onSwitchToRegister}>
        立即注册
      </button>
    </div>

    <div className="form-divider">
      <span>或</span>
    </div>

    <button type="button" className="switch-method-btn" onClick={onSwitchToEmail}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
      邮箱登录
    </button>
  </form>
));

PhoneLoginForm.displayName = 'PhoneLoginForm';

PhoneLoginForm.propTypes = {
  phone: PropTypes.string.isRequired,
  code: PropTypes.string.isRequired,
  countdown: PropTypes.number.isRequired,
  loading: PropTypes.bool.isRequired,
  onPhoneChange: PropTypes.func.isRequired,
  onCodeChange: PropTypes.func.isRequired,
  onSendCode: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSwitchToRegister: PropTypes.func.isRequired,
  onSwitchToEmail: PropTypes.func.isRequired,
};

export { EmailLoginForm, PhoneLoginForm };
export default EmailLoginForm;

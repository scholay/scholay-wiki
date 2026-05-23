/**
 * EmailRegisterPage — 邮箱注册
 */
import React from 'react';
import TurnstileCaptcha from '../common/TurnstileCaptcha';
import PolicyCheckbox from './PolicyCheckbox';
import VerificationCodeInput from './VerificationCodeInput';

const EmailRegisterPage = ({
  email, password, setPassword, confirmPassword, setConfirmPassword,
  code, setCode, countdown, loading,
  turnstileToken, setTurnstileToken, agreedToPolicy, setAgreedToPolicy,
  enableTurnstile, requireEmailVerification,
  passwordError, validateConfirmPassword, emailCaptchaRef,
  clearInputs, setMode, setPolicyType, setShowPolicy,
  onSendCode, onRegister,
}) => (
  <div className="auth-content">
    <div className="auth-headline">
      <h1 className="auth-title">注册 Scholay</h1>
      <p className="auth-subtitle">1 分钟完成，立即上手。</p>
    </div>
    <div className="auth-email-display">
      <span>{email || '输入邮箱地址'}</span>
      {email && <button className="auth-change-email" onClick={() => { clearInputs(); setMode('welcome'); }}>更换</button>}
    </div>
    <div className="auth-form">
      {!email && (
        <input type="email" className="auth-input" value={email} onChange={(e) => {}} placeholder="电子邮件地址" autoFocus />
      )}
      <input type="password" className="auth-input" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少8位）" autoFocus={!!email} />
      <input type="password" className="auth-input" value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)} onBlur={validateConfirmPassword} placeholder="确认密码" />
      <div className="auth-password-error-placeholder">
        {passwordError && <div className="auth-password-error">{passwordError}</div>}
      </div>

      {requireEmailVerification && (
        <VerificationCodeInput code={code} setCode={setCode} countdown={countdown}
          loading={loading} disabled={!email} onSend={() => onSendCode('register')} />
      )}

      <div className="auth-turnstile">
        <TurnstileCaptcha ref={emailCaptchaRef}
          onSuccess={(token) => setTurnstileToken(token)}
          onFail={() => setTurnstileToken('')} onExpire={() => setTurnstileToken('')} />
      </div>

      <PolicyCheckbox agreedToPolicy={agreedToPolicy} setAgreedToPolicy={setAgreedToPolicy}
        setPolicyType={setPolicyType} setShowPolicy={setShowPolicy} />

      <button className="auth-button auth-button-primary" onClick={onRegister}
        disabled={(enableTurnstile && !turnstileToken) || !agreedToPolicy}>
        注册
      </button>
    </div>
  </div>
);

export default React.memo(EmailRegisterPage);

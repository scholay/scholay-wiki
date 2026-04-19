/**
 * EmailLoginPage — 邮箱密码登录
 */
import React from 'react';
import TurnstileCaptcha from '../common/TurnstileCaptcha';
import PolicyCheckbox from './PolicyCheckbox';

const EmailLoginPage = ({
  email, password, setPassword, isComposing, setIsComposing,
  turnstileToken, setTurnstileToken, agreedToPolicy, setAgreedToPolicy,
  enableTurnstile, loading, emailCaptchaRef,
  clearInputs, setMode, setPolicyType, setShowPolicy,
  onLogin,
}) => (
  <div className="auth-content">
    <div className="auth-headline">
      <h1 className="auth-title">输入密码</h1>
    </div>
    <div className="auth-form">
      <div className="auth-email-input-group">
        <input type="email" className="auth-input" value={email} disabled placeholder="电子邮件地址" />
        <button className="auth-edit-button" onClick={() => { clearInputs(); setMode('welcome'); }}>编辑</button>
      </div>

      <input
        type="password" className="auth-input" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="密码"
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(e) => e.key === 'Enter' && !isComposing && onLogin()}
        autoFocus
      />

      <div className="auth-forgot-password">
        <button className="auth-link" onClick={() => setMode('forgot-password-email')}>忘记了密码?</button>
      </div>

      <div className="auth-turnstile">
        <TurnstileCaptcha ref={emailCaptchaRef}
          onSuccess={(token) => setTurnstileToken(token)}
          onFail={() => setTurnstileToken('')}
          onExpire={() => setTurnstileToken('')}
        />
      </div>

      <PolicyCheckbox agreedToPolicy={agreedToPolicy} setAgreedToPolicy={setAgreedToPolicy}
        setPolicyType={setPolicyType} setShowPolicy={setShowPolicy} />

      <button className="auth-button auth-button-primary" onClick={onLogin}
        disabled={loading || (enableTurnstile && !turnstileToken) || !agreedToPolicy}>
        {loading ? '登录中...' : '登录'}
      </button>
    </div>
  </div>
);

export default React.memo(EmailLoginPage);

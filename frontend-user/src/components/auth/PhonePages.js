/**
 * PhonePages — 手机号相关的三个页面：欢迎、登录、注册
 */
import React from 'react';
import TurnstileCaptcha from '../common/TurnstileCaptcha';
import PolicyCheckbox from './PolicyCheckbox';
import VerificationCodeInput from './VerificationCodeInput';

// --- 手机号欢迎页 ---
export const PhoneWelcomePage = React.memo(({
  phone, setPhone, loading, isComposing, setIsComposing,
  clearInputs, setMode, onPhoneContinue,
}) => (
  <div className="auth-content">
    <div className="auth-headline">
      <h1 className="auth-title">手机快速登录</h1>
      <p className="auth-subtitle">短信验证，更快进入。</p>
    </div>
    <div className="auth-form">
      <input type="tel" className="auth-input" value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        placeholder="手机号码"
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(e) => e.key === 'Enter' && !isComposing && onPhoneContinue()}
        maxLength={11} autoFocus />
      <button className="auth-button auth-button-primary" onClick={onPhoneContinue} disabled={loading}>
        {loading ? '检查中...' : '登录'}
      </button>
      <div className="auth-divider">
        <button className="auth-link" onClick={() => { clearInputs(); setMode('welcome'); }}>更多登录方式</button>
      </div>
    </div>
  </div>
));

// --- 手机号登录页 ---
export const PhoneLoginPage = React.memo(({
  phone, password, setPassword, code, setCode,
  useCodeLogin, setUseCodeLogin, countdown, loading,
  isComposing, setIsComposing,
  turnstileToken, setTurnstileToken, agreedToPolicy, setAgreedToPolicy,
  enableTurnstile, phoneCaptchaRef,
  clearInputs, setMode, setPolicyType, setShowPolicy,
  onPhoneLogin, onPhoneCodeLogin, onSendPhoneCode,
}) => (
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
          <input type="password" className="auth-input" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="密码"
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(e) => e.key === 'Enter' && !isComposing && onPhoneLogin()}
            autoFocus />
          <div className="auth-forgot-password">
            <button className="auth-link" onClick={() => setUseCodeLogin(true)}>使用验证码</button>
            <button className="auth-link" onClick={() => setMode('forgot-password-phone')}>忘记密码？</button>
          </div>
        </>
      ) : (
        <>
          <VerificationCodeInput code={code} setCode={setCode} countdown={countdown}
            loading={loading} disabled={!phone} onSend={() => onSendPhoneCode('login')} />
          <div className="auth-forgot-password">
            <button className="auth-link" onClick={() => setUseCodeLogin(false)}>使用密码</button>
          </div>
        </>
      )}

      <div className="auth-turnstile">
        <TurnstileCaptcha ref={phoneCaptchaRef}
          onSuccess={(token) => setTurnstileToken(token)}
          onFail={() => setTurnstileToken('')} onExpire={() => setTurnstileToken('')} />
      </div>

      <PolicyCheckbox agreedToPolicy={agreedToPolicy} setAgreedToPolicy={setAgreedToPolicy}
        setPolicyType={setPolicyType} setShowPolicy={setShowPolicy} />

      <button className="auth-button auth-button-primary"
        onClick={useCodeLogin ? onPhoneCodeLogin : onPhoneLogin}
        disabled={loading || (enableTurnstile && !turnstileToken) || !agreedToPolicy}>
        {loading ? '登录中...' : '登录'}
      </button>
    </div>
  </div>
));

// --- 手机号注册页 ---
export const PhoneRegisterPage = React.memo(({
  phone, setPhone, password, setPassword, confirmPassword, setConfirmPassword,
  code, setCode, countdown, loading,
  turnstileToken, setTurnstileToken, agreedToPolicy, setAgreedToPolicy,
  enableTurnstile, passwordError, validateConfirmPassword, phoneCaptchaRef,
  clearInputs, setMode, setPolicyType, setShowPolicy,
  onSendPhoneCode, onPhoneRegister,
}) => (
  <div className="auth-content">
    <div className="auth-headline">
      <h1 className="auth-title">注册 Scholay</h1>
      <p className="auth-subtitle">输入手机号 快速上手。</p>
    </div>
    <div className="auth-email-display">
      <span>{phone || '输入手机号码'}</span>
      {phone && <button className="auth-change-email" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>更换</button>}
    </div>
    <div className="auth-form">
      {!phone && (
        <input type="tel" className="auth-input" value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="手机号码" maxLength={11} autoFocus />
      )}
      <input type="password" className="auth-input" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="密码(至少8位)" autoFocus={!!phone} />
      <input type="password" className="auth-input" value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)} onBlur={validateConfirmPassword} placeholder="确认密码" />
      <div className="auth-password-error-placeholder">
        {passwordError && <div className="auth-password-error">{passwordError}</div>}
      </div>

      <VerificationCodeInput code={code} setCode={setCode} countdown={countdown}
        loading={loading} disabled={!phone} onSend={() => onSendPhoneCode('register')} />

      <div className="auth-turnstile">
        <TurnstileCaptcha ref={phoneCaptchaRef}
          onSuccess={(token) => setTurnstileToken(token)}
          onFail={() => setTurnstileToken('')} onExpire={() => setTurnstileToken('')} />
      </div>

      <PolicyCheckbox agreedToPolicy={agreedToPolicy} setAgreedToPolicy={setAgreedToPolicy}
        setPolicyType={setPolicyType} setShowPolicy={setShowPolicy} />

      <button className="auth-button auth-button-primary" onClick={onPhoneRegister}
        disabled={(enableTurnstile && !turnstileToken) || !agreedToPolicy}>
        注册
      </button>
    </div>
  </div>
));

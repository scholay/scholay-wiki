/**
 * ResetPasswordPage — 邮箱/手机号重置密码（共用组件）
 */
import React from 'react';
import VerificationCodeInput from './VerificationCodeInput';

const ResetPasswordPage = ({
  type = 'email', // 'email' | 'phone'
  identifier, // email 或 phone
  password, setPassword, confirmPassword, setConfirmPassword,
  code, setCode, countdown, loading,
  passwordError, validateConfirmPassword,
  clearInputs, setMode, onSendCode, onReset,
}) => {
  const isEmail = type === 'email';

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">{isEmail ? '重置密码' : '短信重置密码'}</h1>
        <p className="auth-subtitle">{isEmail ? '输入验证码后立刻修改。' : '短信验证码后即可修改。'}</p>
      </div>
      <div className="auth-email-display">
        <span>{identifier}</span>
        <button className="auth-change-email" onClick={() => {
          if (!isEmail) clearInputs();
          setMode(isEmail ? 'welcome' : 'phone-welcome');
        }}>更换</button>
      </div>
      <div className="auth-form">
        <VerificationCodeInput code={code} setCode={setCode} countdown={countdown}
          loading={loading} disabled={!identifier} onSend={onSendCode} />

        <input type="password" className="auth-input" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="新密码（至少8位）" />
        <input type="password" className="auth-input" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={validateConfirmPassword} placeholder="确认新密码" />

        <div className="auth-password-error-placeholder">
          {passwordError && <div className="auth-password-error">{passwordError}</div>}
        </div>

        <button className="auth-button auth-button-primary" onClick={onReset} disabled={loading}>
          {loading ? '重置中...' : '重置密码'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(ResetPasswordPage);

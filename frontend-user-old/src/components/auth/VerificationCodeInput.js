/**
 * VerificationCodeInput — 验证码输入 + 发送按钮
 */
import React from 'react';

const VerificationCodeInput = ({ code, setCode, countdown, loading, disabled, onSend }) => (
  <div className="auth-code-group">
    <input
      type="text"
      className="auth-input auth-code-input"
      value={code}
      onChange={(e) => setCode(e.target.value)}
      placeholder="验证码"
      maxLength={6}
    />
    <button
      className="auth-code-button"
      onClick={onSend}
      disabled={countdown > 0 || loading || disabled}
    >
      {countdown > 0 ? `${countdown}秒` : '发送'}
    </button>
  </div>
);

export default React.memo(VerificationCodeInput);

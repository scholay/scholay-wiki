/**
 * PolicyCheckbox — 复用于所有需要"同意条款"的表单
 */
import React from 'react';

const PolicyCheckbox = ({ agreedToPolicy, setAgreedToPolicy, setPolicyType, setShowPolicy }) => (
  <div className="auth-checkbox">
    <label>
      <input
        type="checkbox"
        checked={agreedToPolicy}
        onChange={(e) => setAgreedToPolicy(e.target.checked)}
      />
      <span>
        我已阅读并同意
        <button className="auth-policy-link" onClick={() => { setPolicyType('terms'); setShowPolicy(true); }}>
          使用条款
        </button>
        和
        <button className="auth-policy-link" onClick={() => { setPolicyType('privacy'); setShowPolicy(true); }}>
          隐私政策
        </button>
      </span>
    </label>
  </div>
);

export default React.memo(PolicyCheckbox);

/**
 * PolicyModal — 隐私政策/使用条款弹窗
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PolicyModal = ({ showPolicy, setShowPolicy, policyType, privacyContent, termsContent, setAgreedToPolicy }) => {
  if (!showPolicy) return null;

  return (
    <div className="policy-overlay" onClick={() => setShowPolicy(false)}>
      <div className="policy-container" onClick={(e) => e.stopPropagation()}>
        <div className="policy-header">
          <h3>{policyType === 'privacy' ? '隐私政策' : '使用条款'}</h3>
          <button onClick={() => setShowPolicy(false)}>×</button>
        </div>
        <div className="policy-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {policyType === 'privacy' ? privacyContent : termsContent}
          </ReactMarkdown>
        </div>
        <div className="policy-footer">
          <button
            className="auth-button auth-button-primary"
            onClick={() => {
              setAgreedToPolicy(true);
              setShowPolicy(false);
            }}
          >
            同意并继续
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PolicyModal);

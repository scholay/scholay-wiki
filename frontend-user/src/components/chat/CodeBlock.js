/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * CodeBlock - 代码块组件
 * 从 ChatPage.js 提取，支持语法高亮和复制功能
 */

import React, { useState, useRef, useCallback, memo } from 'react';
import PropTypes from 'prop-types';

/**
 * CodeBlock 组件
 */
const CodeBlock = memo(({ inline, className, children, ...props }) => {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef(null);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';

  const copyCode = useCallback(() => {
    const code = codeRef.current?.textContent;
    if (code) {
      navigator.clipboard.writeText(code.trim());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  }, []);

  if (inline) {
    return <code className="inline-code" {...props}>{children}</code>;
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{lang || 'text'}</span>
        <button onClick={copyCode} className="code-copy-btn">
          {isCopied ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy code
            </>
          )}
        </button>
      </div>
      <div className="code-block-content">
        <code ref={codeRef} className={className} {...props}>
          {children}
        </code>
      </div>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

CodeBlock.propTypes = {
  inline: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default CodeBlock;

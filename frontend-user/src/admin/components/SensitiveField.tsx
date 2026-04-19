/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import { useState } from 'react';
import './SensitiveField.css';

export interface SensitiveFieldProps {
  label?: string;
  value?: string;
  isVerified: boolean;
  onRequestVerify?: () => void;
  /** Reserved for future use; currently the input is always rendered as text/password. */
  type?: string;
}

/**
 * 敏感信息字段组件
 * 默认显示遮罩，需要二次验证后才能查看
 */
const SensitiveField = ({
  label,
  value,
  isVerified,
  onRequestVerify,
  type = 'text',
}: SensitiveFieldProps) => {
  const [showValue, setShowValue] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleViewClick = () => {
    if (!isVerified) {
      if (onRequestVerify) {
        onRequestVerify();
      }
    } else {
      setShowValue(!showValue);
    }
  };

  const handleCopyClick = async () => {
    if (!isVerified || !showValue || !value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const maskedValue = value ? '●●●●●●●●●●●●●●●●' : '未设置';
  const displayValue = (isVerified && showValue) ? value : maskedValue;

  return (
    <div className="sensitive-field">
      {label && <label>{label}</label>}
      <div className="sensitive-field-input-group">
        <input
          type={showValue ? 'text' : 'password'}
          value={displayValue}
          readOnly
          className="sensitive-field-input"
        />
        {isVerified && showValue && (
          <button
            type="button"
            onClick={handleCopyClick}
            className="sensitive-field-btn sensitive-field-copy-btn"
            title={copySuccess ? '已复制' : '复制'}
          >
            {copySuccess ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
              </svg>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleViewClick}
          className="sensitive-field-btn"
          title={isVerified ? (showValue ? '隐藏' : '显示') : '需要验证'}
        >
          {isVerified ? (
            showValue ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd"/>
                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
              </svg>
            )
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
          )}
        </button>
      </div>
      {!isVerified && (
        <p className="sensitive-field-hint">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
          </svg>
          查看此敏感信息需要验证管理员密码
        </p>
      )}
    </div>
  );
};

export default SensitiveField;

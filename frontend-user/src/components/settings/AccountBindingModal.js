/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AccountBindingModal - 账户绑定弹窗组件
 * 从 Settings.js 提取，处理邮箱/手机绑定和解绑
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * 验证码输入组件
 */
const CodeInput = memo(({ value, onChange, onSendCode, countdown, loading, placeholder = '输入验证码' }) => (
  <div className="modal-code-input">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={6}
    />
    <button
      className="btn-send-code"
      onClick={onSendCode}
      disabled={countdown > 0 || loading}
    >
      {countdown > 0 ? `${countdown}秒` : '发送验证码'}
    </button>
  </div>
));

CodeInput.displayName = 'CodeInput';

/**
 * 邮箱绑定表单
 */
const EmailBindForm = memo(({
  type,
  step,
  currentValue,
  formData,
  onFormChange,
  onCheckAvailability,
  onSendCode,
  onSubmit,
  onBack,
  countdown,
  loading,
}) => {
  if (step === 1) {
    return (
      <>
        {type === 'rebind-email' && (
          <div className="modal-info">
            <p>当前邮箱: <strong>{currentValue}</strong></p>
            <p>请输入新邮箱地址</p>
          </div>
        )}
        <div className="modal-form-group">
          <label>新邮箱地址</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => onFormChange({ ...formData, email: e.target.value })}
            placeholder="输入邮箱地址"
          />
        </div>
        <button className="btn-modal-submit" onClick={onCheckAvailability} disabled={loading}>
          {loading ? '检查中...' : '继续'}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="modal-info">
        <p>邮箱: <strong>{formData.email}</strong></p>
        <button className="btn-link" onClick={onBack}>返回修改</button>
      </div>
      <div className="modal-form-group">
        <label>验证码</label>
        <CodeInput
          value={formData.code || ''}
          onChange={(code) => onFormChange({ ...formData, code })}
          onSendCode={onSendCode}
          countdown={countdown}
          loading={loading}
        />
      </div>
      <button className="btn-modal-submit" onClick={onSubmit} disabled={loading}>
        {loading ? '处理中...' : '确认'}
      </button>
    </>
  );
});

EmailBindForm.displayName = 'EmailBindForm';

/**
 * 手机绑定表单
 */
const PhoneBindForm = memo(({
  type,
  step,
  currentValue,
  formData,
  onFormChange,
  onCheckAvailability,
  onSendCode,
  onSubmit,
  onBack,
  countdown,
  loading,
}) => {
  if (step === 1) {
    return (
      <>
        {type === 'rebind-phone' && (
          <div className="modal-info">
            <p>当前手机号: <strong>{currentValue}</strong></p>
            <p>请输入新手机号</p>
          </div>
        )}
        <div className="modal-form-group">
          <label>新手机号</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => onFormChange({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
            placeholder="输入11位手机号码"
            maxLength={11}
          />
        </div>
        <button className="btn-modal-submit" onClick={onCheckAvailability} disabled={loading}>
          {loading ? '检查中...' : '继续'}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="modal-info">
        <p>手机号: <strong>{formData.phone}</strong></p>
        <button className="btn-link" onClick={onBack}>返回修改</button>
      </div>
      <div className="modal-form-group">
        <label>验证码</label>
        <CodeInput
          value={formData.code || ''}
          onChange={(code) => onFormChange({ ...formData, code })}
          onSendCode={onSendCode}
          countdown={countdown}
          loading={loading}
        />
      </div>
      <button className="btn-modal-submit" onClick={onSubmit} disabled={loading}>
        {loading ? '处理中...' : '确认'}
      </button>
    </>
  );
});

PhoneBindForm.displayName = 'PhoneBindForm';

/**
 * 解绑表单
 */
const UnbindForm = memo(({
  type,
  currentValue,
  formData,
  onFormChange,
  onSendCode,
  onSubmit,
  countdown,
  loading,
}) => {
  const isEmail = type === 'unbind-email';
  const label = isEmail ? '邮箱' : (type === 'unbind-phone' ? '手机号' : (type === 'unbind-wechat' ? '微信' : 'GitHub'));

  return (
    <>
      <div className="modal-info modal-warning">
        <p>即将解绑{label}: <strong>{currentValue || '已绑定'}</strong></p>
        <p className="warning-text">注意：必须至少保留一种登录方式</p>
      </div>
      {(isEmail || type === 'unbind-phone') && (
        <div className="modal-form-group">
          <label>验证码（将发送到当前{label}）</label>
          <CodeInput
            value={formData.code || ''}
            onChange={(code) => onFormChange({ ...formData, code })}
            onSendCode={onSendCode}
            countdown={countdown}
            loading={loading}
          />
        </div>
      )}
      <button className="btn-modal-submit btn-danger" onClick={onSubmit} disabled={loading}>
        {loading ? '处理中...' : '确认解绑'}
      </button>
    </>
  );
});

UnbindForm.displayName = 'UnbindForm';

/**
 * AccountBindingModal 组件
 */
const AccountBindingModal = memo(({
  show,
  title,
  type,
  step,
  currentValue,
  formData,
  onFormChange,
  onClose,
  onCheckAvailability,
  onSendCode,
  onSubmit,
  onBack,
  countdown,
  loading,
}) => {
  if (!show) return null;

  const renderContent = () => {
    if (type === 'bind-email' || type === 'rebind-email') {
      return (
        <EmailBindForm
          type={type}
          step={step}
          currentValue={currentValue}
          formData={formData}
          onFormChange={onFormChange}
          onCheckAvailability={onCheckAvailability}
          onSendCode={onSendCode}
          onSubmit={onSubmit}
          onBack={onBack}
          countdown={countdown}
          loading={loading}
        />
      );
    }

    if (type === 'bind-phone' || type === 'rebind-phone') {
      return (
        <PhoneBindForm
          type={type}
          step={step}
          currentValue={currentValue}
          formData={formData}
          onFormChange={onFormChange}
          onCheckAvailability={onCheckAvailability}
          onSendCode={onSendCode}
          onSubmit={onSubmit}
          onBack={onBack}
          countdown={countdown}
          loading={loading}
        />
      );
    }

    if (type?.startsWith('unbind-')) {
      return (
        <UnbindForm
          type={type}
          currentValue={currentValue}
          formData={formData}
          onFormChange={onFormChange}
          onSendCode={onSendCode}
          onSubmit={onSubmit}
          countdown={countdown}
          loading={loading}
        />
      );
    }

    return null;
  };

  return (
    <div className="account-modal-overlay" onClick={onClose}>
      <div className="account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
});

AccountBindingModal.displayName = 'AccountBindingModal';

AccountBindingModal.propTypes = {
  show: PropTypes.bool.isRequired,
  title: PropTypes.string,
  type: PropTypes.string,
  step: PropTypes.number,
  currentValue: PropTypes.string,
  formData: PropTypes.object,
  onFormChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onCheckAvailability: PropTypes.func,
  onSendCode: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  countdown: PropTypes.number,
  loading: PropTypes.bool,
};

export default AccountBindingModal;

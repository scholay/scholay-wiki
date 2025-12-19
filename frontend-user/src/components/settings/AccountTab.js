/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AccountTab - 账户管理 Tab 组件
 * 从 Settings.js 提取，处理账户绑定和密码修改
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * 账户绑定卡片组件
 */
const BindingCard = memo(({ 
  icon, 
  label, 
  value, 
  isBound, 
  iconClassName,
  onBind, 
  onRebind, 
  onUnbind,
  canUnbind 
}) => (
  <div className={`account-binding-card ${isBound ? 'bound' : 'unbound'}`}>
    <div className={`binding-icon ${iconClassName || ''}`}>
      {icon}
    </div>
    <div className="binding-info">
      <div className="binding-label">{label}</div>
      <div className="binding-value">{value}</div>
    </div>
    <div className="binding-actions">
      {isBound ? (
        <>
          {onRebind && (
            <button className="btn-action btn-action-secondary" onClick={onRebind}>
              换绑
            </button>
          )}
          {canUnbind && onUnbind && (
            <button className="btn-action btn-action-danger" onClick={onUnbind}>
              解绑
            </button>
          )}
        </>
      ) : (
        <button className="btn-action btn-action-primary" onClick={onBind}>
          绑定
        </button>
      )}
    </div>
  </div>
));

BindingCard.displayName = 'BindingCard';

BindingCard.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  isBound: PropTypes.bool.isRequired,
  iconClassName: PropTypes.string,
  onBind: PropTypes.func.isRequired,
  onRebind: PropTypes.func,
  onUnbind: PropTypes.func,
  canUnbind: PropTypes.bool,
};

/**
 * 邮箱图标
 */
const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

/**
 * 手机图标
 */
const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

/**
 * 微信图标
 */
const WeChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);

/**
 * GitHub图标
 */
const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

/**
 * AccountTab 组件
 */
const AccountTab = memo(({
  user,
  loginMethodCount,
  accountModal,
  onOpenModal,
  onCloseModal,
  onBindWeChat,
  onBindGitHub,
  renderModalContent,
}) => {
  return (
    <div className="settings-section">
      <h2>账户管理</h2>

      {/* Account Binding Cards */}
      <div className="account-bindings">
        {/* Email Card */}
        <BindingCard
          icon={<EmailIcon />}
          label="邮箱"
          value={user?.email || '未绑定'}
          isBound={!!user?.email}
          canUnbind={loginMethodCount > 1}
          onBind={() => onOpenModal('bind-email', '')}
          onRebind={() => onOpenModal('rebind-email', user?.email)}
          onUnbind={() => onOpenModal('unbind-email', user?.email)}
        />

        {/* Phone Card */}
        <BindingCard
          icon={<PhoneIcon />}
          label="手机号"
          value={user?.phone || '未绑定'}
          isBound={!!user?.phone}
          canUnbind={loginMethodCount > 1}
          onBind={() => onOpenModal('bind-phone', '')}
          onRebind={() => onOpenModal('rebind-phone', user?.phone)}
          onUnbind={() => onOpenModal('unbind-phone', user?.phone)}
        />

        {/* WeChat Card */}
        <BindingCard
          icon={<WeChatIcon />}
          iconClassName="binding-icon-wechat"
          label="微信"
          value={user?.wechat_openid ? '已绑定' : '未绑定'}
          isBound={!!user?.wechat_openid}
          canUnbind={loginMethodCount > 1}
          onBind={onBindWeChat}
          onUnbind={() => onOpenModal('unbind-wechat', '')}
        />

        {/* GitHub Card */}
        <BindingCard
          icon={<GitHubIcon />}
          iconClassName="binding-icon-github"
          label="GitHub"
          value={user?.github_id ? '已绑定' : '未绑定'}
          isBound={!!user?.github_id}
          canUnbind={loginMethodCount > 1}
          onBind={onBindGitHub}
          onUnbind={() => onOpenModal('unbind-github', '')}
        />
      </div>

      {/* Change Password Button */}
      <div className="password-change-section">
        <button className="btn-change-password" onClick={() => onOpenModal('change-password', '')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>修改密码</span>
        </button>
      </div>

      {/* Account Modal */}
      {accountModal.show && (
        <div className="account-modal-overlay" onClick={onCloseModal}>
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{accountModal.title}</h3>
              <button className="modal-close" onClick={onCloseModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {renderModalContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AccountTab.displayName = 'AccountTab';

AccountTab.propTypes = {
  user: PropTypes.shape({
    email: PropTypes.string,
    phone: PropTypes.string,
    wechat_openid: PropTypes.string,
    github_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  loginMethodCount: PropTypes.number.isRequired,
  accountModal: PropTypes.shape({
    show: PropTypes.bool.isRequired,
    title: PropTypes.string,
    type: PropTypes.string,
  }).isRequired,
  onOpenModal: PropTypes.func.isRequired,
  onCloseModal: PropTypes.func.isRequired,
  onBindWeChat: PropTypes.func.isRequired,
  onBindGitHub: PropTypes.func.isRequired,
  renderModalContent: PropTypes.func.isRequired,
};

export default AccountTab;


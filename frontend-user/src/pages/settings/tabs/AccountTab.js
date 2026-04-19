/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 账号授权管理标签页组件
 */

import React, { memo } from 'react';
import GoogleSignIn from '../../../components/common/GoogleSignIn';

const AccountTab = memo(({
  user,
  loading,
  accountModal,
  setAccountModal,
  modalForm,
  setModalForm,
  modalCodeCountdown,
  getLoginMethodCount,
  handleOpenModal,
  handleCloseModal,
  handleBindWeChat,
  handleBindGitHub,
  handleBindApple,
  handleBindOrcid,
  handleBindMicrosoft,
  handleBindDiscourse,
  handleCheckAvailability,
  handleSendModalCode,
  handleSendUnbindCode,
  handleModalSubmit,
}) => {

  // Render modal content based on type
  const renderModalContent = () => {
    const type = accountModal.type;
    const step = accountModal.step;

    if (type === 'bind-email' || type === 'rebind-email') {
      if (step === 1) {
        // Step 1: Enter email and check availability
        return (
          <>
            {type === 'rebind-email' && (
              <div className="modal-info">
                <p>当前邮箱: <strong>{accountModal.currentValue}</strong></p>
                <p>请输入新邮箱地址</p>
              </div>
            )}
            <div className="modal-form-group">
              <label>新邮箱地址</label>
              <input
                type="email"
                value={modalForm.email}
                onChange={(e) => setModalForm({ ...modalForm, email: e.target.value })}
                placeholder="输入邮箱地址"
              />
            </div>
            <button className="btn-modal-submit" onClick={handleCheckAvailability} disabled={loading}>
              {loading ? '检查中...' : '继续'}
            </button>
          </>
        );
      } else {
        // Step 2: Enter verification code
        return (
          <>
            <div className="modal-info">
              <p>邮箱: <strong>{modalForm.email}</strong></p>
              <button
                className="btn-link"
                onClick={() => setAccountModal(prev => ({ ...prev, step: 1 }))}
              >
                返回修改
              </button>
            </div>
            <div className="modal-form-group">
              <label>验证码</label>
              <div className="modal-code-input">
                <input
                  type="text"
                  value={modalForm.code}
                  onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                  placeholder="输入验证码"
                  maxLength={6}
                />
                <button
                  className="btn-send-code"
                  onClick={handleSendModalCode}
                  disabled={modalCodeCountdown > 0 || loading}
                >
                  {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
                </button>
              </div>
            </div>
            <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
              {loading ? '处理中...' : '确认'}
            </button>
          </>
        );
      }
    }

    if (type === 'bind-phone' || type === 'rebind-phone') {
      if (step === 1) {
        // Step 1: Enter phone and check availability
        return (
          <>
            {type === 'rebind-phone' && (
              <div className="modal-info">
                <p>当前手机号: <strong>{accountModal.currentValue}</strong></p>
                <p>请输入新手机号</p>
              </div>
            )}
            <div className="modal-form-group">
              <label>新手机号</label>
              <input
                type="tel"
                value={modalForm.phone}
                onChange={(e) => setModalForm({ ...modalForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="输入11位手机号码"
                maxLength={11}
              />
            </div>
            <button className="btn-modal-submit" onClick={handleCheckAvailability} disabled={loading}>
              {loading ? '检查中...' : '继续'}
            </button>
          </>
        );
      } else {
        // Step 2: Enter verification code
        return (
          <>
            <div className="modal-info">
              <p>手机号: <strong>{modalForm.phone}</strong></p>
              <button
                className="btn-link"
                onClick={() => setAccountModal(prev => ({ ...prev, step: 1 }))}
              >
                返回修改
              </button>
            </div>
            <div className="modal-form-group">
              <label>验证码</label>
              <div className="modal-code-input">
                <input
                  type="text"
                  value={modalForm.code}
                  onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                  placeholder="输入验证码"
                  maxLength={6}
                />
                <button
                  className="btn-send-code"
                  onClick={handleSendModalCode}
                  disabled={modalCodeCountdown > 0 || loading}
                >
                  {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
                </button>
              </div>
            </div>
            <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
              {loading ? '处理中...' : '确认'}
            </button>
          </>
        );
      }
    }

    if (type === 'unbind-email') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑邮箱: <strong>{accountModal.currentValue}</strong></p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <div className="modal-form-group">
            <label>验证码（将发送到当前邮箱）</label>
            <div className="modal-code-input">
              <input
                type="text"
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <button
                className="btn-send-code"
                onClick={() => handleSendUnbindCode('email')}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </button>
            </div>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-phone') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑手机号: <strong>{accountModal.currentValue}</strong></p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <div className="modal-form-group">
            <label>验证码（将发送到当前手机）</label>
            <div className="modal-code-input">
              <input
                type="text"
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <button
                className="btn-send-code"
                onClick={() => handleSendUnbindCode('phone')}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </button>
            </div>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-wechat') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑微信账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-github') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 GitHub 账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-google') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 Google 账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-apple') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 Apple 账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-orcid') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 ORCID 账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-microsoft') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑 Microsoft 账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'unbind-discourse') {
      return (
        <>
          <div className="modal-info modal-warning">
            <p>即将解绑恩特学术账号</p>
            <p className="warning-text">注意：必须至少保留一种登录方式</p>
          </div>
          <button className="btn-modal-submit btn-modal-danger" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认解绑'}
          </button>
        </>
      );
    }

    if (type === 'change-password') {
      return (
        <>
          <div className="modal-form-group">
            <label>当前密码</label>
            <input
              type="password"
              value={modalForm.password}
              onChange={(e) => setModalForm({ ...modalForm, password: e.target.value })}
              placeholder="输入当前密码"
            />
          </div>
          <div className="modal-form-group">
            <label>新密码</label>
            <input
              type="password"
              value={modalForm.newPassword}
              onChange={(e) => setModalForm({ ...modalForm, newPassword: e.target.value })}
              placeholder="输入新密码（至少8个字符）"
            />
          </div>
          <div className="modal-form-group">
            <label>确认新密码</label>
            <input
              type="password"
              value={modalForm.confirmPassword}
              onChange={(e) => setModalForm({ ...modalForm, confirmPassword: e.target.value })}
              placeholder="再次输入新密码"
            />
          </div>
          <button className="btn-modal-submit" onClick={handleModalSubmit} disabled={loading}>
            {loading ? '处理中...' : '确认修改'}
          </button>
        </>
      );
    }

    return null;
  };

  return (
    <div className="settings-section">
      <h2>授权管理</h2>

      {/* Account Binding Cards */}
      <div className="account-bindings">
        {/* Email Card */}
        <div className={`account-binding-card ${user?.email ? 'bound' : 'unbound'}`}>
          <div className="binding-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">邮箱</div>
            <div className="binding-value">{user?.email || '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.email ? (
              <>
                <button className="btn-action btn-action-secondary" onClick={() => handleOpenModal('rebind-email', user.email)}>
                  换绑
                </button>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-email', user.email)}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={() => handleOpenModal('bind-email', '')}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* Phone Card */}
        <div className={`account-binding-card ${user?.phone ? 'bound' : 'unbound'}`}>
          <div className="binding-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">手机号</div>
            <div className="binding-value">{user?.phone || '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.phone ? (
              <>
                <button className="btn-action btn-action-secondary" onClick={() => handleOpenModal('rebind-phone', user.phone)}>
                  换绑
                </button>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-phone', user.phone)}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={() => handleOpenModal('bind-phone', '')}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* WeChat Card */}
        <div className={`account-binding-card ${user?.wechat_openid ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-wechat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">微信</div>
            <div className="binding-value">{user?.wechat_openid ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.wechat_openid ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-wechat', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindWeChat}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* GitHub Card */}
        <div className={`account-binding-card ${user?.github_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-github">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">GitHub</div>
            <div className="binding-value">{user?.github_id ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.github_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-github', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindGitHub}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* Google Card */}
        <div className={`account-binding-card ${user?.google_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-google">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">Google</div>
            <div className="binding-value">{user?.google_id ? (user?.google_email || '已绑定') : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.google_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-google', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <GoogleSignIn
                mode="bind"
                enableOneTap={false}
                theme="outline"
                size="medium"
                text="signin_with"
                onSuccess={() => {
                  showToast('Google 账号绑定成功', 'success');
                  refreshProfile?.();
                }}
                onError={(err) => showToast(typeof err === 'string' ? err : 'Google 绑定失败', 'error')}
              />
            )}
          </div>
        </div>

        {/* Apple Card */}
        <div className={`account-binding-card ${user?.apple_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-apple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">Apple</div>
            <div className="binding-value">{user?.apple_id ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.apple_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-apple', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindApple}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* ORCID Card */}
        <div className={`account-binding-card ${user?.orcid_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-orcid">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#A6CE39">
              <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.022-2.484 4.022-3.722 0-1.847-1.238-3.722-3.806-3.722h-2.513z"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">ORCID</div>
            <div className="binding-value">{user?.orcid_id || '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.orcid_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-orcid', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindOrcid}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* Microsoft Card */}
        <div className={`account-binding-card ${user?.microsoft_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-microsoft">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 1h10.5v10.5H1V1zm12.5 0H24v10.5H13.5V1zM1 13.5h10.5V24H1V13.5zm12.5 0H24V24H13.5V13.5z" fill="#00A4EF"/>
            </svg>
          </div>
          <div className="binding-info">
            <div className="binding-label">Microsoft</div>
            <div className="binding-value">{user?.microsoft_id ? (user?.microsoft_email || '已绑定') : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.microsoft_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-microsoft', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindMicrosoft}>
                绑定
              </button>
            )}
          </div>
        </div>

        {/* 恩特学术 Card */}
        <div className={`account-binding-card ${user?.discourse_id ? 'bound' : 'unbound'}`}>
          <div className="binding-icon binding-icon-discourse">
            <img
              src="https://enterscholar.com/uploads/default/optimized/1X/c5e85ff2f699b8087f00616b7ea1dbed03d2ba12_2_32x32.svg"
              alt="恩特学术"
              width="20"
              height="20"
              loading="lazy"
              decoding="async"
              style={{ borderRadius: 4 }}
            />
          </div>
          <div className="binding-info">
            <div className="binding-label">恩特学术</div>
            <div className="binding-value">{user?.discourse_id ? '已绑定' : '未绑定'}</div>
          </div>
          <div className="binding-actions">
            {user?.discourse_id ? (
              <>
                {getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-discourse', '')}>
                    解绑
                  </button>
                )}
              </>
            ) : (
              <button className="btn-action btn-action-primary" onClick={handleBindDiscourse}>
                绑定
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Change Password Button */}
      <div className="password-change-section">
        <button className="btn-change-password" onClick={() => handleOpenModal('change-password', '')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>修改密码</span>
        </button>
      </div>

      {/* Account Modal */}
      {accountModal.show && (
        <div className="account-modal-overlay" onClick={handleCloseModal}>
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{accountModal.title}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
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

export default AccountTab;

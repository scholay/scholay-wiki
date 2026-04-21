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

import React, { memo, useEffect, useState } from 'react';
import GoogleSignIn from '../../../components/common/GoogleSignIn';
import { configAPI } from '../../../services/payment.api';
import { isProviderEnabled } from '../../../constants/authProviders';
import {
  DiscourseIcon, PhoneIcon, WeChatIcon, EmailIcon,
  AppleIcon, MicrosoftIcon, OrcidIcon, GithubIcon, GoogleIcon,
} from '../../../components/icons/providers';

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
  const [systemConfig, setSystemConfig] = useState({});

  useEffect(() => {
    configAPI.getSystemConfig()
      .then((r) => {
        if (r?.data?.code === 0 && r.data.data) setSystemConfig(r.data.data);
      })
      .catch(() => setSystemConfig({}));
  }, []);

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
            <EmailIcon size={20} />
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
            <PhoneIcon size={20} />
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
            <WeChatIcon size={20} />
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

        {/* GitHub Card — 后台配置了 github_client_id 或已绑定才显示 */}
        {(isProviderEnabled('github', systemConfig) || user?.github_id) && (
          <div className={`account-binding-card ${user?.github_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-github">
              <GithubIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">GitHub</div>
              <div className="binding-value">{user?.github_id ? '已绑定' : '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.github_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-github', '')}>
                    解绑
                  </button>
                )
              ) : (
                <button className="btn-action btn-action-primary" onClick={handleBindGitHub}>
                  绑定
                </button>
              )}
            </div>
          </div>
        )}

        {/* Google Card — 后台配置了 google_client_id 或已绑定才显示 */}
        {(isProviderEnabled('google', systemConfig) || user?.google_id) && (
          <div className={`account-binding-card ${user?.google_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-google">
              <GoogleIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">Google</div>
              <div className="binding-value">{user?.google_id ? (user?.google_email || '已绑定') : '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.google_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-google', '')}>
                    解绑
                  </button>
                )
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
        )}

        {/* Apple Card — 后台启用或已绑定才显示 */}
        {(isProviderEnabled('apple', systemConfig) || user?.apple_id) && (
          <div className={`account-binding-card ${user?.apple_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-apple">
              <AppleIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">Apple</div>
              <div className="binding-value">{user?.apple_id ? '已绑定' : '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.apple_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-apple', '')}>
                    解绑
                  </button>
                )
              ) : (
                <button className="btn-action btn-action-primary" onClick={handleBindApple}>
                  绑定
                </button>
              )}
            </div>
          </div>
        )}

        {/* ORCID Card — 后台启用或已绑定才显示 */}
        {(isProviderEnabled('orcid', systemConfig) || user?.orcid_id) && (
          <div className={`account-binding-card ${user?.orcid_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-orcid">
              <OrcidIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">ORCID</div>
              <div className="binding-value">{user?.orcid_id || '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.orcid_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-orcid', '')}>
                    解绑
                  </button>
                )
              ) : (
                <button className="btn-action btn-action-primary" onClick={handleBindOrcid}>
                  绑定
                </button>
              )}
            </div>
          </div>
        )}

        {/* Microsoft Card — 后台启用或已绑定才显示 */}
        {(isProviderEnabled('microsoft', systemConfig) || user?.microsoft_id) && (
          <div className={`account-binding-card ${user?.microsoft_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-microsoft">
              <MicrosoftIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">Microsoft</div>
              <div className="binding-value">{user?.microsoft_id ? (user?.microsoft_email || '已绑定') : '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.microsoft_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-microsoft', '')}>
                    解绑
                  </button>
                )
              ) : (
                <button className="btn-action btn-action-primary" onClick={handleBindMicrosoft}>
                  绑定
                </button>
              )}
            </div>
          </div>
        )}

        {/* 恩特学术 Card — 后台启用或已绑定才显示 */}
        {(isProviderEnabled('discourse', systemConfig) || user?.discourse_id) && (
          <div className={`account-binding-card ${user?.discourse_id ? 'bound' : 'unbound'}`}>
            <div className="binding-icon binding-icon-discourse">
              <DiscourseIcon size={20} />
            </div>
            <div className="binding-info">
              <div className="binding-label">恩特学术</div>
              <div className="binding-value">{user?.discourse_id ? '已绑定' : '未绑定'}</div>
            </div>
            <div className="binding-actions">
              {user?.discourse_id ? (
                getLoginMethodCount() > 1 && (
                  <button className="btn-action btn-action-danger" onClick={() => handleOpenModal('unbind-discourse', '')}>
                    解绑
                  </button>
                )
              ) : (
                <button className="btn-action btn-action-primary" onClick={handleBindDiscourse}>
                  绑定
                </button>
              )}
            </div>
          </div>
        )}
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

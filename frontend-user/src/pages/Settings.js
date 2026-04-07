/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/ToastContainer';
import api from '../services/client';
import logger from '../utils/logger';
import './styles/settings/index.css';

// 拆分出的子组件和 Hooks
import { AccountTab } from './settings/tabs';
import { useAccountData } from './settings/hooks';

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState('profile'); // profile, account
  const [loading, setLoading] = useState(false);

  // 个人资料表单状态
  const [profile, setProfile] = useState({
    name: '',
    userId: '',
    bio: ''
  });

  // 账号安全表单状态
  const [accountForm, setAccountForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // 绑定表单状态
  const [bindPhone, setBindPhone] = useState('');
  const [bindEmail, setBindEmail] = useState('');
  const [bindPhoneCode, setBindPhoneCode] = useState('');
  const [bindEmailCode, setBindEmailCode] = useState('');
  const [phoneCodeCountdown, setPhoneCodeCountdown] = useState(0);
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);

  // 账号管理 - 使用提取的 hook
  const accountData = useAccountData(user);

  // 处理 URL 参数（微信/GitHub 绑定回调及 Tab 切换）
  useEffect(() => {
    const tab = searchParams.get('tab');
    const wechatBindStatus = searchParams.get('wechat_bind_status');
    const githubBindStatus = searchParams.get('github_bind_status');
    const message = searchParams.get('message');

    if (tab && ['profile', 'account'].includes(tab)) {
      setActiveTab(tab);
    }

    if (wechatBindStatus && message) {
      if (wechatBindStatus === 'success') {
        showSuccess(message);
      } else if (wechatBindStatus === 'error') {
        showError(message);
      }
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('wechat_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }

    if (githubBindStatus && message) {
      if (githubBindStatus === 'success') {
        showSuccess(message);
        fetchUserProfile();
      } else if (githubBindStatus === 'error') {
        showError(message);
      }
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('github_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, showSuccess, showError]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // 手机验证码倒计时
  useEffect(() => {
    if (phoneCodeCountdown > 0) {
      const timer = setTimeout(() => setPhoneCodeCountdown(phoneCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneCodeCountdown]);

  // 邮箱验证码倒计时
  useEffect(() => {
    if (emailCodeCountdown > 0) {
      const timer = setTimeout(() => setEmailCodeCountdown(emailCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [emailCodeCountdown]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const fetchUserProfile = async () => {
    try {
      const userData = await refreshUser();
      if (userData) {
        setProfile({
          name: userData.username || userData.email || '',
          userId: userData.id || '',
          bio: userData.bio || ''
        });
      } else if (user) {
        setProfile({
          name: user.username || user.email || '',
          userId: user.id || '',
          bio: user.bio || ''
        });
      }
    } catch (error) {
      logger.error('Failed to fetch user profile:', error);
    }
  };

  // 设置账号管理成功后的回调
  useEffect(() => {
    accountData.setOnSuccess(fetchUserProfile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountData.setOnSuccess]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handlePasswordChange = async () => {
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (accountForm.newPassword.length < 8) {
      showError('新密码长度至少为8个字符');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/change-password', {
        current_password: accountForm.currentPassword,
        new_password: accountForm.newPassword
      });

      if (response.data.code === 0) {
        showSuccess('密码修改成功');
        setAccountForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        showError('密码修改失败：' + response.data.message);
      }
    } catch (error) {
      showError('密码修改失败,请稍后重试');
      logger.error('Failed to change password:', error);
    } finally {
      setLoading(false);
    }
  };

  // 发送手机验证码 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleSendPhoneCode = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }
    if (phoneCodeCountdown > 0) return;
    setLoading(true);
    try {
      const response = await api.post('/user/send-phone-code', {
        phone: bindPhone,
        purpose: 'bind'
      });
      if (response.data.code === 0) {
        setPhoneCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      logger.error('Failed to send phone code:', error);
    } finally {
      setLoading(false);
    }
  };

  // 发送邮箱验证码 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleSendEmailCode = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }
    if (emailCodeCountdown > 0) return;
    setLoading(true);
    try {
      const response = await api.post('/user/send-code', {
        email: bindEmail,
        purpose: 'bind'
      });
      if (response.data.code === 0) {
        setEmailCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      logger.error('Failed to send email code:', error);
    } finally {
      setLoading(false);
    }
  };

  // 绑定手机 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleBindPhone = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }
    if (!bindPhoneCode) {
      showError('请输入验证码');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/user/bind-phone', {
        phone: bindPhone,
        code: bindPhoneCode
      });
      if (response.data.code === 0) {
        showSuccess('手机号绑定成功');
        setBindPhone('');
        setBindPhoneCode('');
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      logger.error('Failed to bind phone:', error);
    } finally {
      setLoading(false);
    }
  };

  // 绑定邮箱 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleBindEmail = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }
    if (!bindEmailCode) {
      showError('请输入验证码');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/user/bind-email', {
        email: bindEmail,
        code: bindEmailCode
      });
      if (response.data.code === 0) {
        showSuccess('邮箱绑定成功');
        setBindEmail('');
        setBindEmailCode('');
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      logger.error('Failed to bind email:', error);
    } finally {
      setLoading(false);
    }
  };

  // 名字编辑状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');

  // 简介编辑状态
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editingBio, setEditingBio] = useState('');

  // 保存名字
  const handleSaveName = async () => {
    if (editingName === profile.name) {
      setIsEditingName(false);
      return;
    }
    try {
      setLoading(true);
      await api.put('/user/profile', { name: editingName });
      setProfile({ ...profile, name: editingName });
      setIsEditingName(false);
      showSuccess('名字已更新');
      refreshUser();
    } catch (error) {
      logger.error('Failed to save name:', error);
      showError('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 保存简介
  const handleSaveBio = async () => {
    if (editingBio === profile.bio) {
      setIsEditingBio(false);
      return;
    }
    try {
      setLoading(true);
      await api.put('/user/profile', { bio: editingBio });
      setProfile({ ...profile, bio: editingBio });
      setIsEditingBio(false);
      showSuccess('简介已更新');
    } catch (error) {
      logger.error('Failed to save bio:', error);
      showError('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const renderProfileTab = () => (
    <div className="settings-section">
      <div className="profile-header">
        <h2>个人资料</h2>
      </div>

      {/* 个人资料卡片 */}
      <div className="profile-card">
        <div className="profile-card-header">
          {/* 左侧：头像 + 用户名 */}
          <div className="profile-header-left">
            <div className="avatar-wrapper">
              <div className="avatar-circle">
                {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </div>
            </div>
            {/* 名字 - hover显示编辑 */}
            <div
              className={`profile-name-wrapper ${isEditingName ? 'editing' : ''}`}
              onClick={() => {
                if (!isEditingName) {
                  setEditingName(profile.name || '');
                  setIsEditingName(true);
                }
              }}
            >
              {isEditingName ? (
                <div className="inline-edit-name">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="输入名字"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button className="inline-save-btn" onClick={(e) => { e.stopPropagation(); handleSaveName(); }} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                  <button className="inline-cancel-btn" onClick={(e) => { e.stopPropagation(); setIsEditingName(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="profile-name">{profile.name || '未设置名字'}</h3>
                  <span className="edit-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 个人简介 - hover显示编辑 */}
        <div
          className={`profile-bio-wrapper ${isEditingBio ? 'editing' : ''}`}
          onClick={() => {
            if (!isEditingBio) {
              setEditingBio(profile.bio || '');
              setIsEditingBio(true);
            }
          }}
        >
          {isEditingBio ? (
            <div className="inline-edit-bio">
              <textarea
                value={editingBio}
                onChange={(e) => setEditingBio(e.target.value)}
                placeholder="介绍一下自己..."
                rows="3"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <div className="inline-edit-actions">
                <button className="inline-save-btn" onClick={(e) => { e.stopPropagation(); handleSaveBio(); }} disabled={loading}>
                  {loading ? '保存中...' : '保存'}
                </button>
                <button className="inline-cancel-btn" onClick={(e) => { e.stopPropagation(); setIsEditingBio(false); }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="profile-bio-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="17" y1="10" x2="3" y2="10"/>
                  <line x1="21" y1="6" x2="3" y2="6"/>
                  <line x1="21" y1="14" x2="3" y2="14"/>
                  <line x1="17" y1="18" x2="3" y2="18"/>
                </svg>
                <span>简介</span>
              </div>
              <p className="profile-bio-text">
                {profile.bio || <span className="empty-value">点击添加个人简介...</span>}
              </p>
              <span className="edit-hint bio-edit-hint">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                编辑
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderExternalLinks = () => null;

  const renderLogoutSection = () => (
    <div className="settings-section logout-section">
      <button className="btn-logout" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>注销登录</span>
      </button>
    </div>
  );

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-layout">
          {/* 左侧边栏 */}
          <div className="settings-sidebar">
            <div className="settings-title-row">
              <h1 className="settings-title">设置</h1>
            </div>

            <div className="settings-menu">
              <div className="menu-section">
                <div className="menu-section-title">我的账户</div>
                <button
                  className={`menu-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => handleTabChange('profile')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>个人资料</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'account' ? 'active' : ''}`}
                  onClick={() => handleTabChange('account')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  <span>授权管理</span>
                </button>
              </div>

              {renderExternalLinks()}
              {renderLogoutSection()}
            </div>
          </div>

          {/* 右侧内容 */}
          <div className="settings-content">
            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'account' && (
              <AccountTab
                user={user}
                loading={accountData.loading}
                accountModal={accountData.accountModal}
                setAccountModal={accountData.setAccountModal}
                modalForm={accountData.modalForm}
                setModalForm={accountData.setModalForm}
                modalCodeCountdown={accountData.modalCodeCountdown}
                getLoginMethodCount={accountData.getLoginMethodCount}
                handleOpenModal={accountData.handleOpenModal}
                handleCloseModal={accountData.handleCloseModal}
                handleBindWeChat={accountData.handleBindWeChat}
                handleBindGitHub={accountData.handleBindGitHub}
                handleBindDiscourse={accountData.handleBindDiscourse}
                handleCheckAvailability={accountData.handleCheckAvailability}
                handleSendModalCode={accountData.handleSendModalCode}
                handleSendUnbindCode={accountData.handleSendUnbindCode}
                handleModalSubmit={accountData.handleModalSubmit}
              />
            )}
          </div>
        </div>
      </div>

      {/* 移动端底部 Tab 栏 */}
      <div className="settings-mobile-tabs">
        <button
          className={`mobile-tab-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => handleTabChange('profile')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>资料</span>
        </button>
        <button
          className={`mobile-tab-item ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => handleTabChange('account')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
          </svg>
          <span>授权</span>
        </button>
      </div>
    </div>
  );
};

export default Settings;

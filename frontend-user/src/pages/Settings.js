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
import {
  Tabs, Card, Avatar, Input, Button, Typography, Space, App, Grid,
} from 'antd';
import {
  UserOutlined, SafetyOutlined, EditOutlined,
  CheckOutlined, CloseOutlined, LogoutOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAuth } from '../utils/AuthContext';
import api from '../services/api';
import logger from '../utils/logger';
import { AccountTab } from './settings/tabs';
import { useAccountData } from './settings/hooks';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const { message, modal } = App.useApp();
  const screens = useBreakpoint();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState({ name: '', userId: '', bio: '' });

  // 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const [accountForm, setAccountForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  // eslint-disable-next-line no-unused-vars
  const [bindPhone, setBindPhone] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [bindEmail, setBindEmail] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [bindPhoneCode, setBindPhoneCode] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [bindEmailCode, setBindEmailCode] = useState('');
  const [phoneCodeCountdown, setPhoneCodeCountdown] = useState(0);
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);

  const accountData = useAccountData(user);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editingBio, setEditingBio] = useState('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    const wechatBindStatus = searchParams.get('wechat_bind_status');
    const githubBindStatus = searchParams.get('github_bind_status');
    const msg = searchParams.get('message');

    if (tab && ['profile', 'account'].includes(tab)) {
      setActiveTab(tab);
    }

    if (wechatBindStatus && msg) {
      if (wechatBindStatus === 'success') message.success(msg);
      else if (wechatBindStatus === 'error') message.error(msg);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('wechat_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }

    if (githubBindStatus && msg) {
      if (githubBindStatus === 'success') {
        message.success(msg);
        fetchUserProfile();
      } else if (githubBindStatus === 'error') {
        message.error(msg);
      }
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('github_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (isAuthenticated) fetchUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (phoneCodeCountdown > 0) {
      const timer = setTimeout(() => setPhoneCodeCountdown(phoneCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneCodeCountdown]);

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
          bio: userData.bio || '',
        });
      } else if (user) {
        setProfile({
          name: user.username || user.email || '',
          userId: user.id || '',
          bio: user.bio || '',
        });
      }
    } catch (error) {
      logger.error('Failed to fetch user profile:', error);
    }
  };

  useEffect(() => {
    accountData.setOnSuccess(fetchUserProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountData.setOnSuccess]);

  const handleLogout = () => {
    modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        logout();
        navigate('/search');
      },
    });
  };

  // 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handlePasswordChange = async () => {
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    if (accountForm.newPassword.length < 8) {
      message.error('新密码长度至少为8个字符');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/user/change-password', {
        current_password: accountForm.currentPassword,
        new_password: accountForm.newPassword,
      });
      if (response.data.code === 0) {
        message.success('密码修改成功');
        setAccountForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        message.error('密码修改失败：' + response.data.message);
      }
    } catch (error) {
      message.error('密码修改失败,请稍后重试');
      logger.error('Failed to change password:', error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleSendPhoneCode = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      message.error('请输入有效的手机号码');
      return;
    }
    if (phoneCodeCountdown > 0) return;
    setLoading(true);
    try {
      const response = await api.post('/user/send-phone-code', { phone: bindPhone, purpose: 'bind' });
      if (response.data.code === 0) {
        setPhoneCodeCountdown(60);
        message.success('验证码已发送');
      } else {
        message.error('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      message.error('发送验证码失败,请稍后重试');
      logger.error('Failed to send phone code:', error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleSendEmailCode = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      message.error('请输入有效的邮箱地址');
      return;
    }
    if (emailCodeCountdown > 0) return;
    setLoading(true);
    try {
      const response = await api.post('/user/send-code', { email: bindEmail, purpose: 'bind' });
      if (response.data.code === 0) {
        setEmailCodeCountdown(60);
        message.success('验证码已发送');
      } else {
        message.error('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      message.error('发送验证码失败,请稍后重试');
      logger.error('Failed to send email code:', error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleBindPhone = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      message.error('请输入有效的手机号码');
      return;
    }
    if (!bindPhoneCode) { message.error('请输入验证码'); return; }
    setLoading(true);
    try {
      const response = await api.post('/user/bind-phone', { phone: bindPhone, code: bindPhoneCode });
      if (response.data.code === 0) {
        message.success('手机号绑定成功');
        setBindPhone('');
        setBindPhoneCode('');
        fetchUserProfile();
      } else {
        message.error('绑定失败：' + response.data.message);
      }
    } catch (error) {
      message.error('绑定失败,请稍后重试');
      logger.error('Failed to bind phone:', error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleBindEmail = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      message.error('请输入有效的邮箱地址');
      return;
    }
    if (!bindEmailCode) { message.error('请输入验证码'); return; }
    setLoading(true);
    try {
      const response = await api.post('/user/bind-email', { email: bindEmail, code: bindEmailCode });
      if (response.data.code === 0) {
        message.success('邮箱绑定成功');
        setBindEmail('');
        setBindEmailCode('');
        fetchUserProfile();
      } else {
        message.error('绑定失败：' + response.data.message);
      }
    } catch (error) {
      message.error('绑定失败,请稍后重试');
      logger.error('Failed to bind email:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (editingName === profile.name) { setIsEditingName(false); return; }
    try {
      setLoading(true);
      await api.put('/user/profile', { name: editingName });
      setProfile((prev) => ({ ...prev, name: editingName }));
      setIsEditingName(false);
      message.success('名字已更新');
      refreshUser();
    } catch (error) {
      logger.error('Failed to save name:', error);
      message.error('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBio = async () => {
    if (editingBio === profile.bio) { setIsEditingBio(false); return; }
    try {
      setLoading(true);
      await api.put('/user/profile', { bio: editingBio });
      setProfile((prev) => ({ ...prev, bio: editingBio }));
      setIsEditingBio(false);
      message.success('简介已更新');
    } catch (error) {
      logger.error('Failed to save bio:', error);
      message.error('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const isMobile = !screens.md;

  const profileTab = (
    <div style={{ maxWidth: 700 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Avatar
            size={80}
            style={{
              background: 'linear-gradient(135deg, #10a37f, #1a7f64)',
              fontSize: 32,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
          </Avatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditingName ? (
              <Space wrap>
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="输入名字"
                  autoFocus
                  onPressEnter={handleSaveName}
                  onKeyDown={(e) => e.key === 'Escape' && setIsEditingName(false)}
                  style={{ width: 200 }}
                />
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handleSaveName}
                  loading={loading}
                  size="small"
                />
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => setIsEditingName(false)}
                  size="small"
                />
              </Space>
            ) : (
              <div
                onClick={() => {
                  setEditingName(profile.name || '');
                  setIsEditingName(true);
                }}
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
              >
                <Title level={4} style={{ margin: 0 }}>
                  {profile.name || '未设置名字'}
                </Title>
                <EditOutlined style={{ opacity: 0.4, fontSize: 14 }} />
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileTextOutlined style={{ opacity: 0.5 }} />
            <Text
              type="secondary"
              strong
              style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              简介
            </Text>
          </div>
          {isEditingBio ? (
            <div>
              <TextArea
                value={editingBio}
                onChange={(e) => setEditingBio(e.target.value)}
                placeholder="介绍一下自己..."
                rows={3}
                autoFocus
              />
              <Space style={{ marginTop: 8 }}>
                <Button type="primary" onClick={handleSaveBio} loading={loading} size="small">
                  保存
                </Button>
                <Button onClick={() => setIsEditingBio(false)} size="small">
                  取消
                </Button>
              </Space>
            </div>
          ) : (
            <div
              onClick={() => {
                setEditingBio(profile.bio || '');
                setIsEditingBio(true);
              }}
              style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: 8,
                minHeight: 60,
                transition: 'all 0.2s',
              }}
            >
              {profile.bio ? (
                <Text style={{ whiteSpace: 'pre-wrap' }}>{profile.bio}</Text>
              ) : (
                <Text type="secondary" italic>
                  点击添加个人简介...
                </Text>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const accountTabContent = (
    <div style={{ maxWidth: 700 }}>
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
        handleCheckAvailability={accountData.handleCheckAvailability}
        handleSendModalCode={accountData.handleSendModalCode}
        handleSendUnbindCode={accountData.handleSendUnbindCode}
        handleModalSubmit={accountData.handleModalSubmit}
      />
    </div>
  );

  const tabItems = [
    {
      key: 'profile',
      label: (
        <span>
          <UserOutlined style={{ marginRight: 8 }} />
          个人资料
        </span>
      ),
      children: profileTab,
    },
    {
      key: 'account',
      label: (
        <span>
          <SafetyOutlined style={{ marginRight: 8 }} />
          授权管理
        </span>
      ),
      children: accountTabContent,
    },
  ];

  return (
    <div style={{ flex: 1, height: '100%', overflow: 'auto' }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: isMobile ? '16px' : '32px 48px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <Title level={3} style={{ margin: 0 }}>
            设置
          </Title>
          <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
            退出登录
          </Button>
        </div>
        <Tabs
          tabPosition={isMobile ? 'top' : 'left'}
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          style={{ minHeight: isMobile ? 'auto' : 'calc(100vh - 200px)' }}
        />
      </div>
    </div>
  );
};

export default Settings;

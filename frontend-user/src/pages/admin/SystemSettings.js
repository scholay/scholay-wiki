import React, { Suspense, lazy, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, Spin, Typography } from 'antd';
import {
  MailOutlined, PhoneOutlined, WechatOutlined, GithubOutlined,
  SafetyOutlined, FileProtectOutlined, SettingOutlined,
} from '@ant-design/icons';
import VerifyPasswordModal from '../../components/admin/VerifyPasswordModal';

const EmailSettings = lazy(() => import('./settings/EmailSettings'));
const SmsSettings = lazy(() => import('./settings/SmsSettings'));
const WeChatSettings = lazy(() => import('./settings/WeChatSettings'));
const GitHubOAuthSettings = lazy(() => import('./settings/GitHubOAuthSettings'));
const TurnstileSettings = lazy(() => import('./settings/TurnstileSettings'));
const PrivacyTermsSettings = lazy(() => import('./settings/PrivacyTermsSettings'));
const SystemConfigSettings = lazy(() => import('./settings/SystemConfigSettings'));

const { Title, Text } = Typography;

const LoadingFallback = () => (
  <div style={{ textAlign: 'center', padding: 60 }}>
    <Spin size="large" />
  </div>
);

const TAB_KEYS = ['email', 'sms', 'wechat', 'github', 'privacy', 'turnstile', 'system'];

const SystemSettings = () => {
  const location = useLocation();

  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'terms') return 'privacy';
    if (TAB_KEYS.includes(tab)) return tab;
    return 'email';
  };

  const getDefaultSubTab = () => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') === 'terms' ? 'terms' : 'privacy';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const defaultSubTab = getDefaultSubTab();

  const handleVerified = useCallback(() => {
    setIsVerified(true);
    setShowVerifyModal(false);
    setTimeout(() => setIsVerified(false), 5 * 60 * 1000);
  }, []);

  const handleRequestVerify = useCallback(() => {
    setShowVerifyModal(true);
  }, []);

  const tabItems = [
    {
      key: 'email',
      label: '邮箱服务器',
      icon: <MailOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <EmailSettings isVerified={isVerified} onRequestVerify={handleRequestVerify} />
        </Suspense>
      ),
    },
    {
      key: 'sms',
      label: '短信服务',
      icon: <PhoneOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <SmsSettings isVerified={isVerified} onRequestVerify={handleRequestVerify} />
        </Suspense>
      ),
    },
    {
      key: 'wechat',
      label: '微信开发者配置',
      icon: <WechatOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <WeChatSettings isVerified={isVerified} onRequestVerify={handleRequestVerify} />
        </Suspense>
      ),
    },
    {
      key: 'github',
      label: 'GitHub 登录',
      icon: <GithubOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <GitHubOAuthSettings />
        </Suspense>
      ),
    },
    {
      key: 'privacy',
      label: '协议管理',
      icon: <FileProtectOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <PrivacyTermsSettings defaultSubTab={defaultSubTab} />
        </Suspense>
      ),
    },
    {
      key: 'turnstile',
      label: '人机验证',
      icon: <SafetyOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <TurnstileSettings />
        </Suspense>
      ),
    },
    {
      key: 'system',
      label: '系统配置',
      icon: <SettingOutlined />,
      children: (
        <Suspense fallback={<LoadingFallback />}>
          <SystemConfigSettings />
        </Suspense>
      ),
    },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>系统设置</Title>
        <Text type="secondary">配置系统参数和应用设置</Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <VerifyPasswordModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerified={handleVerified}
      />
    </div>
  );
};

export default SystemSettings;

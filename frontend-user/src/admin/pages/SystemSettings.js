/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import VerifyPasswordModal from '../components/VerifyPasswordModal';
import {
  EmailTab, SMSTab, AlipayTab, WechatTab, GoogleTab, OrcidTab, AppleTab,
  MicrosoftTab, DiscourseTab, GithubTab, PrivacyTab, TermsTab, SystemTab,
  SettingsProvider,
} from './settings';
import {
  GithubIcon, GoogleIcon, AppleIcon, MicrosoftIcon, OrcidIcon,
  DiscourseIcon, WeChatIcon,
} from '../../components/icons/providers';
import './SystemSettings.css';

// 5 分钟后自动过期
const VERIFY_TTL_MS = 5 * 60 * 1000;

const SystemSettings = () => {
  const location = useLocation();

  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') || 'email';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [wechatSubTab, setWechatSubTab] = useState('pay');
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyEpoch, setVerifyEpoch] = useState(0);
  const expireTimerRef = useRef(null);

  // URL query 同步 activeTab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location.search, activeTab]);

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
    };
  }, []);

  const handleVerified = useCallback(() => {
    setIsVerified(true);
    setShowVerifyModal(false);
    // 触发子 Tab 以敏感模式重新加载
    setVerifyEpoch(n => n + 1);

    // 清除旧定时器（避免叠加）
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
    }
    expireTimerRef.current = setTimeout(() => {
      setIsVerified(false);
      // 触发子 Tab 以脱敏模式重新加载
      setVerifyEpoch(n => n + 1);
      expireTimerRef.current = null;
    }, VERIFY_TTL_MS);
  }, []);

  const handleRequestVerify = useCallback(() => {
    setShowVerifyModal(true);
  }, []);

  const contextValue = useMemo(() => ({
    isVerified,
    verifyEpoch,
    onRequestVerify: handleRequestVerify,
  }), [isVerified, verifyEpoch, handleRequestVerify]);

  return (
    <SettingsProvider value={contextValue}>
      <div className="settings-container">
        <div className="settings-header">
          <h1>系统设置</h1>
          <p>配置系统参数和应用设置</p>
        </div>

        <div className="settings-tabs">
          <div className="tab-group">
            <span className="tab-group-label">消息服务</span>
            <button className={`tab-button ${activeTab === 'email' ? 'active' : ''}`} onClick={() => setActiveTab('email')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              邮箱
            </button>
            <button className={`tab-button ${activeTab === 'sms' ? 'active' : ''}`} onClick={() => setActiveTab('sms')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
              短信
            </button>
          </div>

          <div className="tab-group">
            <span className="tab-group-label">支付</span>
            <button className={`tab-button ${activeTab === 'alipay' ? 'active' : ''}`} onClick={() => setActiveTab('alipay')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg>
              支付宝
            </button>
            <button className={`tab-button ${activeTab === 'wechat' ? 'active' : ''}`} onClick={() => setActiveTab('wechat')}>
              <WeChatIcon size={18} />
              微信
            </button>
          </div>

          <div className="tab-group">
            <span className="tab-group-label">第三方登录</span>
            <button className={`tab-button ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')}>
              <GithubIcon size={18} />
              GitHub
            </button>
            <button className={`tab-button ${activeTab === 'google' ? 'active' : ''}`} onClick={() => setActiveTab('google')}>
              <GoogleIcon size={18} />
              Google
            </button>
            <button className={`tab-button ${activeTab === 'apple' ? 'active' : ''}`} onClick={() => setActiveTab('apple')}>
              <AppleIcon size={18} />
              Apple
            </button>
            <button className={`tab-button ${activeTab === 'microsoft' ? 'active' : ''}`} onClick={() => setActiveTab('microsoft')}>
              <MicrosoftIcon size={18} />
              Microsoft
            </button>
            <button className={`tab-button ${activeTab === 'orcid' ? 'active' : ''}`} onClick={() => setActiveTab('orcid')}>
              <OrcidIcon size={18} />
              ORCID
            </button>
            <button className={`tab-button ${activeTab === 'discourse' ? 'active' : ''}`} onClick={() => setActiveTab('discourse')}>
              <DiscourseIcon size={18} />
              恩特学术
            </button>
          </div>

          <div className="tab-group">
            <span className="tab-group-label">系统</span>
            <button className={`tab-button ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
              通用设置
            </button>
            <button className={`tab-button ${activeTab === 'privacy' ? 'active' : ''}`} onClick={() => setActiveTab('privacy')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd"/></svg>
              隐私协议
            </button>
            <button className={`tab-button ${activeTab === 'terms' ? 'active' : ''}`} onClick={() => setActiveTab('terms')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
              用户协议
            </button>
          </div>
        </div>

        <div className="settings-content">
          {activeTab === 'email' && <EmailTab />}
          {activeTab === 'sms' && <SMSTab />}
          {activeTab === 'alipay' && <AlipayTab />}
          {activeTab === 'wechat' && <WechatTab wechatSubTab={wechatSubTab} setWechatSubTab={setWechatSubTab} />}
          {activeTab === 'google' && <GoogleTab />}
          {activeTab === 'orcid' && <OrcidTab />}
          {activeTab === 'apple' && <AppleTab />}
          {activeTab === 'microsoft' && <MicrosoftTab />}
          {activeTab === 'discourse' && <DiscourseTab />}
          {activeTab === 'privacy' && <PrivacyTab />}
          {activeTab === 'terms' && <TermsTab />}
          {activeTab === 'github' && <GithubTab />}
          {activeTab === 'system' && <SystemTab />}
        </div>

        <VerifyPasswordModal
          isOpen={showVerifyModal}
          onClose={() => setShowVerifyModal(false)}
          onVerified={handleVerified}
        />
      </div>
    </SettingsProvider>
  );
};

export default SystemSettings;

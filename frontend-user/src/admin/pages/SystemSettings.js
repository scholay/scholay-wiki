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
              <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M664.250054 368.541681c10.015098 0 19.892049 0.732687 29.67281 1.795902-26.647917-122.810047-159.358451-214.077703-310.826188-214.077703-169.353083 0-308.085774 114.232694-308.085774 259.274068 0 83.708494 46.165436 152.460344 123.281791 205.78483l-30.80868 92.49925 107.688651-53.455469c38.558178 7.53665 69.459978 15.308661 107.924012 15.308661 9.66308 0 19.230993-0.470721 28.752858-1.225921-6.025227-20.36584-9.521864-41.723264-9.521864-63.862493C402.328693 476.632491 517.908058 368.541681 664.250054 368.541681z"/></svg>
              微信
            </button>
          </div>

          <div className="tab-group">
            <span className="tab-group-label">第三方登录</span>
            <button className={`tab-button ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </button>
            <button className={`tab-button ${activeTab === 'google' ? 'active' : ''}`} onClick={() => setActiveTab('google')}>
              <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </button>
            <button className={`tab-button ${activeTab === 'apple' ? 'active' : ''}`} onClick={() => setActiveTab('apple')}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </button>
            <button className={`tab-button ${activeTab === 'microsoft' ? 'active' : ''}`} onClick={() => setActiveTab('microsoft')}>
              <svg viewBox="0 0 24 24" fill="#00A4EF"><path d="M1 1h10.5v10.5H1V1zm12.5 0H24v10.5H13.5V1zM1 13.5h10.5V24H1V13.5zm12.5 0H24V24H13.5V13.5z"/></svg>
              Microsoft
            </button>
            <button className={`tab-button ${activeTab === 'orcid' ? 'active' : ''}`} onClick={() => setActiveTab('orcid')}>
              <svg viewBox="0 0 24 24" fill="#A6CE39"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.022-2.484 4.022-3.722 0-1.847-1.238-3.722-3.806-3.722h-2.513z"/></svg>
              ORCID
            </button>
            <button className={`tab-button ${activeTab === 'discourse' ? 'active' : ''}`} onClick={() => setActiveTab('discourse')}>
              <svg viewBox="0 0 512 512" fill="none"><path d="M202.332 313.708C203.111 325.894 194.563 330.934 194.868 315.823C194.868 315.823 183.55 162.079 299.559 124.351C299.559 124.351 306.574 122.574 300.239 132.245C300.239 132.243 192.859 165.505 202.332 313.708Z" fill="#428249"/><path d="M301.956 312.888C308.821 322.982 304.091 331.662 296.623 318.519C296.623 318.519 216.088 216.244 296.474 124.484C296.474 124.484 300.738 120.694 300.241 132.243C300.239 132.243 225.036 199.736 301.956 312.888Z" fill="#428249"/><path d="M198.147 386.151C221.21 388.52 230.67 379.782 236.404 370.838C240.058 365.138 244.534 356.253 244.534 346.16C244.534 328.073 231.931 313.412 216.383 313.412C209.425 313.412 205.062 315.768 198.145 315.768C191.229 315.768 186.867 313.412 179.907 313.412C164.36 313.412 151.757 328.073 151.757 346.16C151.757 356.251 156.232 365.137 159.887 370.838C165.622 379.784 175.082 388.52 198.147 386.151Z" fill="#E64546"/><path d="M330.549 381.206C352.441 373.567 357.3 361.639 358.699 351.112C359.592 344.4 359.873 334.456 355.593 325.316C347.921 308.934 330.289 301.008 316.21 307.602C309.908 310.554 306.958 314.538 300.694 317.469C294.431 320.405 289.479 320.123 283.179 323.076C269.101 329.67 263.905 348.291 271.577 364.672C275.858 373.812 283.681 379.957 289.41 383.57C298.394 389.237 310.667 393.137 330.549 381.206Z" fill="#E64546"/><path d="M307.441 124.946C304.671 120.839 297.194 121.038 290.741 125.39C284.287 129.743 281.301 136.601 284.071 140.708C286.842 144.815 294.319 144.616 300.772 140.263C307.225 135.911 310.211 129.053 307.441 124.946Z" fill="#225E28"/></svg>
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

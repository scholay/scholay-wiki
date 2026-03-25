/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * WeChatLogin - 微信扫码登录（内嵌二维码）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Spin } from 'antd';
import { userAPI } from '../../services/api';
import { useToast } from '../ToastContainer';
import logger from '../../utils/logger';

const WeChatLogin = ({ onModeChange }) => {
  const [loading, setLoading] = useState(true);
  const qrCodeRef = useRef(null);
  const { showError } = useToast();

  const renderQRCode = useCallback((appId, redirectUri, state, scope) => {
    if (!window.WxLogin || !qrCodeRef.current) return;
    try {
      const qrStyleURL = `${window.location.origin}/wechat-qr-style.css`;
      new window.WxLogin({
        self_redirect: false,
        id: 'wechat-qrcode-container',
        appid: appId,
        scope,
        redirect_uri: encodeURIComponent(redirectUri),
        state,
        style: 'black',
        href: qrStyleURL,
      });
    } catch (err) {
      logger.error('Render WeChat QR code error:', err);
      showError('渲染微信二维码失败');
      onModeChange('welcome');
    }
  }, [showError, onModeChange]);

  const loadSDKAndRender = useCallback((appId, redirectUri, state, scope) => {
    if (qrCodeRef.current) qrCodeRef.current.innerHTML = '';

    if (window.WxLogin) {
      renderQRCode(appId, redirectUri, state, scope);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
    script.async = true;
    script.onload = () => renderQRCode(appId, redirectUri, state, scope);
    script.onerror = () => {
      showError('加载微信登录组件失败，请刷新页面重试');
      onModeChange('welcome');
    };
    document.body.appendChild(script);
  }, [renderQRCode, showError, onModeChange]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        localStorage.removeItem('wechat_bind_state');
        localStorage.removeItem('wechat_bind_mode');

        const response = await userAPI.getWeChatQRCodeConfig();
        if (cancelled) return;

        if (response.data.code === 0 && response.data.data) {
          const { app_id, redirect_uri, state, scope } = response.data.data;
          localStorage.setItem('wechat_oauth_state', state);

          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== '/') localStorage.setItem('wechat_return_url', currentPath);

          loadSDKAndRender(app_id, redirect_uri, state, scope || 'snsapi_login');
        } else {
          showError(response.data.message || '获取微信登录配置失败');
          onModeChange('welcome');
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('WeChat login error:', err);
        showError('微信登录失败，请稍后重试');
        onModeChange('welcome');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [loadSDKAndRender, showError, onModeChange]);

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">微信扫码登录</h1>
        <p className="auth-subtitle">请使用微信扫描二维码登录</p>
      </div>

      <div className="auth-wechat-qrcode-wrapper">
        {loading ? (
          <div className="auth-wechat-qrcode-loading">
            <Spin size="large" />
            <span>正在加载二维码...</span>
          </div>
        ) : (
          <div id="wechat-qrcode-container" ref={qrCodeRef} className="auth-wechat-qrcode-container" />
        )}
      </div>

      <div className="auth-wechat-tips"><p>打开微信，扫一扫登录</p></div>

      <div style={{ textAlign: 'center' }}>
        <Button type="link" onClick={() => onModeChange('welcome')}>返回其他登录方式</Button>
      </div>
    </div>
  );
};

export default WeChatLogin;

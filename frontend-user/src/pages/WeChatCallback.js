import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import './WeChatCallback.css';

// CRITICAL: Clear old tokens IMMEDIATELY before component renders
// This prevents AuthContext from starting heartbeat with expired tokens
// Must be outside the component to run before React lifecycle
const bindMode = localStorage.getItem('wechat_bind_mode');
if (bindMode !== 'bind') {
  // Only clear tokens in login mode, not binding mode
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_data');
}

const WeChatCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [message, setMessage] = useState('正在处理微信登录...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        setStatus('error');
        setMessage('无效的微信回调参数');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Check if this is a binding operation
      const bindMode = localStorage.getItem('wechat_bind_mode');
      const savedState = localStorage.getItem(bindMode === 'bind' ? 'wechat_bind_state' : 'wechat_oauth_state');

      if (state !== savedState) {
        setStatus('error');
        setMessage('安全验证失败，请重试');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Note: Old tokens were already cleared at module load time (lines 10-15)
      // to prevent AuthContext from starting heartbeat with expired tokens

      try {
        let response;

        if (bindMode === 'bind') {
          // Binding mode
          response = await userAPI.bindWeChatAccount(code, state);

          if (response.data.code === 0) {
            // Clean up
            localStorage.removeItem('wechat_bind_state');
            localStorage.removeItem('wechat_bind_mode');

            setStatus('success');
            setMessage('微信账号绑定成功！即将跳转回设置页面...');

            // Redirect to settings page
            setTimeout(() => navigate('/settings'), 1500);
          } else {
            throw new Error(response.data.message || '微信绑定失败');
          }
        } else {
          // Login mode
          response = await userAPI.wechatCallback(code, state);

          if (response.data.code === 0 && response.data.data) {
            const { token, user, is_new_user } = response.data.data;

            // Save token and user data
            localStorage.setItem('user_token', token);
            localStorage.setItem('user_data', JSON.stringify(user));

            // Clean up
            localStorage.removeItem('wechat_oauth_state');

            // Update auth context (token first, then user data)
            login(token, user);

            setStatus('success');
            setMessage(is_new_user ? '微信账号注册成功！即将跳转...' : '微信登录成功！即将跳转...');

            // Redirect to home page
            setTimeout(() => navigate('/'), 1500);
          } else {
            throw new Error(response.data.message || '微信登录失败');
          }
        }
      } catch (error) {
        console.error('WeChat callback error:', error);
        setStatus('error');
        setMessage(error.response?.data?.message || error.message || (bindMode === 'bind' ? '微信绑定失败，请重试' : '微信登录失败，请重试'));
        setTimeout(() => navigate(bindMode === 'bind' ? '/settings' : '/'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  return (
    <div className="wechat-callback">
      <div className="wechat-callback-card">
        {status === 'processing' && (
          <>
            <div className="wechat-callback-spinner"></div>
            <div className="wechat-callback-message">{message}</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="wechat-callback-icon success">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div className="wechat-callback-message success">{message}</div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="wechat-callback-icon error">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <div className="wechat-callback-message error">{message}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default WeChatCallback;

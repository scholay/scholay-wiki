import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import './WeChatCallback.css';

// CRITICAL: Clear old tokens IMMEDIATELY before component renders
// This prevents AuthContext from starting heartbeat with expired tokens
// Must be outside the component to run before React lifecycle
// NOTE: We only clear auth tokens, NOT OAuth state which is needed for verification
const bindMode = localStorage.getItem('wechat_bind_mode');
if (bindMode !== 'bind') {
  // Only clear tokens in login mode, not binding mode
  // DO NOT clear wechat_oauth_state here - it's needed for verification
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

      // Debug logging
      console.log('WeChat callback - bindMode:', bindMode);
      console.log('WeChat callback - URL state:', state);
      console.log('WeChat callback - Saved state:', savedState);

      if (state !== savedState) {
        console.error('State mismatch - expected:', savedState, 'got:', state);
        setStatus('error');
        setMessage('安全验证失败，请重试');

        // Redirect with error state
        if (bindMode === 'bind') {
          const params = new URLSearchParams({
            tab: 'account',
            wechat_bind_status: 'error',
            message: '安全验证失败，请重试'
          });
          setTimeout(() => navigate(`/settings?${params.toString()}`), 1000);
        } else {
          setTimeout(() => navigate('/'), 3000);
        }
        return;
      }

      // Note: Old tokens were already cleared at module load time (lines 10-17)
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

            // Redirect to settings with success state
            const params = new URLSearchParams({
              tab: 'account',
              wechat_bind_status: 'success',
              message: '微信账号绑定成功！'
            });
            navigate(`/settings?${params.toString()}`);
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

            // Redirect to homepage immediately (login mode doesn't need toast)
            navigate('/');
          } else {
            throw new Error(response.data.message || '微信登录失败');
          }
        }
      } catch (error) {
        console.error('WeChat callback error:', error);
        const errorMessage = error.response?.data?.message || error.message || (bindMode === 'bind' ? '微信绑定失败' : '微信登录失败');
        setStatus('error');
        setMessage(errorMessage);

        // Clean up on error
        if (bindMode === 'bind') {
          localStorage.removeItem('wechat_bind_state');
          localStorage.removeItem('wechat_bind_mode');

          // Redirect to settings with error state
          const params = new URLSearchParams({
            tab: 'account',
            wechat_bind_status: 'error',
            message: errorMessage
          });
          setTimeout(() => navigate(`/settings?${params.toString()}`), 1000);
        } else {
          localStorage.removeItem('wechat_oauth_state');
          setTimeout(() => navigate('/'), 3000);
        }
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

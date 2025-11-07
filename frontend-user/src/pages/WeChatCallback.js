import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import logger from '../utils/logger';

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

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        console.error('Invalid WeChat callback parameters');
        navigate('/');
        return;
      }

      // Check if this is a binding operation
      const bindMode = localStorage.getItem('wechat_bind_mode');
      const savedState = localStorage.getItem(bindMode === 'bind' ? 'wechat_bind_state' : 'wechat_oauth_state');

      // Debug logging
      logger.log('WeChat callback - bindMode:', bindMode);
      logger.log('WeChat callback - URL state:', state);
      logger.log('WeChat callback - Saved state:', savedState);

      if (state !== savedState) {
        console.error('State mismatch - expected:', savedState, 'got:', state);

        // Redirect with error state
        if (bindMode === 'bind') {
          const params = new URLSearchParams({
            tab: 'account',
            wechat_bind_status: 'error',
            message: '安全验证失败，请重试'
          });
          navigate(`/settings?${params.toString()}`);
        } else {
          navigate('/');
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
            const { token, user } = response.data.data;

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
          navigate(`/settings?${params.toString()}`);
        } else {
          localStorage.removeItem('wechat_oauth_state');
          navigate('/');
        }
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  // No UI - just processing in background
  return null;
};

export default WeChatCallback;

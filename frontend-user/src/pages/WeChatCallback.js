import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import logger from '../utils/logger';

// Whitelist of allowed return URLs (paths only, no query params validation)
// Only these paths are allowed for redirect after WeChat login
const RETURN_URL_WHITELIST = [
  '/pricing',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/settings',
  '/dashboard',
  '/order-confirmation',
];

/**
 * Check if a return URL is in the whitelist
 * @param {string} url - The URL to check (can be full path or just pathname)
 * @returns {boolean} - True if the URL is whitelisted
 */
const isWhitelistedReturnURL = (url) => {
  if (!url || typeof url !== 'string') return false;

  // Extract pathname from URL (remove query string and hash)
  let pathname;
  try {
    // Handle both absolute URLs and relative paths
    if (url.startsWith('http://') || url.startsWith('https://')) {
      pathname = new URL(url).pathname;
    } else {
      // Relative path - extract pathname before query/hash
      pathname = url.split('?')[0].split('#')[0];
    }
  } catch (e) {
    return false;
  }

  // Check if pathname is in whitelist
  return RETURN_URL_WHITELIST.includes(pathname);
};

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
      const stateKey = bindMode === 'bind' ? 'wechat_bind_state' : 'wechat_oauth_state';
      const savedState = localStorage.getItem(stateKey);

      // Debug logging
      logger.log('WeChat callback - bindMode:', bindMode);
      logger.log('WeChat callback - State key:', stateKey);
      logger.log('WeChat callback - URL state:', state);
      logger.log('WeChat callback - Saved state:', savedState);
      logger.log('WeChat callback - All localStorage keys:', Object.keys(localStorage));

      if (state !== savedState) {
        console.error('State mismatch!');
        console.error('  Expected (from localStorage):', savedState);
        console.error('  Received (from URL):', state);
        console.error('  Storage key used:', stateKey);
        console.error('  All localStorage:', JSON.stringify({
          wechat_oauth_state: localStorage.getItem('wechat_oauth_state'),
          wechat_bind_state: localStorage.getItem('wechat_bind_state'),
          wechat_bind_mode: localStorage.getItem('wechat_bind_mode'),
        }));

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

            // Check for return URL and validate against whitelist
            const returnURL = localStorage.getItem('wechat_return_url');
            let redirectPath = '/'; // Default to home

            if (returnURL && isWhitelistedReturnURL(returnURL)) {
              // URL is whitelisted, use it for redirect
              redirectPath = returnURL;
              logger.log('WeChat login success - redirecting to whitelisted URL:', redirectPath);
            } else if (returnURL) {
              // URL provided but not whitelisted - log warning and use default
              logger.warn('WeChat login - return URL not whitelisted:', returnURL);
            }

            // Clean up
            localStorage.removeItem('wechat_oauth_state');
            localStorage.removeItem('wechat_return_url');

            // Update auth context (token first, then user data)
            login(token, user);

            // Redirect to target page
            navigate(redirectPath);
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
          localStorage.removeItem('wechat_return_url'); // Clean up return URL on error
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

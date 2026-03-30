/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/api';
import logger from '../utils/logger';

// Whitelist of allowed return URLs
const RETURN_URL_WHITELIST = [
  '/pricing',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/settings',
  '/admin',
  '/dashboard',
  '/order-confirmation',
];

/**
 * Check if a return URL is in the whitelist
 */
const isWhitelistedReturnURL = (url) => {
  if (!url || typeof url !== 'string') return false;

  let pathname;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      pathname = new URL(url).pathname;
    } else {
      pathname = url.split('?')[0].split('#')[0];
    }
  } catch (e) {
    return false;
  }

  return RETURN_URL_WHITELIST.includes(pathname);
};

// CRITICAL: Clear old tokens IMMEDIATELY before component renders
// This prevents AuthContext from starting session with expired tokens
// Must be outside the component to run before React lifecycle
// NOTE: We only clear auth tokens, NOT OAuth state which is needed for verification
const bindMode = localStorage.getItem('github_bind_mode');
if (bindMode !== 'bind') {
  // Only clear tokens in login mode, not binding mode
  // DO NOT clear github_bind_state/github_oauth_state here - it's needed for verification
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_data');
}

const GithubCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        logger.error('Invalid GitHub callback parameters');
        navigate('/');
        return;
      }

      // Check if this is a binding operation
      const bindMode = localStorage.getItem('github_bind_mode');
      const stateKey = bindMode === 'bind' ? 'github_bind_state' : 'github_oauth_state';
      const savedState = localStorage.getItem(stateKey);

      // Debug logging
      logger.log('GitHub callback - bindMode:', bindMode);
      logger.log('GitHub callback - State key:', stateKey);
      logger.log('GitHub callback - URL state:', state);
      logger.log('GitHub callback - Saved state:', savedState);

      if (state !== savedState) {
        logger.error('State mismatch!');
        logger.error('  Expected (from localStorage):', savedState);
        logger.error('  Received (from URL):', state);
        logger.error('  Storage key used:', stateKey);

        // Redirect with error state
        if (bindMode === 'bind') {
          const params = new URLSearchParams({
            tab: 'account',
            github_bind_status: 'error',
            message: '安全验证失败，请重试'
          });
          navigate(`/settings?${params.toString()}`);
        } else {
          navigate('/');
        }
        return;
      }

      try {
        let response;

        if (bindMode === 'bind') {
          // Binding mode
          response = await userAPI.bindGitHubAccount(code, state);

          if (response.data.code === 0) {
            // Clean up
            localStorage.removeItem('github_bind_state');
            localStorage.removeItem('github_bind_mode');
            localStorage.removeItem('github_return_url');

            // Redirect to settings with success state
            const params = new URLSearchParams({
              tab: 'account',
              github_bind_status: 'success',
              message: 'GitHub 账号绑定成功！'
            });
            navigate(`/settings?${params.toString()}`);
          } else {
            throw new Error(response.data.message || 'GitHub 绑定失败');
          }
        } else {
          // Login mode
          response = await userAPI.githubCallback(code, state);

          if (response.data.code === 0 && response.data.data) {
            const { token, user } = response.data.data;

            // Save token and user data
            localStorage.setItem('user_token', token);
            localStorage.setItem('user_data', JSON.stringify(user));

            // Check for return URL
            const returnURL = localStorage.getItem('github_return_url');
            let redirectPath = '/';

            if (returnURL && isWhitelistedReturnURL(returnURL)) {
              redirectPath = returnURL;
              logger.log('GitHub login success - redirecting to:', redirectPath);
            } else if (returnURL) {
              logger.warn('GitHub login - return URL not whitelisted:', returnURL);
            }

            // Clean up
            localStorage.removeItem('github_oauth_state');
            localStorage.removeItem('github_return_url');

            // Update auth context
            login(token, user);

            // Redirect
            navigate(redirectPath);
          } else {
            throw new Error(response.data.message || 'GitHub 登录失败');
          }
        }
      } catch (error) {
        logger.error('GitHub callback error:', error);
        const errorMessage = error.response?.data?.message || error.message || (bindMode === 'bind' ? 'GitHub 绑定失败' : 'GitHub 登录失败');

        // Clean up on error
        if (bindMode === 'bind') {
          localStorage.removeItem('github_bind_state');
          localStorage.removeItem('github_bind_mode');
          localStorage.removeItem('github_return_url');

          // Redirect to settings with error state
          const params = new URLSearchParams({
            tab: 'account',
            github_bind_status: 'error',
            message: errorMessage
          });
          navigate(`/settings?${params.toString()}`);
        } else {
          localStorage.removeItem('github_oauth_state');
          localStorage.removeItem('github_return_url');
          navigate('/');
        }
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  return null;
};

export default GithubCallback;

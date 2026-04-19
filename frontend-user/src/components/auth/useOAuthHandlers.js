/**
 * useOAuthHandlers — 统一管理所有 OAuth 登录逻辑
 * 消除 GitHub/Apple/ORCID/Microsoft/Discourse 重复代码
 */
import { useCallback } from 'react';
import { userAPI } from '../../services/user.api';
import logger from '../../utils/logger';

function saveReturnUrl(provider) {
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== '/') {
    localStorage.setItem(`${provider}_return_url`, currentPath);
  }
}

export default function useOAuthHandlers(showError) {
  const handleGithubLogin = useCallback(async () => {
    try {
      const response = await userAPI.getGithubLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('github_oauth_state', response.data.data.state);
        saveReturnUrl('github');
        window.location.href = response.data.data.url;
      } else {
        showError(response.data.message || '获取 GitHub 登录链接失败');
      }
    } catch (err) {
      logger.error('GitHub login error:', err);
      showError('GitHub 登录失败，请稍后重试');
    }
  }, [showError]);

  const handleAppleLogin = useCallback(async () => {
    try {
      const response = await userAPI.getAppleLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('apple_oauth_state', response.data.data.state);
        saveReturnUrl('apple');
        window.location.href = response.data.data.url;
      } else {
        showError(response.data.message || '获取 Apple 登录链接失败');
      }
    } catch (err) {
      logger.error('Apple login error:', err);
      showError('Apple 登录失败，请稍后重试');
    }
  }, [showError]);

  const handleOrcidLogin = useCallback(async () => {
    try {
      const response = await userAPI.getOrcidLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('orcid_oauth_state', response.data.data.state);
        saveReturnUrl('orcid');
        window.location.href = response.data.data.url;
      } else {
        showError(response.data.message || '获取 ORCID 登录链接失败');
      }
    } catch (err) {
      logger.error('ORCID login error:', err);
      showError('ORCID 登录失败，请稍后重试');
    }
  }, [showError]);

  const handleMicrosoftLogin = useCallback(async () => {
    try {
      const response = await userAPI.getMicrosoftLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('microsoft_oauth_state', response.data.data.state);
        saveReturnUrl('microsoft');
        window.location.href = response.data.data.url;
      } else {
        showError(response.data.message || '获取 Microsoft 登录链接失败');
      }
    } catch (err) {
      logger.error('Microsoft login error:', err);
      showError('Microsoft 登录失败，请稍后重试');
    }
  }, [showError]);

  const handleDiscourseLogin = useCallback(async () => {
    try {
      const response = await userAPI.getDiscourseLoginURL();
      if (response.data.code === 0 && response.data.data) {
        localStorage.setItem('discourse_sso_nonce', response.data.data.nonce);
        saveReturnUrl('discourse');
        window.location.href = response.data.data.url;
      } else {
        showError(response.data.message || '获取恩特学术登录链接失败');
      }
    } catch (err) {
      logger.error('Discourse login error:', err);
      showError('恩特学术登录失败，请稍后重试');
    }
  }, [showError]);

  return {
    handleGithubLogin,
    handleAppleLogin,
    handleOrcidLogin,
    handleMicrosoftLogin,
    handleDiscourseLogin,
  };
}

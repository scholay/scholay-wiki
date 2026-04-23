/**
 * useOAuthHandlers — 统一管理所有 OAuth 登录逻辑
 * 消除 GitHub/Apple/ORCID/Microsoft/Discourse 重复代码
 *
 * loadingProvider：跟踪当前哪个 provider 正在获取 URL / 准备跳转
 *   button 一被点击就置为对应 id,button 上显示 spinner,其他 button 禁用
 *   URL 获取成功后即将 window.location.href 跳转,这时 loadingProvider 保持设置
 *   (因为页面立刻离开,不需要 reset);
 *   URL 获取失败才 reset 为 null 让用户可以重试
 */
import { useCallback, useState } from 'react';
import { userAPI } from '../../services/user.api';
import logger from '../../utils/logger';

function saveReturnUrl(provider) {
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== '/') {
    localStorage.setItem(`${provider}_return_url`, currentPath);
  }
}

// 通用 OAuth 登录处理器工厂：封装 "set loading → 请求 URL → 存 state → 跳转" 的共同流程
function makeOAuthHandler({ fetchUrl, stateKey, stateValueKey, provider, errorMsg, setLoadingProvider, showError }) {
  return async () => {
    setLoadingProvider(provider);
    try {
      const response = await fetchUrl();
      if (response.data.code === 0 && response.data.data) {
        if (stateKey && stateValueKey) {
          localStorage.setItem(stateKey, response.data.data[stateValueKey]);
        }
        saveReturnUrl(provider);
        window.location.href = response.data.data.url;
        // 不 reset loading：页面即将跳走
      } else {
        setLoadingProvider(null);
        showError(response.data.message || errorMsg);
      }
    } catch (err) {
      setLoadingProvider(null);
      logger.error(`${provider} login error:`, err);
      showError(errorMsg);
    }
  };
}

export default function useOAuthHandlers(showError) {
  // 当前正在加载的 provider id（'github' | 'apple' | 'orcid' | 'microsoft' | 'discourse' | null）
  const [loadingProvider, setLoadingProvider] = useState(null);

  const handleGithubLogin = useCallback(
    makeOAuthHandler({
      fetchUrl: () => userAPI.getGithubLoginURL(),
      stateKey: 'github_oauth_state',
      stateValueKey: 'state',
      provider: 'github',
      errorMsg: 'GitHub 登录失败，请稍后重试',
      setLoadingProvider,
      showError,
    }),
    [showError],
  );

  const handleAppleLogin = useCallback(
    makeOAuthHandler({
      fetchUrl: () => userAPI.getAppleLoginURL(),
      stateKey: 'apple_oauth_state',
      stateValueKey: 'state',
      provider: 'apple',
      errorMsg: 'Apple 登录失败，请稍后重试',
      setLoadingProvider,
      showError,
    }),
    [showError],
  );

  const handleOrcidLogin = useCallback(
    makeOAuthHandler({
      fetchUrl: () => userAPI.getOrcidLoginURL(),
      stateKey: 'orcid_oauth_state',
      stateValueKey: 'state',
      provider: 'orcid',
      errorMsg: 'ORCID 登录失败，请稍后重试',
      setLoadingProvider,
      showError,
    }),
    [showError],
  );

  const handleMicrosoftLogin = useCallback(
    makeOAuthHandler({
      fetchUrl: () => userAPI.getMicrosoftLoginURL(),
      stateKey: 'microsoft_oauth_state',
      stateValueKey: 'state',
      provider: 'microsoft',
      errorMsg: 'Microsoft 登录失败，请稍后重试',
      setLoadingProvider,
      showError,
    }),
    [showError],
  );

  const handleDiscourseLogin = useCallback(
    makeOAuthHandler({
      fetchUrl: () => userAPI.getDiscourseLoginURL(),
      stateKey: 'discourse_sso_nonce',
      stateValueKey: 'nonce',
      provider: 'discourse',
      errorMsg: '恩特学术登录失败，请稍后重试',
      setLoadingProvider,
      showError,
    }),
    [showError],
  );

  return {
    handleGithubLogin,
    handleAppleLogin,
    handleOrcidLogin,
    handleMicrosoftLogin,
    handleDiscourseLogin,
    loadingProvider,
  };
}

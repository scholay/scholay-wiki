/**
 * ============================================================================
 * 通用 OAuth 回调处理页面
 * 支持 ORCID、Microsoft 等标准 OAuth redirect 流程
 * ============================================================================
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/user.api';
import logger from '../utils/logger';

const RETURN_URL_WHITELIST = [
  '/pricing', '/search-results', '/advanced-search', '/chat',
  '/settings', '/admin', '/dashboard', '/order-confirmation',
];

const isWhitelistedReturnURL = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0].split('#')[0];
    return RETURN_URL_WHITELIST.includes(pathname);
  } catch {
    return false;
  }
};

/**
 * 通用 OAuth 回调组件
 * @param {object} props
 * @param {string} props.provider - 'orcid' | 'microsoft'
 * @param {function} props.callbackAPI - (code, state) => Promise (login callback API)
 * @param {function} props.bindAPI - (code, state) => Promise (bind callback API)
 */
const OAuthCallback = ({ provider, callbackAPI, bindAPI }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        logger.error(`Invalid ${provider} callback parameters`);
        navigate('/');
        return;
      }

      const bindMode = localStorage.getItem(`${provider}_bind_mode`);
      const stateKey = bindMode === 'bind' ? `${provider}_bind_state` : `${provider}_oauth_state`;
      const savedState = localStorage.getItem(stateKey);

      if (!savedState || savedState !== state) {
        logger.error(`${provider} OAuth state mismatch`);
        navigate('/');
        return;
      }

      // Clear state
      localStorage.removeItem(stateKey);
      localStorage.removeItem(`${provider}_bind_mode`);

      try {
        if (bindMode === 'bind') {
          await bindAPI(code, state);
          const returnUrl = localStorage.getItem(`${provider}_return_url`) || '/settings';
          localStorage.removeItem(`${provider}_return_url`);
          navigate(returnUrl + '?bind_success=' + provider);
        } else {
          // Login mode
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_data');

          const response = await callbackAPI(code, state);
          const data = response.data?.data || response.data;

          if (data?.token) {
            login(data.token, data.user);
            const returnUrl = localStorage.getItem(`${provider}_return_url`);
            localStorage.removeItem(`${provider}_return_url`);

            if (returnUrl && isWhitelistedReturnURL(returnUrl)) {
              navigate(returnUrl);
            } else {
              navigate('/');
            }
          } else {
            throw new Error('No token in response');
          }
        }
      } catch (err) {
        logger.error(`${provider} callback error:`, err);
        const msg = err.response?.data?.message || `${provider} 登录失败`;
        navigate(`/?error=${encodeURIComponent(msg)}`);
      }
    };

    handleCallback();
  }, [searchParams, navigate, login, provider, callbackAPI, bindAPI]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="loading-spinner" />
        <p style={{ marginTop: 16, color: '#666' }}>正在处理 {provider.toUpperCase()} 登录...</p>
      </div>
    </div>
  );
};

// ORCID Callback
export const OrcidCallback = () => (
  <OAuthCallback
    provider="orcid"
    callbackAPI={userAPI.orcidCallback}
    bindAPI={userAPI.bindOrcidAccount}
  />
);

// Microsoft Callback
export const MicrosoftCallback = () => (
  <OAuthCallback
    provider="microsoft"
    callbackAPI={userAPI.microsoftCallback}
    bindAPI={userAPI.bindMicrosoftAccount}
  />
);

export default OAuthCallback;

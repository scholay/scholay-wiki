/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * DiscourseCallback — 处理 Discourse DiscourseConnect SSO 回调
 *
 * Discourse SSO 协议与 OAuth2 不同：
 *   - 回调参数是 sso (Base64 encoded payload) 和 sig (HMAC-SHA256 签名)
 *   - 后端会验证签名、解码 payload、提取用户信息
 */

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { userAPI } from '../services/user.api';
import logger from '../utils/logger';

// 白名单：允许的返回路径
const RETURN_URL_WHITELIST = [
  '/pricing', '/search-results', '/chat', '/settings',
  '/admin', '/peer-review', '/latex-writer',
];

const isWhitelistedReturnURL = (url) => {
  if (!url || typeof url !== 'string') return false;
  let pathname;
  try {
    pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0].split('#')[0];
  } catch { return false; }
  return RETURN_URL_WHITELIST.includes(pathname);
};

// 登录模式下清除旧 token（必须在组件渲染前执行）
const bindMode = localStorage.getItem('discourse_bind_mode');
if (bindMode !== 'bind') {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_data');
}

const DiscourseCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const sso = searchParams.get('sso');
      const sig = searchParams.get('sig');

      if (!sso || !sig) {
        logger.error('Invalid Discourse callback parameters');
        navigate('/');
        return;
      }

      const bindMode = localStorage.getItem('discourse_bind_mode');

      try {
        let response;

        if (bindMode === 'bind') {
          // 绑定模式
          response = await userAPI.bindDiscourseAccount(sso, sig);

          if (response.data.code === 0) {
            localStorage.removeItem('discourse_bind_mode');
            localStorage.removeItem('discourse_sso_nonce');
            localStorage.removeItem('discourse_return_url');

            const params = new URLSearchParams({
              tab: 'account',
              discourse_bind_status: 'success',
              message: '恩特学术账号绑定成功！',
            });
            navigate(`/settings?${params.toString()}`);
          } else {
            throw new Error(response.data.message || '恩特学术账号绑定失败');
          }
        } else {
          // 登录模式
          response = await userAPI.discourseCallback(sso, sig);

          if (response.data.code === 0 && response.data.data) {
            const { token, user } = response.data.data;

            localStorage.setItem('user_token', token);
            localStorage.setItem('user_data', JSON.stringify(user));

            const returnURL = localStorage.getItem('discourse_return_url');
            let redirectPath = '/';

            if (returnURL && isWhitelistedReturnURL(returnURL)) {
              redirectPath = returnURL;
            }

            localStorage.removeItem('discourse_sso_nonce');
            localStorage.removeItem('discourse_return_url');

            login(token, user);
            navigate(redirectPath);
          } else {
            throw new Error(response.data.message || '恩特学术登录失败');
          }
        }
      } catch (error) {
        logger.error('Discourse callback error:', error);
        const errorMessage = error.response?.data?.message || error.message || '恩特学术登录失败';

        localStorage.removeItem('discourse_bind_mode');
        localStorage.removeItem('discourse_sso_nonce');
        localStorage.removeItem('discourse_return_url');

        if (bindMode === 'bind') {
          const params = new URLSearchParams({
            tab: 'account',
            discourse_bind_status: 'error',
            message: errorMessage,
          });
          navigate(`/settings?${params.toString()}`);
        } else {
          navigate('/?login_error=' + encodeURIComponent(errorMessage));
        }
      }
    };

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid var(--border)',
          borderTopColor: 'var(--primary-solid)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {bindMode === 'bind' ? '正在绑定恩特学术账号...' : '正在通过恩特学术账号登录...'}
        </p>
      </div>
    </div>
  );
};

export default DiscourseCallback;

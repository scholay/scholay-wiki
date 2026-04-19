/**
 * Apple Sign In 回调处理页面
 * Apple 使用 form_post，后端处理后 redirect 回前端带 token 参数
 */
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import type { User } from '../types/user';

const AppleCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      // 后端已验证并返回 JWT，直接登录；用户信息将由 refreshUser 异步拉取
      // login 类型签名要求 User，但此处尚无用户数据，转换为 null 以触发后续刷新
      login(token, null as unknown as User);

      const returnUrl = localStorage.getItem('apple_return_url');
      localStorage.removeItem('apple_return_url');
      localStorage.removeItem('apple_oauth_state');
      localStorage.removeItem('apple_bind_mode');

      navigate(returnUrl || '/');
    } else {
      navigate('/?error=Apple+登录失败');
    }
  }, [searchParams, navigate, login]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="loading-spinner" />
        <p style={{ marginTop: 16, color: '#666' }}>正在处理 Apple 登录...</p>
      </div>
    </div>
  );
};

export default AppleCallback;

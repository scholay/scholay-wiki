/**
 * Apple Sign In 回调处理页面
 * Apple 使用 form_post，后端处理后 redirect 回前端带 token 参数
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

const AppleCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const isNewUser = searchParams.get('is_new_user') === 'true';

    if (token) {
      // 后端已验证并返回 JWT，直接登录
      login(token, null);

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

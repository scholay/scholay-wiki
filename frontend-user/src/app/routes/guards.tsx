/**
 * 路由守卫组件
 *
 * 使用 Zustand authStore 替代 useAuth Context。
 * ProtectedRoute: 需要登录
 * AdminRoute: 需要 admin 角色 + adminTheme
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import { useAuthStore } from '../../shared/stores/authStore';
import { adminTheme } from '../../theme/antdTheme';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.dispatchEvent(new CustomEvent('auth:required'));
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (requiredRole === 'admin' && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <ProtectedRoute requiredRole="admin">
      <ConfigProvider theme={adminTheme}>{children}</ConfigProvider>
    </ProtectedRoute>
  );
};

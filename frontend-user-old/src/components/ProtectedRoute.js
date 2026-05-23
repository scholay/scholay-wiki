/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

/**
 * ProtectedRoute - 保护需要登录才能访问的路由
 *
 * 如果用户未登录，自动重定向到首页
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // 等待认证状态加载完成
  if (loading) {
    return null; // 或者返回一个加载指示器
  }

  // 如果未登录，重定向到首页
  if (!isAuthenticated) {
    // 使用 replace 避免在浏览器历史中留下记录
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // 已登录，渲染子组件
  return children;
};

export default ProtectedRoute;

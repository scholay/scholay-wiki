/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Toast from './components/Toast';
import { AuthProvider, useAuth } from './utils/AuthContext';

// Lazy load all page components for better performance
const Login = lazy(() => import('./pages/Login'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const ThirdPartyAccounts = lazy(() => import('./pages/ThirdPartyAccounts'));
const PromptTemplates = lazy(() => import('./pages/PromptTemplates'));
const SubscriptionPlans = lazy(() => import('./pages/SubscriptionPlans'));
const OrderManagement = lazy(() => import('./pages/OrderManagement'));
const CouponManagement = lazy(() => import('./pages/CouponManagement'));
const CouponBatchManagement = lazy(() => import('./pages/CouponBatchManagement'));
const DistributedCoupons = lazy(() => import('./pages/DistributedCoupons'));
const DefaultBusinessData = lazy(() => import('./pages/DefaultBusinessData'));
const FeedbackManagement = lazy(() => import('./pages/FeedbackManagement'));
const CurrencyConfig = lazy(() => import('./pages/CurrencyConfig'));
const UsageLogs = lazy(() => import('./pages/UsageLogs'));
const MessageManagement = lazy(() => import('./pages/MessageManagement'));
const MessageTemplates = lazy(() => import('./pages/MessageTemplates'));
const CodeSnippets = lazy(() => import('./pages/CodeSnippets'));

// Loading component for Suspense fallback
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <div>Loading...</div>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingFallback />;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <DashboardLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="orders" element={<OrderManagement />} />
              <Route path="coupons" element={<CouponManagement />} />
              <Route path="coupon-batches" element={<CouponBatchManagement />} />
              <Route path="distributed-coupons" element={<DistributedCoupons />} />
              <Route path="third-party-accounts" element={<ThirdPartyAccounts />} />
              <Route path="prompt-templates" element={<PromptTemplates />} />
              <Route path="subscription-plans" element={<SubscriptionPlans />} />
              <Route path="default-business-data" element={<DefaultBusinessData />} />
              <Route path="feedbacks" element={<FeedbackManagement />} />
              <Route path="currency-config" element={<CurrencyConfig />} />
              <Route path="usage-logs" element={<UsageLogs />} />
              <Route path="messages" element={<MessageManagement />} />
              <Route path="message-templates" element={<MessageTemplates />} />
              <Route path="code-snippets" element={<CodeSnippets />} />
              <Route path="settings" element={<SystemSettings />} />
              {/* 保留旧路由以防万一，但重定向到设置页 */}
              <Route path="alipay-config" element={<Navigate to="/dashboard/settings?tab=alipay" replace />} />
              <Route path="wechat-config" element={<Navigate to="/dashboard/settings?tab=wechat" replace />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </Suspense>
        <Toast />
      </Router>
    </AuthProvider>
  );
}

export default App;

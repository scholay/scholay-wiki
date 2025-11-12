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

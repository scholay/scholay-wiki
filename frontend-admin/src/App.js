import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import SystemSettings from './pages/SystemSettings';
import UserManagement from './pages/UserManagement';
import ThirdPartyAccounts from './pages/ThirdPartyAccounts';
import PromptTemplates from './pages/PromptTemplates';
import SubscriptionPlans from './pages/SubscriptionPlans';
import Toast from './components/Toast';
import { AuthProvider, useAuth } from './utils/AuthContext';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
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
        <Toast />
      </Router>
    </AuthProvider>
  );
}

export default App;

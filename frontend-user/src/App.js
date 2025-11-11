import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './utils/AuthContext';
import { ToastProvider } from './components/ToastContainer';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import ProtectedRoute from './components/ProtectedRoute';

// 首页立即加载(最常访问)
import Home from './pages/Home';

// 其他页面使用懒加载 - 大幅减少初始bundle大小
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const AdvancedSearchPage = lazy(() => import('./pages/AdvancedSearchPage'));
const PaperDetailPage = lazy(() => import('./pages/PaperDetailPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Settings = lazy(() => import('./pages/Settings'));
const WeChatCallback = lazy(() => import('./pages/WeChatCallback'));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'));
const AuthModal = lazy(() => import('./components/AuthModal'));

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    // Listen for auth:required event from API interceptor
    const handleAuthRequired = () => {
      setShowAuthModal(true);
    };

    window.addEventListener('auth:required', handleAuthRequired);
    return () => {
      window.removeEventListener('auth:required', handleAuthRequired);
    };
  }, []);

  return (
    <HelmetProvider>
      <ToastProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <Router>
            <Suspense fallback={null}>
              <Routes>
                {/* 公开路由 - 无需登录即可访问 */}
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Navigate to="/" replace />} />
                <Route path="/pricing" element={<Pricing />} />

                {/* 需要登录的路由 - 使用 ProtectedRoute 包裹 */}
                <Route path="/search-results" element={
                  <ProtectedRoute>
                    <SearchResultsPage />
                  </ProtectedRoute>
                } />
                <Route path="/advanced-search" element={
                  <ProtectedRoute>
                    <AdvancedSearchPage />
                  </ProtectedRoute>
                } />
                {/* 论文详情页 - 公开访问 */}
                <Route path="/paper/:paperId" element={<PaperDetailPage />} />
                <Route path="/chat" element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } />
                <Route path="/order-confirmation" element={
                  <ProtectedRoute>
                    <OrderConfirmation />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                {/* WeChat callback - PUBLIC route (must be accessible without login for OAuth flow) */}
                <Route path="/wechat/callback" element={<WeChatCallback />} />

                {/* 404 redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>

              {/* Global auth modal for session expiry - 条件渲染避免不必要的组件加载 */}
              {showAuthModal && (
                <AuthModal
                  isOpen={showAuthModal}
                  onClose={() => setShowAuthModal(false)}
                  onLoginSuccess={() => setShowAuthModal(false)}
                />
              )}
            </Suspense>
          </Router>
        </SubscriptionProvider>
        </AuthProvider>
      </ToastProvider>
    </HelmetProvider>
  );
}

export default App;

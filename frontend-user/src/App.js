import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SearchResultsPage from './pages/SearchResultsPage';
import AdvancedSearchPage from './pages/AdvancedSearchPage';
import PaperDetailPage from './pages/PaperDetailPage';
import ChatPage from './pages/ChatPage';
import Pricing from './pages/Pricing';
import SubscriptionManagement from './pages/SubscriptionManagement';
import Settings from './pages/Settings';
import WeChatCallback from './pages/WeChatCallback';
import OrderConfirmation from './pages/OrderConfirmation';
import AuthModal from './components/AuthModal';
import { AuthProvider } from './utils/AuthContext';
import { ToastProvider } from './components/ToastContainer';

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
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Navigate to="/" replace />} />
            <Route path="/search-results" element={<SearchResultsPage />} />
            <Route path="/advanced-search" element={<AdvancedSearchPage />} />
            <Route path="/paper/:paperId" element={<PaperDetailPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/subscription" element={<SubscriptionManagement />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/wechat/callback" element={<WeChatCallback />} />
            {/* 404 redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>

        {/* Global auth modal for session expiry */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={() => setShowAuthModal(false)}
        />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

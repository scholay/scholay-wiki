import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SearchResultsPage from './pages/SearchResultsPage';
import AdvancedSearchPage from './pages/AdvancedSearchPage';
import AuthModal from './components/AuthModal';
import { AuthProvider } from './utils/AuthContext';

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
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Navigate to="/" replace />} />
          <Route path="/search-results" element={<SearchResultsPage />} />
          <Route path="/advanced-search" element={<AdvancedSearchPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
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
  );
}

export default App;

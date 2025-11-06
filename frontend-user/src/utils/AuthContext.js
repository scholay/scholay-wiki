import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { userAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const heartbeatIntervalRef = useRef(null);

  // Heartbeat function to keep session alive
  const sendHeartbeat = async () => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      stopHeartbeat();
      return;
    }

    try {
      await userAPI.heartbeat();
    } catch (error) {
      // If 401, axios interceptor will handle it (clear token, redirect, etc.)
      // For other errors, just stop heartbeat
      if (error.response?.status !== 401) {
        console.error('Heartbeat error:', error);
      }
      stopHeartbeat();
    }
  };

  // Start heartbeat
  const startHeartbeat = () => {
    // Clear any existing interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval to send heartbeat every 30 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
  };

  // Stop heartbeat
  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem('user_token');
    const userData = localStorage.getItem('user_data');

    if (token && userData && userData !== 'undefined') {
      try {
        setIsAuthenticated(true);
        setUser(JSON.parse(userData));
        startHeartbeat(); // Start heartbeat for existing session
      } catch (error) {
        // Clear invalid data
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
      }
    }
    setLoading(false);

    // Listen for auth expiration events
    const handleAuthExpired = (event) => {
      const message = event.detail?.message || '登录已失效';
      // Stop heartbeat and clear state
      stopHeartbeat();
      setIsAuthenticated(false);
      setUser(null);

      // Show notification to user
      alert(message);
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    // Cleanup on unmount
    return () => {
      stopHeartbeat();
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
    startHeartbeat(); // Start heartbeat when user logs in
  };

  const logout = async () => {
    // Stop heartbeat first
    stopHeartbeat();

    // Call backend logout API to delete session
    try {
      await userAPI.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }

    // Clear local storage and state
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    setIsAuthenticated(false);
    setUser(null);
  };

  // Update user data in state and localStorage
  const updateUser = (userData) => {
    localStorage.setItem('user_data', JSON.stringify(userData));
    setUser(userData);
  };

  // Refresh user data from backend
  const refreshUser = async () => {
    try {
      const response = await userAPI.getProfile();
      if (response.data.code === 0 && response.data.data) {
        updateUser(response.data.data);
        return response.data.data;
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
    return null;
  };

  const value = {
    isAuthenticated,
    user,
    login,
    logout,
    updateUser,
    refreshUser,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

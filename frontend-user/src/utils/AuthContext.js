import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

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
      const response = await fetch('/api/v1/user/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Heartbeat failed, stopping heartbeat');
        stopHeartbeat();
      }
    } catch (error) {
      console.error('Heartbeat error:', error);
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

    // Cleanup on unmount
    return () => {
      stopHeartbeat();
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
    const token = localStorage.getItem('user_token');

    // Stop heartbeat first
    stopHeartbeat();

    // Call backend logout API to delete session
    if (token) {
      try {
        await fetch('/api/v1/user/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
      }
    }

    // Clear local storage and state
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    setIsAuthenticated(false);
    setUser(null);
  };

  const value = {
    isAuthenticated,
    user,
    login,
    logout,
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

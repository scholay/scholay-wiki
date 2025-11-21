import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { userAPI, subscriptionAPI } from '../services/api';

const AuthContext = createContext(null);

// 配置常量
const HEARTBEAT_CONFIG = {
  ACTIVE_INTERVAL: 30000,      // 活跃状态下的心跳间隔：30秒
  IDLE_INTERVAL: 120000,       // 空闲状态下的心跳间隔：2分钟
  IDLE_TIMEOUT: 60000,         // 空闲超时时间：1分钟无操作视为空闲
  INACTIVE_TIMEOUT: 300000,    // 不活跃超时时间：5分钟无操作停止心跳
};

// 需要监听的用户活动事件
const USER_ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove', 
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'focus',
];

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 心跳相关的 refs
  const heartbeatIntervalRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isIdleRef = useRef(false);
  const activityCheckIntervalRef = useRef(null);
  
  // 使用 ref 存储函数引用，避免循环依赖
  const startHeartbeatRef = useRef(null);

  // Heartbeat function to keep session alive
  const sendHeartbeat = useCallback(async () => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      return false;
    }

    try {
      await userAPI.heartbeat();
      return true;
    } catch (error) {
      // If 401, axios interceptor will handle it (clear token, redirect, etc.)
      // For other errors, just log
      if (error.response?.status !== 401) {
        console.error('Heartbeat error:', error);
      }
      return false;
    }
  }, []);

  // 重新设置心跳间隔
  const restartHeartbeatWithInterval = useCallback((interval) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, interval);
  }, [sendHeartbeat]);

  // Stop heartbeat - 定义在前面以便其他函数使用
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (activityCheckIntervalRef.current) {
      clearInterval(activityCheckIntervalRef.current);
      activityCheckIntervalRef.current = null;
    }
  }, []);

  // 检查用户活动状态
  const checkActivityStatus = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;

    // 如果超过不活跃时间，停止心跳
    if (timeSinceLastActivity >= HEARTBEAT_CONFIG.INACTIVE_TIMEOUT) {
      if (heartbeatIntervalRef.current) {
        stopHeartbeat();
      }
      return;
    }

    // 如果超过空闲时间但未超过不活跃时间，降低心跳频率
    if (timeSinceLastActivity >= HEARTBEAT_CONFIG.IDLE_TIMEOUT && !isIdleRef.current) {
      isIdleRef.current = true;
      restartHeartbeatWithInterval(HEARTBEAT_CONFIG.IDLE_INTERVAL);
    }
  }, [stopHeartbeat, restartHeartbeatWithInterval]);

  // 更新最后活动时间
  const updateLastActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // 如果之前是空闲状态，现在变为活跃
    if (isIdleRef.current) {
      isIdleRef.current = false;
      // 立即发送一次心跳，然后重新设置活跃间隔
      const token = localStorage.getItem('user_token');
      if (token) {
        sendHeartbeat();
        restartHeartbeatWithInterval(HEARTBEAT_CONFIG.ACTIVE_INTERVAL);
      }
    }
  }, [sendHeartbeat, restartHeartbeatWithInterval]);

  // Handle page visibility change
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // Page became visible, update activity
      lastActivityRef.current = Date.now();
      const token = localStorage.getItem('user_token');
      if (token && !heartbeatIntervalRef.current) {
        // Restart heartbeat if it was stopped - 使用 ref 引用
        if (startHeartbeatRef.current) {
          startHeartbeatRef.current();
        }
      }
    }
  }, []);

  // Start heartbeat with activity detection
  const startHeartbeat = useCallback(() => {
    // Clear any existing intervals
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (activityCheckIntervalRef.current) {
      clearInterval(activityCheckIntervalRef.current);
    }

    // Reset activity state
    lastActivityRef.current = Date.now();
    isIdleRef.current = false;

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval to send heartbeat (active interval initially)
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_CONFIG.ACTIVE_INTERVAL);

    // Set up activity status check (every 10 seconds)
    activityCheckIntervalRef.current = setInterval(checkActivityStatus, 10000);

    // Add activity event listeners
    USER_ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, updateLastActivity, { passive: true });
    });

    // Also listen for visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, [sendHeartbeat, checkActivityStatus, updateLastActivity, handleVisibilityChange]);

  // 更新 ref
  useEffect(() => {
    startHeartbeatRef.current = startHeartbeat;
  }, [startHeartbeat]);

  // 完整的 stopHeartbeat（包含清理事件监听器）
  const fullStopHeartbeat = useCallback(() => {
    stopHeartbeat();
    
    // Remove activity event listeners
    USER_ACTIVITY_EVENTS.forEach(event => {
      window.removeEventListener(event, updateLastActivity);
    });
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopHeartbeat, updateLastActivity, handleVisibilityChange]);

  useEffect(() => {
    const initializeAuth = async () => {
    // Check for existing token on mount
    const token = localStorage.getItem('user_token');
    const userData = localStorage.getItem('user_data');

    if (token && userData && userData !== 'undefined') {
      try {
        setIsAuthenticated(true);
        setUser(JSON.parse(userData));
        startHeartbeat(); // Start heartbeat for existing session
          
          // 立即获取最新的用户信息和订阅信息
          try {
            const [profileResponse, subscriptionResponse] = await Promise.all([
              userAPI.getProfile(),
              subscriptionAPI.getMySubscription().catch(err => {
                console.error('Failed to fetch subscription:', err);
                return null;
              })
            ]);

            if (profileResponse.data.code === 0 && profileResponse.data.data) {
              const freshUserData = profileResponse.data.data;
              
              // 如果成功获取订阅信息，将其添加到用户数据中
              if (subscriptionResponse && subscriptionResponse.data.code === 0) {
                freshUserData.subscription = subscriptionResponse.data.data;
              }
              
              localStorage.setItem('user_data', JSON.stringify(freshUserData));
              setUser(freshUserData);
            }
          } catch (error) {
            console.error('Failed to refresh user data on init:', error);
          }
      } catch (error) {
        // Clear invalid data
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
      }
    }
    setLoading(false);
    };

    initializeAuth();

    // Listen for auth expiration events
    const handleAuthExpired = (event) => {
      // Stop heartbeat and clear state
      fullStopHeartbeat();
      setIsAuthenticated(false);
      setUser(null);

      // 静默处理，不显示 alert 弹窗
      // API 拦截器已经处理了重定向到首页
      console.log('Auth expired:', event.detail?.message || '登录已失效');
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    // Cleanup on unmount
    return () => {
      fullStopHeartbeat();
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (token, userData) => {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
    startHeartbeat(); // Start heartbeat when user logs in
    
    // 登录后立即获取订阅信息
    try {
      const subscriptionResponse = await subscriptionAPI.getMySubscription();
      if (subscriptionResponse.data.code === 0) {
        const updatedUserData = { ...userData, subscription: subscriptionResponse.data.data };
        localStorage.setItem('user_data', JSON.stringify(updatedUserData));
        setUser(updatedUserData);
      }
    } catch (error) {
      console.error('Failed to fetch subscription after login:', error);
    }
  };

  const logout = async () => {
    // Stop heartbeat first
    fullStopHeartbeat();

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
      // 同时获取用户信息和订阅信息
      const [profileResponse, subscriptionResponse] = await Promise.all([
        userAPI.getProfile(),
        subscriptionAPI.getMySubscription().catch(err => {
          console.error('Failed to fetch subscription:', err);
          return null;
        })
      ]);

      if (profileResponse.data.code === 0 && profileResponse.data.data) {
        const userData = profileResponse.data.data;
        
        // 如果成功获取订阅信息，将其添加到用户数据中
        if (subscriptionResponse && subscriptionResponse.data.code === 0) {
          userData.subscription = subscriptionResponse.data.data;
        }
        
        updateUser(userData);
        return userData;
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

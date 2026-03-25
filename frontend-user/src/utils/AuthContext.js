/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { userAPI } from '../services/api';
import { adminAPI } from '../services/adminApi';
import wsClient from '../services/websocket';
import logger from './logger';

const AuthContext = createContext(null);

// Token 刷新配置
const TOKEN_REFRESH_CONFIG = {
  CHECK_INTERVAL: 300000,      // 每5分钟检查一次 Token 状态
  REFRESH_THRESHOLD: 7200,     // Token 过期前 2 小时（7200秒）开始刷新
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Token 刷新相关的 refs
  const tokenRefreshIntervalRef = useRef(null);
  const isRefreshingTokenRef = useRef(false);
  
  // 使用 ref 存储函数引用，避免循环依赖
  const startSessionRef = useRef(null);

  // Token 刷新函数
  const refreshToken = useCallback(async () => {
    const token = localStorage.getItem('user_token');
    if (!token || isRefreshingTokenRef.current) {
      return false;
    }

    isRefreshingTokenRef.current = true;
    try {
      const response = await userAPI.refreshToken();
      if (response.data.code === 0 && response.data.data?.token) {
        const newToken = response.data.data.token;
        localStorage.setItem('user_token', newToken);
        logger.log('[Token] Token refreshed successfully');
        
        // Token 刷新后，重新连接 WebSocket
        wsClient.disconnect();
        wsClient.connect(newToken);
        
        return true;
      }
    } catch (error) {
      // 如果是 2016 错误码（会话过期），需要重新登录
      if (error.response?.data?.code === 2016) {
        logger.log('[Token] Session expired, need to re-login');
        // 触发登出
        window.dispatchEvent(new CustomEvent('auth:expired', {
          detail: { message: '登录已过期，请重新登录' }
        }));
      } else if (error.response?.status !== 401) {
        logger.error('[Token] Refresh error:', error);
      }
      return false;
    } finally {
      isRefreshingTokenRef.current = false;
    }
    return false;
  }, []);

  // 检查并刷新 Token
  const checkAndRefreshToken = useCallback(async () => {
    const token = localStorage.getItem('user_token');
    if (!token) return;

    try {
      const response = await userAPI.getTokenInfo();
      if (response.data.code === 0 && response.data.data) {
        const { remaining_seconds, should_refresh, can_refresh } = response.data.data;
        
        // 如果需要刷新且可以刷新
        if (should_refresh && can_refresh) {
          logger.log(`[Token] Token expires in ${remaining_seconds}s, refreshing...`);
          await refreshToken();
        } else if (!can_refresh) {
          logger.log('[Token] Session cannot be refreshed (30 days limit reached)');
        }
      }
    } catch (error) {
      // 忽略错误，让其他机制处理
      if (error.response?.status !== 401) {
        logger.error('[Token] Check token info error:', error);
      }
    }
  }, [refreshToken]);

  // 启动 Token 刷新检查
  const startTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
    }

    // 立即检查一次
    checkAndRefreshToken();

    // 每5分钟检查一次
    tokenRefreshIntervalRef.current = setInterval(checkAndRefreshToken, TOKEN_REFRESH_CONFIG.CHECK_INTERVAL);
  }, [checkAndRefreshToken]);

  // 停止 Token 刷新检查
  const stopTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
  }, []);

  // Handle page visibility change
  // 当用户离开当前页面（切换标签页/最小化窗口）时，断开 WebSocket
  // 当用户回到页面时，重新连接 WebSocket
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // 页面变为可见，重新连接 WebSocket
      if (!wsClient.getStatus().isConnected && !wsClient.getStatus().isConnecting) {
        const token = localStorage.getItem('user_token');
        logger.log('[Session] Page visible, reconnecting WebSocket as', token ? 'user' : 'guest');
        wsClient.connect(token || null);
      }
    } else {
      // 页面变为隐藏（用户切换到其他标签页/窗口），断开 WebSocket
      logger.log('[Session] Page hidden, disconnecting WebSocket');
      wsClient.disconnect(false); // 不阻止重连，允许页面恢复时重连
    }
  }, []);

  // Start session management (WebSocket + Token refresh)
  // Admin users skip session management (no SSO, no WebSocket needed)
  const startSession = useCallback(() => {
    const userData = localStorage.getItem('user_data');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed?.role === 'admin') {
          logger.log('[Session] Admin user, skipping session management');
          return;
        }
      } catch (e) { /* ignore parse errors */ }
    }

    startTokenRefresh();

    const token = localStorage.getItem('user_token');
    wsClient.connect(token || null);

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, [startTokenRefresh, handleVisibilityChange]);

  // 启动访客 WebSocket 连接（未登录用户）
  const startGuestSession = useCallback(() => {
    // 建立访客 WebSocket 连接
    if (!wsClient.getStatus().isConnected && !wsClient.getStatus().isConnecting) {
      wsClient.connect(null);
    }
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);

  // 更新 ref
  useEffect(() => {
    startSessionRef.current = startSession;
  }, [startSession]);

  // Stop session management (登出时调用)
  const stopSession = useCallback(() => {
    stopTokenRefresh();
    
    // 断开当前 WebSocket 连接，然后重新建立访客连接
    wsClient.disconnect();
    // 短暂延迟后建立访客连接
    setTimeout(() => {
      wsClient.connect(null);
    }, 100);
  }, [stopTokenRefresh]);

  useEffect(() => {
    const initializeAuth = async () => {
      // Check for existing token on mount
      const token = localStorage.getItem('user_token');
      const userData = localStorage.getItem('user_data');

      if (token && userData && userData !== 'undefined') {
        try {
          const parsedUser = JSON.parse(userData);
          setIsAuthenticated(true);
          setUser(parsedUser);
          
          const isAdmin = parsedUser?.role === 'admin';
          
          try {
            // Use admin API for admin tokens, user API for user tokens
            const profileResponse = isAdmin
              ? await adminAPI.getProfile()
              : await userAPI.getProfile();

            if (profileResponse.data.code === 0 && profileResponse.data.data) {
              const freshUserData = profileResponse.data.data;
              // Preserve the role field for admin users
              if (isAdmin && !freshUserData.role) {
                freshUserData.role = 'admin';
              }
              
              localStorage.setItem('user_data', JSON.stringify(freshUserData));
              setUser(freshUserData);
              
              startSession();
            } else {
              logger.log('Profile API returned error, clearing auth state');
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              setIsAuthenticated(false);
              setUser(null);
              startGuestSession();
            }
          } catch (error) {
            logger.error('Failed to refresh user data on init:', error);
            if (error.response?.status === 401) {
              logger.log('Auth failed (401), clearing auth state');
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              setIsAuthenticated(false);
              setUser(null);
              startGuestSession();
            } else {
              startSession();
            }
          }
        } catch (error) {
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_data');
          setIsAuthenticated(false);
          setUser(null);
          startGuestSession();
        }
      } else {
        // 未登录用户，启动访客 WebSocket 连接
        startGuestSession();
      }
      setLoading(false);
    };

    initializeAuth();

    // Listen for auth expiration events
    const handleAuthExpired = (event) => {
      // Stop session and clear state
      stopSession();
      setIsAuthenticated(false);
      setUser(null);

      const message = event.detail?.message || '登录已失效';
      const reason = event.detail?.reason || 'expired';
      
      logger.log('Auth expired:', message, 'reason:', reason);
      
      // 如果是被踢出，显示提示信息
      if (reason === 'kicked') {
        // 使用 sessionStorage 存储消息，在首页显示
        sessionStorage.setItem('auth_kicked_message', message);
      }
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    // Cleanup on unmount
    return () => {
      stopSession();
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (token, userData) => {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
    startSession(); // Start session management when user logs in
    
  };

  const logout = async () => {
    stopSession();

    // Only call user logout API for regular users (admin has no session)
    const isAdmin = user?.role === 'admin';
    if (!isAdmin) {
      try {
        await userAPI.logout();
      } catch (error) {
        logger.error('Logout API call failed:', error);
      }
    }

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

  // Refresh user data from backend (role-aware: admin vs user API)
  const refreshUser = async () => {
    try {
      const isAdmin = user?.role === 'admin';
      const profileResponse = isAdmin
        ? await adminAPI.getProfile()
        : await userAPI.getProfile();

      if (profileResponse.data.code === 0 && profileResponse.data.data) {
        const freshData = profileResponse.data.data;
        if (isAdmin && !freshData.role) {
          freshData.role = 'admin';
        }
        updateUser(freshData);
        return freshData;
      }
    } catch (error) {
      logger.error('Failed to refresh user data:', error);
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

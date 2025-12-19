/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { userAPI, subscriptionAPI } from '../services/api';
import logger from './logger';

const AuthContext = createContext(null);

// 配置常量
const HEARTBEAT_CONFIG = {
  ACTIVE_INTERVAL: 30000,      // 活跃状态下的心跳间隔：30秒
  IDLE_INTERVAL: 120000,       // 空闲状态下的心跳间隔：2分钟
  IDLE_TIMEOUT: 60000,         // 空闲超时时间：1分钟无操作视为空闲
  INACTIVE_TIMEOUT: 300000,    // 不活跃超时时间：5分钟无操作停止心跳
};

// Token 刷新配置
const TOKEN_REFRESH_CONFIG = {
  CHECK_INTERVAL: 300000,      // 每5分钟检查一次 Token 状态
  REFRESH_THRESHOLD: 7200,     // Token 过期前 2 小时（7200秒）开始刷新
};

// 需要监听的用户活动事件
// 注意：
// - 移除了 mousemove，因为它会非常频繁触发，即使鼠标微小抖动也会触发
// - 移除了 focus，因为窗口获得焦点时会触发，即使用户没有真正操作页面内容
// 只保留真正的用户交互事件
const USER_ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
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
  
  // Token 刷新相关的 refs
  const tokenRefreshIntervalRef = useRef(null);
  const isRefreshingTokenRef = useRef(false);
  
  // 使用 ref 存储函数引用，避免循环依赖
  const startHeartbeatRef = useRef(null);

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

    // 每分钟检查一次
    tokenRefreshIntervalRef.current = setInterval(checkAndRefreshToken, TOKEN_REFRESH_CONFIG.CHECK_INTERVAL);
  }, [checkAndRefreshToken]);

  // 停止 Token 刷新检查
  const stopTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
  }, []);

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
        logger.error('Heartbeat error:', error);
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
    
    const token = localStorage.getItem('user_token');
    if (!token) return;
    
    // 如果心跳已经完全停止（5分钟无操作后），需要重新启动
    if (!heartbeatIntervalRef.current) {
      // 使用 startHeartbeatRef 重新启动完整的心跳机制
      if (startHeartbeatRef.current) {
        startHeartbeatRef.current();
      }
      return;
    }
    
    // 如果之前是空闲状态，现在变为活跃
    if (isIdleRef.current) {
      isIdleRef.current = false;
      // 立即发送一次心跳，然后重新设置活跃间隔
      sendHeartbeat();
      restartHeartbeatWithInterval(HEARTBEAT_CONFIG.ACTIVE_INTERVAL);
    }
  }, [sendHeartbeat, restartHeartbeatWithInterval]);

  // Handle page visibility change
  // 当用户离开当前页面（切换标签页/最小化窗口）时，立即停止心跳
  // 当用户回到页面时，重新启动心跳
  const handleVisibilityChange = useCallback(() => {
    const token = localStorage.getItem('user_token');
    if (!token) return;

    if (document.visibilityState === 'visible') {
      // 页面变为可见，重新启动心跳
      lastActivityRef.current = Date.now();
      if (!heartbeatIntervalRef.current) {
        if (startHeartbeatRef.current) {
          startHeartbeatRef.current();
        }
      }
    } else {
      // 页面变为隐藏（用户切换到其他标签页/窗口），立即停止心跳
      stopHeartbeat();
    }
  }, [stopHeartbeat]);

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

    // 同时启动 Token 刷新检查
    startTokenRefresh();
  }, [sendHeartbeat, checkActivityStatus, updateLastActivity, handleVisibilityChange, startTokenRefresh]);

  // 更新 ref
  useEffect(() => {
    startHeartbeatRef.current = startHeartbeat;
  }, [startHeartbeat]);

  // 完整的 stopHeartbeat（包含清理事件监听器）
  const fullStopHeartbeat = useCallback(() => {
    stopHeartbeat();
    stopTokenRefresh();
    
    // Remove activity event listeners
    USER_ACTIVITY_EVENTS.forEach(event => {
      window.removeEventListener(event, updateLastActivity);
    });
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopHeartbeat, stopTokenRefresh, updateLastActivity, handleVisibilityChange]);

  useEffect(() => {
    const initializeAuth = async () => {
      // Check for existing token on mount
      const token = localStorage.getItem('user_token');
      const userData = localStorage.getItem('user_data');

      if (token && userData && userData !== 'undefined') {
        try {
          // 先设置本地缓存的用户数据，让页面能快速显示
          setIsAuthenticated(true);
          setUser(JSON.parse(userData));
          
          // 立即获取最新的用户信息和订阅信息
          // 如果 Token 已过期，API 拦截器会自动尝试刷新
          try {
            const [profileResponse, subscriptionResponse] = await Promise.all([
              userAPI.getProfile(),
              subscriptionAPI.getMySubscription().catch(err => {
                logger.error('Failed to fetch subscription:', err);
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
              
              // 验证成功后启动心跳（Token 可能已被刷新）
              startHeartbeat();
            } else {
              // API 返回成功但业务失败，清除登录状态
              logger.log('Profile API returned error, clearing auth state');
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              setIsAuthenticated(false);
              setUser(null);
            }
          } catch (error) {
            // 如果获取用户信息失败（包括 Token 刷新失败），
            // API 拦截器会处理登出逻辑
            logger.error('Failed to refresh user data on init:', error);
            // 如果是 401 错误，清除登录状态（API 拦截器可能已经处理，但这里确保状态一致）
            if (error.response?.status === 401) {
              logger.log('Auth failed (401), clearing auth state');
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              setIsAuthenticated(false);
              setUser(null);
            } else {
              // 其他错误（如网络问题），仍然保持登录状态
              startHeartbeat();
            }
          }
        } catch (error) {
          // Clear invalid data
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_data');
          setIsAuthenticated(false);
          setUser(null);
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
      logger.error('Failed to fetch subscription after login:', error);
    }
  };

  const logout = async () => {
    // Stop heartbeat first
    fullStopHeartbeat();

    // Call backend logout API to delete session
    try {
      await userAPI.logout();
    } catch (error) {
      logger.error('Logout API call failed:', error);
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
          logger.error('Failed to fetch subscription:', err);
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

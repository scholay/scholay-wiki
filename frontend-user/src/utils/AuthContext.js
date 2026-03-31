/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AuthProvider – lifecycle shell for auth init, token refresh & WebSocket.
 * All state lives in useAuthStore (Zustand); this Provider only drives
 * side-effects that require the React tree (init, cleanup, event listeners).
 */

import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { userAPI } from '../services/user.api';
import wsClient from '../services/websocket';
import logger from './logger';
import { useAuthStore } from '../stores/auth.store';

const AuthContext = createContext(null);

const TOKEN_REFRESH_CONFIG = {
  CHECK_INTERVAL: 300000,
  REFRESH_THRESHOLD: 7200,
};

export const AuthProvider = ({ children }) => {
  const tokenRefreshIntervalRef = useRef(null);
  const isRefreshingTokenRef = useRef(false);
  const startSessionRef = useRef(null);

  const refreshToken = useCallback(async () => {
    const token = localStorage.getItem('user_token');
    if (!token || isRefreshingTokenRef.current) return false;

    isRefreshingTokenRef.current = true;
    try {
      const response = await userAPI.refreshToken();
      if (response.data.code === 0 && response.data.data?.token) {
        const newToken = response.data.data.token;
        localStorage.setItem('user_token', newToken);
        logger.log('[Token] Token refreshed successfully');
        wsClient.disconnect();
        wsClient.connect(newToken);
        return true;
      }
    } catch (error) {
      if (error.response?.data?.code === 2016) {
        logger.log('[Token] Session expired, need to re-login');
        window.dispatchEvent(
          new CustomEvent('auth:expired', {
            detail: { message: '登录已过期，请重新登录' },
          }),
        );
      } else if (error.response?.status !== 401) {
        logger.error('[Token] Refresh error:', error);
      }
      return false;
    } finally {
      isRefreshingTokenRef.current = false;
    }
    return false;
  }, []);

  const checkAndRefreshToken = useCallback(async () => {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    try {
      const response = await userAPI.getTokenInfo();
      if (response.data.code === 0 && response.data.data) {
        const { should_refresh, can_refresh, remaining_seconds } = response.data.data;
        if (should_refresh && can_refresh) {
          logger.log(`[Token] Token expires in ${remaining_seconds}s, refreshing...`);
          await refreshToken();
        } else if (!can_refresh) {
          logger.log('[Token] Session cannot be refreshed (30 days limit reached)');
        }
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        logger.error('[Token] Check token info error:', error);
      }
    }
  }, [refreshToken]);

  const startTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
    checkAndRefreshToken();
    tokenRefreshIntervalRef.current = setInterval(
      checkAndRefreshToken,
      TOKEN_REFRESH_CONFIG.CHECK_INTERVAL,
    );
  }, [checkAndRefreshToken]);

  const stopTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
  }, []);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      if (!wsClient.getStatus().isConnected && !wsClient.getStatus().isConnecting) {
        const token = localStorage.getItem('user_token');
        logger.log('[Session] Page visible, reconnecting WebSocket as', token ? 'user' : 'guest');
        wsClient.connect(token || null);
      }
    } else {
      logger.log('[Session] Page hidden, disconnecting WebSocket');
      wsClient.disconnect(false);
    }
  }, []);

  const startSession = useCallback(() => {
    startTokenRefresh();
    const token = localStorage.getItem('user_token');
    wsClient.connect(token || null);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, [startTokenRefresh, handleVisibilityChange]);

  const startGuestSession = useCallback(() => {
    if (!wsClient.getStatus().isConnected && !wsClient.getStatus().isConnecting) {
      wsClient.connect(null);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);

  useEffect(() => {
    startSessionRef.current = startSession;
  }, [startSession]);

  const stopSession = useCallback(() => {
    stopTokenRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    wsClient.disconnect();
    setTimeout(() => wsClient.connect(null), 100);
  }, [stopTokenRefresh, handleVisibilityChange]);

  // ---------- Initialization ----------
  useEffect(() => {
    const { setAuth, clearAuth, setLoading } = useAuthStore.getState();

    const initializeAuth = async () => {
      const token = localStorage.getItem('user_token');
      const userData = localStorage.getItem('user_data');

      if (token && userData && userData !== 'undefined') {
        try {
          const cached = JSON.parse(userData);
          setAuth(cached, token);

          try {
            const profileResponse = await userAPI.getProfile();
            if (profileResponse.data.code === 0 && profileResponse.data.data) {
              const fresh = profileResponse.data.data;
              localStorage.setItem('user_data', JSON.stringify(fresh));
              useAuthStore.getState().setUser(fresh);
              startSession();
            } else {
              logger.log('Profile API returned error, clearing auth state');
              clearAuth();
              startGuestSession();
            }
          } catch (error) {
            logger.error('Failed to refresh user data on init:', error);
            if (error.response?.status === 401) {
              logger.log('Auth failed (401), clearing auth state');
              clearAuth();
              startGuestSession();
            } else {
              startSession();
            }
          }
        } catch (error) {
          clearAuth();
          startGuestSession();
        }
      } else {
        startGuestSession();
      }
      setLoading(false);
    };

    initializeAuth();

    const handleAuthExpired = (event) => {
      stopSession();
      useAuthStore.getState().clearAuth();

      const message = event.detail?.message || '登录已失效';
      const reason = event.detail?.reason || 'expired';
      logger.log('Auth expired:', message, 'reason:', reason);

      if (reason === 'kicked') {
        sessionStorage.setItem('auth_kicked_message', message);
      }
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      stopSession();
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Actions exposed via context ----------
  const login = useCallback(
    async (token, userData) => {
      useAuthStore.getState().setAuth(userData, token);
      startSession();
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    stopSession();
    try {
      await userAPI.logout();
    } catch (error) {
      logger.error('Logout API call failed:', error);
    }
    useAuthStore.getState().clearAuth();
  }, [stopSession]);

  const updateUser = useCallback((userData) => {
    useAuthStore.getState().setUser(userData);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profileResponse = await userAPI.getProfile();
      if (profileResponse.data.code === 0 && profileResponse.data.data) {
        const userData = profileResponse.data.data;
        useAuthStore.getState().setUser(userData);
        return userData;
      }
    } catch (error) {
      logger.error('Failed to refresh user data:', error);
    }
    return null;
  }, []);

  // Read state from Zustand (single source of truth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  const value = { isAuthenticated, user, login, logout, updateUser, refreshUser, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

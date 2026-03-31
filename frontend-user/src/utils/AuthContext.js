/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * Auth module – pure Zustand, no React Context.
 *
 * AuthBootstrap  – side-effect shell (token refresh, WebSocket, visibility).
 *                  Renders nothing; place as a sibling in the component tree.
 * useAuth()      – thin wrapper around useAuthStore with shallow equality,
 *                  drop-in replacement for the old Context-based hook.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { userAPI } from '../services/user.api';
import wsClient from '../services/websocket';
import logger from './logger';
import { useAuthStore, registerSessionController } from '../stores/auth.store';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TOKEN_REFRESH_CONFIG = {
  CHECK_INTERVAL: 300000,
  REFRESH_THRESHOLD: 7200,
};

// ---------------------------------------------------------------------------
// AuthBootstrap – manages side-effects only, renders null.
// ---------------------------------------------------------------------------
export const AuthBootstrap = () => {
  const tokenRefreshIntervalRef = useRef(null);
  const isRefreshingTokenRef = useRef(false);

  // ---- token refresh helpers ----
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

  // ---- visibility / WebSocket helpers ----
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

  const stopSession = useCallback(() => {
    stopTokenRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    wsClient.disconnect();
    setTimeout(() => wsClient.connect(null), 100);
  }, [stopTokenRefresh, handleVisibilityChange]);

  // ---- Register session controller so store actions can drive side-effects ----
  useEffect(() => {
    registerSessionController({ start: startSession, stop: stopSession, startGuest: startGuestSession });
    return () => registerSessionController(null);
  }, [startSession, stopSession, startGuestSession]);

  // ---- Initialization ----
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

  return null;
};

// ---------------------------------------------------------------------------
// useAuth – drop-in replacement, backed by Zustand with shallow equality.
// ---------------------------------------------------------------------------
export const useAuth = () => {
  return useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      user: s.user,
      loading: s.loading,
      login: s.login,
      logout: s.logout,
      updateUser: s.updateUser,
      refreshUser: s.refreshUser,
    })),
  );
};


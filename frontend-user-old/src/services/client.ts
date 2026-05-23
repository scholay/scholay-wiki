/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * Unified Axios client – the SINGLE authenticated HTTP instance for the app.
 * All *.api.ts modules import from this file.
 */

import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

export const API_URL: string = process.env.REACT_APP_API_URL || '';

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  // 让浏览器随请求一并发送 Cookie（审稿的设备识别依赖 HttpOnly cookie prv_device_id）
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Public (unauthenticated) instance – base path includes /public
// ---------------------------------------------------------------------------
export const publicApi: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1/public`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Auth whitelist – pages where 401/403 should NOT redirect
// ---------------------------------------------------------------------------
const AUTH_WHITELIST_PATHS = [
  '/',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/peer-review',
  '/peer-review-v2',
  '/assistant',
  '/pricing',
];

export const isInAuthWhitelist = (): boolean => {
  const currentPath = window.location.pathname;
  return AUTH_WHITELIST_PATHS.some(
    (path) => currentPath === path || currentPath.startsWith(path + '/'),
  );
};

// ---------------------------------------------------------------------------
// In-memory token cache – avoids hitting localStorage on every request.
// Updated whenever the token changes (login, refresh, logout).
// ---------------------------------------------------------------------------
let _cachedToken: string | null = localStorage.getItem('user_token');

export const tokenCache = {
  get: () => _cachedToken,
  set: (token: string | null) => {
    _cachedToken = token;
    if (token) {
      localStorage.setItem('user_token', token);
    } else {
      localStorage.removeItem('user_token');
    }
  },
  clear: () => {
    _cachedToken = null;
    localStorage.removeItem('user_token');
  },
};

// ---------------------------------------------------------------------------
// Request interceptor – attach Bearer token (from memory cache)
// ---------------------------------------------------------------------------
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenCache.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Token-refresh queue (prevents parallel refresh requests)
// ---------------------------------------------------------------------------
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// ---------------------------------------------------------------------------
// Response interceptor – handle business errors, 401 refresh, 403
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.code;

    // ---- Session kicked (code 2019, HTTP 409) ----
    if (errorCode === 2019) {
      tokenCache.clear();
      localStorage.removeItem('user_data');
      window.dispatchEvent(
        new CustomEvent('auth:expired', {
          detail: {
            message: error.response?.data?.message || '您的账号已在其他设备登录',
            reason: 'kicked',
          },
        }),
      );
      if (!isInAuthWhitelist()) {
        window.location.href = '/';
      }
      return Promise.reject(error);
    }

    // ---- 401: try to refresh token ----
    if (error.response?.status === 401 && !originalRequest._retry) {
      const token = tokenCache.get();

      // 审稿模块支持匿名访问：匿名用户遇到 401 直接 reject，不走 refresh / 不弹登录框
      // 由业务代码决定是显示"登录继续"提示还是其他交互
      const requestUrl = originalRequest?.url || '';
      if (
        !token &&
        (requestUrl.includes('/peer-review/') || requestUrl.includes('/peer-review2/'))
      ) {
        return Promise.reject(error);
      }

      if (!token && isInAuthWhitelist()) {
        return Promise.reject(error);
      }

      if (originalRequest.url === '/user/refresh-token') {
        tokenCache.clear();
        localStorage.removeItem('user_data');
        window.dispatchEvent(
          new CustomEvent('auth:expired', {
            detail: { message: '登录已失效，请重新登录' },
          }),
        );
        if (!isInAuthWhitelist()) {
          window.location.href = '/';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post('/user/refresh-token');
        if (response.data.code === 0 && response.data.data?.token) {
          const newToken = response.data.data.token;
          tokenCache.set(newToken);
          api.defaults.headers.common['Authorization'] = 'Bearer ' + newToken;
          processQueue(null, newToken);
          originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
          return api(originalRequest);
        }
        throw new Error(response.data.message || '刷新登录状态失败');
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        tokenCache.clear();
        localStorage.removeItem('user_data');

        const errorCode = refreshError.response?.data?.code;
        const errorMessage =
          refreshError.response?.data?.message || refreshError.message;
        let message = '登录已失效，请重新登录';
        let reason = 'expired';

        if (errorCode === 2019) {
          message = errorMessage || '您的账号已在其他设备登录';
          reason = 'kicked';
        } else if (errorCode === 2016) {
          message = '登录已过期，请重新登录';
          reason = 'session_expired';
        }

        window.dispatchEvent(
          new CustomEvent('auth:expired', { detail: { message, reason } }),
        );
        if (!isInAuthWhitelist()) {
          window.location.href = '/';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ---- 403: forbidden ----
    if (error.response?.status === 403) {
      tokenCache.clear();
      localStorage.removeItem('user_data');
      const message =
        error.response?.data?.message || '访问被拒绝，请重新登录';
      window.dispatchEvent(
        new CustomEvent('auth:expired', { detail: { message } }),
      );
      if (!isInAuthWhitelist()) {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  },
);

export default api;

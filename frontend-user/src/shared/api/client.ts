/**
 * HTTP Client — Axios 实例 + 拦截器
 *
 * 统一的底层传输层，供 features/ 下所有 API 模块使用。
 * 职责：请求认证、Token 刷新队列、错误码映射。
 *
 * 提供三个客户端：
 *   httpClient       — 用户端已认证请求 (/api/v1)
 *   adminHttpClient  — 管理端已认证请求 (/api/v1，共享 token 刷新队列)
 *   publicHttpClient — 公共请求，无需认证 (/api/v1/public)
 */

import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosError,
  AxiosResponse,
} from 'axios';
import { classifyError } from './errorHandler';
import type { ApiError } from '../types/api';

export const API_URL = import.meta.env.VITE_API_URL || '';

/* ----------------------------------------------------------------
 * Token 刷新队列（httpClient 与 adminHttpClient 共享）
 * ---------------------------------------------------------------- */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

/* ----------------------------------------------------------------
 * Auth 白名单：未登录用户可访问的前端路径
 * ---------------------------------------------------------------- */

const AUTH_WHITELIST_PATHS = [
  '/',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/peer-review',
  '/assistant',
];

export const isInAuthWhitelist = (): boolean => {
  const currentPath = window.location.pathname;
  return AUTH_WHITELIST_PATHS.some(
    (path) => currentPath === path || currentPath.startsWith(path + '/')
  );
};

/* ----------------------------------------------------------------
 * 清除本地认证信息并派发事件
 * ---------------------------------------------------------------- */

function clearAuthAndDispatch(
  message: string,
  reason: string = 'expired',
  redirect: boolean = true
) {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_data');
  window.dispatchEvent(
    new CustomEvent('auth:expired', { detail: { message, reason } })
  );
  if (redirect && !isInAuthWhitelist()) {
    window.location.href = '/';
  }
}

/* ----------------------------------------------------------------
 * 请求拦截器（共用）
 * ---------------------------------------------------------------- */

function attachAuthToken(config: InternalAxiosRequestConfig) {
  const token = localStorage.getItem('user_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

/* ----------------------------------------------------------------
 * 响应成功拦截器：检测业务级踢线码 2019
 * ---------------------------------------------------------------- */

function handleSuccessResponse(response: AxiosResponse) {
  if (response.data?.code === 2019) {
    clearAuthAndDispatch(
      response.data?.message || '您的账号已在其他设备登录',
      'kicked'
    );
    return Promise.reject(
      new Error(response.data?.message || '您的账号已在其他设备登录')
    );
  }
  return response;
}

/* ----------------------------------------------------------------
 * 响应错误拦截器：401 自动刷新 + classifyError 分类
 * ---------------------------------------------------------------- */

function createErrorInterceptor(client: AxiosInstance) {
  return async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401: Token 过期 -> 尝试刷新
    if (error.response?.status === 401 && !originalRequest._retry) {
      const token = localStorage.getItem('user_token');
      if (!token && isInAuthWhitelist()) {
        return Promise.reject(error);
      }

      if (originalRequest.url === '/user/refresh-token') {
        clearAuthAndDispatch('登录已失效，请重新登录');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
            return client(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await httpClient.post('/user/refresh-token');
        if (response.data.code === 0 && response.data.data?.token) {
          const newToken = response.data.data.token;
          localStorage.setItem('user_token', newToken);
          httpClient.defaults.headers.common['Authorization'] =
            'Bearer ' + newToken;
          adminHttpClient.defaults.headers.common['Authorization'] =
            'Bearer ' + newToken;
          processQueue(null, newToken);
          originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
          return client(originalRequest);
        } else {
          throw new Error(response.data.message || '刷新登录状态失败');
        }
      } catch (refreshError: any) {
        processQueue(refreshError, null);

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

        clearAuthAndDispatch(message, reason);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 403: 权限不足
    if (error.response?.status === 403) {
      const message =
        (error.response?.data as any)?.message || '访问被拒绝，请重新登录';
      clearAuthAndDispatch(message, 'forbidden');
    }

    // 使用 classifyError 将错误分类并附加到 error 对象
    const classified: ApiError = classifyError(error);
    (error as any)._classified = classified;

    return Promise.reject(error);
  };
}

/* ================================================================
 * 客户端实例
 * ================================================================ */

/**
 * 用户端已认证客户端
 */
export const httpClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * 管理端已认证客户端（共享 token 刷新队列）
 */
export const adminHttpClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * 公共客户端（无需认证）
 */
export const publicHttpClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1/public`,
  headers: { 'Content-Type': 'application/json' },
});

// 挂载拦截器
[httpClient, adminHttpClient].forEach((client) => {
  client.interceptors.request.use(attachAuthToken, (e) => Promise.reject(e));
  client.interceptors.response.use(
    handleSuccessResponse,
    createErrorInterceptor(client)
  );
});

export default httpClient;

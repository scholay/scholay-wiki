/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * apiClient - Axios 实例和拦截器配置
 */

import axios from 'axios';

// API 基础 URL
const API_URL = process.env.REACT_APP_API_URL || '';

// 创建主 API 实例（需要认证）
const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 创建公共 API 实例（不需要认证）
const publicApi = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token 刷新状态
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 允许未登录访问的页面路径白名单
const AUTH_WHITELIST_PATHS = [
  '/',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/peer-review',
  '/assistant',
  '/pricing',
];

// 检查当前页面是否在白名单中
const isInAuthWhitelist = () => {
  const currentPath = window.location.pathname;
  return AUTH_WHITELIST_PATHS.some(path => currentPath === path || currentPath.startsWith(path + '/'));
};

// Request interceptor - 添加认证 Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('user_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - 处理错误和 Token 刷新
api.interceptors.response.use(
  (response) => {
    // 检查业务错误码 2019 = 被其他设备登录踢出
    if (response.data?.code === 2019) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { 
          message: response.data?.message || '您的账号已在其他设备登录',
          reason: 'kicked'
        }
      }));
      if (!isInAuthWhitelist()) {
        window.location.href = '/';
      }
      return Promise.reject(new Error(response.data?.message || '您的账号已在其他设备登录'));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 处理 401 错误 - 尝试刷新 Token
    if (error.response?.status === 401 && !originalRequest._retry) {
      const token = localStorage.getItem('user_token');
      if (!token && isInAuthWhitelist()) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(newToken => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await api.post('/user/refresh-token');
        if (refreshResponse.data?.code === 0 && refreshResponse.data?.data?.token) {
          const newToken = refreshResponse.data.data.token;
          localStorage.setItem('user_token', newToken);
          api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          throw new Error('Token refresh failed');
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
        window.dispatchEvent(new CustomEvent('auth:expired', {
          detail: { 
            message: '登录已过期，请重新登录',
            reason: 'expired'
          }
        }));
        if (!isInAuthWhitelist()) {
          window.dispatchEvent(new CustomEvent('auth:required'));
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 处理 403 错误
    if (error.response?.status === 403) {
      if (!isInAuthWhitelist()) {
        window.dispatchEvent(new CustomEvent('auth:required'));
      }
    }

    return Promise.reject(error);
  }
);

export { api, publicApi, isInAuthWhitelist };
export default api;


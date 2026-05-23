import axios, { AxiosError, type AxiosInstance } from 'axios';

/**
 * HTTP 客户端 — 走 nginx 反代,生产同源相对路径,开发走 vite proxy。
 * 401/403 留给上层 store 处理,这里只统一报错抽取。
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiError {
  status: number;
  code?: string;
  message: string;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof AxiosError) {
    return {
      status: err.response?.status ?? 0,
      code: err.response?.data?.code,
      message:
        err.response?.data?.message ?? err.message ?? '网络异常,请稍后重试',
    };
  }
  return { status: 0, message: err instanceof Error ? err.message : '未知错误' };
}

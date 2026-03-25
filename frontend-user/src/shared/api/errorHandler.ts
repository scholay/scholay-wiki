/**
 * 统一错误处理 — 策略模式
 *
 * 按错误类型分发到不同处理策略，避免在业务组件中散落 try/catch 逻辑。
 */

import type { ApiError, ApiErrorType } from '../types/api';

type ErrorStrategy = (error: ApiError) => void;

const strategies: Record<ApiErrorType, ErrorStrategy> = {
  AUTH_EXPIRED: () => {
    /* 由 httpClient 拦截器自动处理 */
  },
  AUTH_KICKED: () => {
    /* 由 httpClient 拦截器自动处理 */
  },
  NETWORK: () => {
    showToast('网络连接失败，请检查网络设置', 'error');
  },
  TIMEOUT: () => {
    showToast('请求超时，请稍后重试', 'error');
  },
  QUOTA: () => {
    showToast('使用配额已用完，请升级订阅', 'warning');
  },
  VALIDATION: () => {
    /* 由表单组件自行处理 */
  },
  NOT_FOUND: () => {
    showToast('请求的资源不存在', 'error');
  },
  SERVER: () => {
    showToast('服务器内部错误，请稍后重试', 'error');
  },
  UNKNOWN: (err) => {
    showToast(err.message || '操作失败，请重试', 'error');
  },
};

function showToast(message: string, type: 'error' | 'warning' | 'info') {
  window.dispatchEvent(
    new CustomEvent('app:toast', { detail: { message, type } })
  );
}

/**
 * 将 Axios / fetch 错误分类为 ApiError
 */
export function classifyError(error: any): ApiError {
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return { type: 'TIMEOUT', message: '请求超时' };
    }
    return { type: 'NETWORK', message: '网络连接失败' };
  }

  const status = error.response.status;
  const data = error.response.data;
  const code = data?.code;
  const message = data?.message || error.message || '未知错误';

  if (status === 401) return { type: 'AUTH_EXPIRED', code, message, status };
  if (status === 403) return { type: 'AUTH_EXPIRED', code, message, status };
  if (code === 2019)  return { type: 'AUTH_KICKED', code, message, status };
  if (status === 404) return { type: 'NOT_FOUND', code, message, status };
  if (status === 422) return { type: 'VALIDATION', code, message, status };
  if (status === 429) return { type: 'QUOTA', code, message, status };
  if (status >= 500)  return { type: 'SERVER', code, message, status };

  return { type: 'UNKNOWN', code, message, status, raw: error };
}

/**
 * 统一处理 API 错误
 */
export function handleApiError(error: any): ApiError {
  const classified = error.type ? error : classifyError(error);
  const strategy = strategies[classified.type] || strategies.UNKNOWN;
  strategy(classified);
  return classified;
}

export default handleApiError;

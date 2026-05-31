import axios, { AxiosError, type AxiosInstance } from 'axios';
import { clearAuthToken, getAuthToken } from '@/shared/lib/auth-token';

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
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 全局 401 / token revoke 拦截 —— 任何 endpoint 返回这两种业务码时, 立刻清掉本地 token
// 并广播一次 "auth-evicted" 自定义事件; 上层 (AuthBootstrap / Layout) 监听后跳登录页 / 弹 banner。
//
// 不在 toApiError 里做这件事是因为有的 endpoint (e.g. useProfile 探活) 拿到 401 之后还想自己
// 处理 (避免 cascading toast); 全局副作用只放清 token 这一个不可逆操作。
http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const apiErr = toApiError(err);
    if (
      apiErr.code === BizCode.TokenRevoked ||
      apiErr.code === BizCode.TokenExpired ||
      (apiErr.status === 401 && !apiErr.code) // 兼容老 endpoint 没下发 code 的情况
    ) {
      // 清真源(localStorage + cookie);store 镜像由 AuthBootstrap 的 'auth-evicted' 监听调 clear() 收口。
      clearAuthToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('auth-evicted', {
            detail: { code: apiErr.code, message: apiErr.message },
          }),
        );
      }
    }
    return Promise.reject(err);
  },
);

/**
 * 业务错误码 —— 跟 backend `internal/common/errcode/codes.go` 对齐.
 *
 * 前端用这套常量做"不同 code 走不同 UI"的判断:
 *   - TokenRevoked / TokenExpired → 清 localStorage + 跳登录页
 *   - SessionTakenByOtherLogin → banner 提示"已在别处登录"
 *   - AgentUnreachable → 错误页提示"AI 服务暂时不可用"
 *   - PaymentRequired → 弹付费引导
 *
 * 加新码时同步更新 backend 端。
 */
export const BizCode = {
  // ---- 鉴权 (HTTP 协议级) ----
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  TooManyRequests: 429,
  InternalServerError: 500,

  // ---- 鉴权细分 (2xxx) ----
  /** JWT 被加入 blacklist (改密 / 单端登出 / 封号), 前端应立刻清 token 跳登录。 */
  TokenRevoked: 2030,
  /** Token 自然过期, 提示"登录已过期, 请重新登录"。 */
  TokenExpired: 2031,
  /** 同账号在别处登录, 当前 token 被踢, 走 banner 不是直接跳转。 */
  SessionTakenByOtherLogin: 2019,

  // ---- 平台横切 ----
  TurnstileFailed: 4001,
  PaymentRequired: 4020,

  // ---- Agent / AI ----
  AgentUnreachable: 6001,
  AgentQuotaExceeded: 6010,
  AgentSessionExpired: 6020,

  // ---- 上传 / 存储 ----
  UploadTooLarge: 7001,
  UploadInvalidType: 7002,
  UploadStorageFailed: 7003,
} as const;

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode];

export interface ApiError {
  /** HTTP status (0 表示 axios 本身错, 比如断网). */
  status: number;
  /**
   * 业务码. backend 在所有 Response 里都填这个字段。
   * 前端遇到没下发 code 的旧 endpoint 时是 undefined → 视为通用错误处理。
   */
  code?: number;
  /** 后端给的用户可读 message (zh). */
  message: string;
  /** 是否网络错 (axios 自身错 / 离线 / DNS 失败), 跟"后端返了 5xx" 区分开。 */
  isNetworkError: boolean;
}

/** 把任何错误归一成 ApiError. http error message 优先用后端 message, 兜底 axios message。 */
export function toApiError(err: unknown): ApiError {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 0;
    // axios 在请求发不出去 / response 完全没收到时 status = 0; ECONNABORTED / ENOTFOUND 也算
    const isNetworkError =
      status === 0 ||
      err.code === 'ECONNABORTED' ||
      err.code === 'ERR_NETWORK' ||
      err.code === 'ENOTFOUND';

    // 优先级: backend.message > axios 自带 message > 兜底文案
    let message = err.response?.data?.message;
    if (!message) {
      if (isNetworkError) {
        message = '网络连接失败,请检查网络后重试';
      } else if (status >= 500) {
        message = '服务器繁忙,请稍后重试';
      } else {
        message = err.message || '请求失败,请重试';
      }
    }

    // backend code 可能是 number 也可能是 string (历史遗留), 统一成 number
    const rawCode = err.response?.data?.code;
    const code = typeof rawCode === 'number' ? rawCode : Number(rawCode) || undefined;

    return { status, code, message, isNetworkError };
  }
  // 非 axios 错 (业务层 throw, 校验失败等)
  return {
    status: 0,
    message: err instanceof Error ? err.message : '未知错误',
    isNetworkError: false,
  };
}

/** 便捷判断: 这个错是不是要求"立刻把用户踢回登录页"。 */
export function isAuthError(err: ApiError): boolean {
  return (
    err.code === BizCode.TokenRevoked ||
    err.code === BizCode.TokenExpired ||
    err.status === BizCode.Unauthorized
  );
}

/** 便捷判断: 这个错是"被另一端登录顶掉了", 应该走 banner 而不是直接跳转。 */
export function isSessionTakenError(err: ApiError): boolean {
  return err.code === BizCode.SessionTakenByOtherLogin;
}

import axios, { AxiosError, type AxiosInstance } from 'axios';
import { getAuthToken, notifyAuthLost } from '@/shared/lib/auth-token';
import { getAnonId } from '@/shared/lib/anon-id';
import { notifyQuotaExceeded, isQuotaSignal, AGENT_QUOTA_HTTP_CODE } from '@/shared/lib/quota-events';

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
  // 匿名访客标识 —— 让后端"使用统计"对未登录用户也能按 anon_id 去重计人。
  config.headers['X-Anon-Id'] = getAnonId();
  // 文件下载(blob/arraybuffer)豁免 30s API 超时(性能审计):30s 是「API 语义超时」,套到大文件/慢网下载
  // (zip/docx/pdf/导出)会把传输中途掐成坏文件。这里一处收口,覆盖全部现存+未来下载站点(此前需每站点手补)。
  // timeout=0=不限时,传输预算由后端 object-serve(APITimeoutMiddleware 10min)+ nginx 长流 location 兜底;
  // 调用方仍可显式传 timeout 覆盖。
  if (config.responseType === 'blob' || config.responseType === 'arraybuffer') {
    // 仅当未显式指定超时(默认 30s 或 undefined,取决于 axios 何时合并实例默认)才豁免;显式传的超时尊重不动。
    if (config.timeout === undefined || config.timeout === 30_000) config.timeout = 0;
  }
  return config;
});

// 全局认证失效拦截 —— 任何 endpoint 返回 401 / TokenRevoked / TokenExpired 时, 统一走
// notifyAuthLost(): 清真源 token + 广播 "auth-evicted"。由 AuthBootstrap 单点消费
// (清 store.user + 用户端弹登录框 / 管理端跳首页 + toast)。所有协议(http/WS/SSE/profile)
// 都汇聚到这一个出口, 不再各写各的、漏弹登录。
http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const apiErr = toApiError(err);
    if (isAuthError(apiErr)) {
      notifyAuthLost({ code: apiErr.code, message: apiErr.message });
    }
    // AI 额度耗尽 → 汇入全局额度通知器(弹重置弹窗)。统一谓词,与 SSE/WS 同一判断(Theme 2)。
    if (isQuotaSignal(apiErr)) {
      notifyQuotaExceeded({ message: apiErr.message });
    }
    return Promise.reject(err);
  },
);

/**
 * 业务错误码 —— 手写镜像 backend `internal/common/errcode/codes.go`(本项目无代码生成,见
 * CLAUDE.md §3.6;数值一致性由 `tests/contract/` 的 CANONICAL_BIZ_CODES 守卫)。
 * 加/改码时**三处同步**:codes.go / 这里 / tests/contract/schemas.ts。
 *
 * **已接线(真正驱动 UI 分支)**:
 *   - TokenRevoked / TokenExpired / 裸 401(且本地有 token)→ notifyAuthLost(清 token + 弹登录)
 *   - AgentQuotaExceeded(含 WS 字符串 'quota_exceeded')→ notifyQuotaExceeded(弹额度重置弹窗)
 *
 * **保留位(已定义但前端尚未据其分支,后端也未必下发)**:SessionTakenByOtherLogin /
 *   TurnstileFailed / PaymentRequired / AgentUnreachable / AgentSessionExpired / Upload* ——
 *   当前只作 message 透传,**勿假设它们已有专属 UI**。要用先接线,再从这里挪进「已接线」。
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
  // 单一真源:与 quota-events.AGENT_QUOTA_HTTP_CODE 同值(额度信号 HTTP 形态)。
  AgentQuotaExceeded: AGENT_QUOTA_HTTP_CODE,
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

/** 判定一个值是否已经是 ApiError(避免二次转换丢失 message)。 */
function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'isNetworkError' in e &&
    'message' in e &&
    'status' in e
  );
}

/** 把任何错误归一成 ApiError. http error message 优先用后端 message, 兜底 axios message。 */
export function toApiError(err: unknown): ApiError {
  // 幂等:已是 ApiError(常见于 mutation 里已 toApiError 过一次再上抛)直接返回。
  // 否则会落到下面的「非 axios 错」分支 —— ApiError 不是 AxiosError 也不是 Error 实例,
  // 二次转换会把真实 message 覆盖成「未知错误」,导致上层只能看到兜底文案(登录/注册/
  // 改密的报错全部退化成「xx失败,请检查网络」就是这个原因)。
  if (isApiError(err)) return err;
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

/**
 * 便捷判断: 这个错是不是"已登录会话失效, 要把用户踢回登录"。
 *
 * - TokenRevoked / TokenExpired: 后端明确的会话失效码, 无条件成立。
 * - 裸 401: **仅当本地确实存在 token 时**才算"会话丢失"。否则这是一次「未登录态下的
 *   登录尝试」(如 Google idtoken 校验失败→401)—— 本来就没有会话可失效, 不能触发
 *   全局登出(否则登录失败反而弹"登录已过期"+ 双 toast)。这是 defense-in-depth:
 *   后端也已把"邮箱验证码登录失败"从 2016(→401)改成 2004(→400),双保险。
 */
export function isAuthError(err: ApiError): boolean {
  if (err.code === BizCode.TokenRevoked || err.code === BizCode.TokenExpired) {
    return true;
  }
  return err.status === BizCode.Unauthorized && getAuthToken() != null;
}

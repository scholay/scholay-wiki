import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { notifyAuthSuccess } from '@/shared/lib/auth-events';
import type { AuthResponse, CodePurpose, User } from '../types';

/**
 * 所有鉴权 mutation。统一约定:
 *   - 成功后调用 handleAuthSuccess —— 写 token + 全量 invalidate 所有 query
 *   - 失败 throw ApiError(由 toApiError 转换),组件用 onError 决定 toast 文案
 *
 * **登录后全局刷新**:`invalidateQueries()` 不带 key,所有 query 一次性失效。
 * 这样未登录态拉到的"匿名空数据"会立即被新会话下的真实数据替换 ——
 * 文件夹、订阅、配额、连接列表、UI 上一切受登录态影响的服务端数据都会重 fetch。
 */

export function handleAuthSuccess(qc: QueryClient, data: AuthResponse) {
  useAuthStore.getState().setSession(data.token, normalizeUser(data.user));
  // Google GIS 等就地 OAuth 不会发生整页跳转，在统一成功点收起鉴权壳。
  const authDialog = useAuthDialog.getState();
  const suppressInviteFlow = authDialog.suppressInviteFlow === true;
  authDialog.close();
  // 全量失效 —— 比逐个枚举 queryKey 简单且不漏。代价是触发一次 refetch 风暴,
  // 但登录是低频事件,可以接受。
  qc.invalidateQueries();
  notifyAuthSuccess({
    isNewUser: data.is_new_user === true,
    userId: data.user.id,
    ...(suppressInviteFlow ? { suppressInviteFlow: true } : {}),
  });
}

/**
 * Apple 登录码交换 —— Apple form_post 回调后端 302 只带一次性 login_code(不再带 JWT),
 * 前端拿 code POST 换回完整 AuthResponse(mirrors backend/internal/user/apple_oauth.go AppleExchangeCode)。
 * code 一次性(GetDel)+ 90s TTL,即便落进日志也换不出第二次。
 */
export async function exchangeAppleLoginCode(code: string): Promise<AuthResponse> {
  try {
    const { data } = await http.post<{ data: AuthResponse }>('/user/apple/exchange', { code });
    return data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

function normalizeUser(raw: User): import('@/stores/auth.store').StoredUser {
  return {
    id: raw.id,
    email: raw.email ?? '',
    username: raw.username ?? undefined,
    avatar: raw.avatar_url ?? undefined,
    role: raw.role,
    // 登录响应可能不含 permissions(仅 /user/profile 返回);缺失时消费方按角色兜底。
    permissions: raw.permissions,
  };
}

// 注:checkEmailExists / checkPhoneExists 已移除 —— 对应的 /user/check-email、
// /user/check-phone 后端探针(返回 {exists})是纯账号枚举接口,前端也无消费者。
// 「该邮箱是否注册」的存在性现在只在注册提交时如实反馈(无法避免),登录一律走
// 统一的「邮箱/手机号或密码错误」,不再单独提供存在性查询。

// ============================================================================
// 发送验证码
// ============================================================================

export function useSendEmailCode() {
  return useMutation({
    mutationFn: async (input: { email: string; purpose: CodePurpose }) => {
      try {
        await http.post('/user/send-code', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

export function useSendPhoneCode() {
  return useMutation({
    mutationFn: async (input: { phone: string; purpose: CodePurpose }) => {
      try {
        await http.post('/user/send-phone-code', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// 登录
// ============================================================================

export function useLoginEmailPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string; turnstile_token?: string }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>('/user/login', input);
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

export function useLoginPhonePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { phone: string; password: string }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/login-phone',
          input
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

export function useLoginEmailCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; code: string; turnstile_token?: string }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/login-with-code',
          input
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

export function useLoginPhoneCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { phone: string; code: string; turnstile_token?: string }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/login-phone-with-code',
          input
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

// ============================================================================
// 注册
// ============================================================================

export function useRegisterEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      code: string;
      turnstile_token?: string;
    }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/register',
          input
        );
        return { ...data.data, is_new_user: data.data.is_new_user ?? true };
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

export function useRegisterPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      phone: string;
      password: string;
      code: string;
      turnstile_token?: string;
    }) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/register-phone',
          input
        );
        return { ...data.data, is_new_user: data.data.is_new_user ?? true };
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

// ============================================================================
// 找回密码
// ============================================================================

export function useResetPasswordEmail() {
  return useMutation({
    mutationFn: async (input: { email: string; code: string; new_password: string }) => {
      try {
        await http.post('/user/reset-password', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => toast.success('密码已重置,请使用新密码登录'),
  });
}

export function useResetPasswordPhone() {
  return useMutation({
    mutationFn: async (input: { phone: string; code: string; new_password: string }) => {
      try {
        await http.post('/user/reset-password-phone', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => toast.success('密码已重置,请使用新密码登录'),
  });
}

// ============================================================================
// 登出
// ============================================================================

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await http.post('/user/logout');
      } catch (err) {
        // 服务端登出失败也要清本地,避免卡在"已登录"假象
        throw toApiError(err);
      }
    },
    onSettled: () => {
      useAuthStore.getState().clear();
      qc.clear();
    },
  });
}

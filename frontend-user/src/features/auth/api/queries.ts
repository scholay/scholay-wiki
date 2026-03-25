import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from './authApi';

export const authKeys = {
  profile: ['auth', 'profile'] as const,
  tokenInfo: ['auth', 'tokenInfo'] as const,
  taskHistory: (days?: number) => ['auth', 'taskHistory', days] as const,
};

export const useProfile = () =>
  useQuery({
    queryKey: authKeys.profile,
    queryFn: () => authApi.getProfile().then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

export const useTokenInfo = () =>
  useQuery({
    queryKey: authKeys.tokenInfo,
    queryFn: () => authApi.getTokenInfo().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useTaskHistory = (days: number = 3, limitPerDay: number = 20) =>
  useQuery({
    queryKey: authKeys.taskHistory(days),
    queryFn: () =>
      authApi.getTaskHistory(days, limitPerDay).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useLogin = () =>
  useMutation({
    mutationFn: (params: {
      email: string;
      password: string;
      turnstile_token?: string;
    }) => authApi.login(params.email, params.password, params.turnstile_token),
  });

export const useLoginPhone = () =>
  useMutation({
    mutationFn: (params: { phone: string; password: string }) =>
      authApi.loginPhone(params.phone, params.password),
  });

export const useLoginPhoneWithCode = () =>
  useMutation({
    mutationFn: (params: {
      phone: string;
      code: string;
      turnstile_token?: string;
    }) =>
      authApi.loginPhoneWithCode(
        params.phone,
        params.code,
        params.turnstile_token
      ),
  });

export const useRegister = () =>
  useMutation({
    mutationFn: (params: {
      email: string;
      password: string;
      code: string;
    }) => authApi.register(params.email, params.password, params.code),
  });

export const useRegisterPhone = () =>
  useMutation({
    mutationFn: (params: {
      phone: string;
      password: string;
      code: string;
    }) => authApi.registerPhone(params.phone, params.password, params.code),
  });

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => qc.clear(),
  });
};

export const useSendVerificationCode = () =>
  useMutation({
    mutationFn: (params: { email: string; purpose: string }) =>
      authApi.sendVerificationCode(params.email, params.purpose),
  });

export const useSendPhoneCode = () =>
  useMutation({
    mutationFn: (params: { phone: string; purpose: string }) =>
      authApi.sendPhoneCode(params.phone, params.purpose),
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (params: {
      email: string;
      code: string;
      new_password: string;
    }) =>
      authApi.resetPassword(params.email, params.code, params.new_password),
  });

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { username: string; avatarURL: string }) =>
      authApi.updateProfile(params.username, params.avatarURL),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: authKeys.profile }),
  });
};

export const useGithubCallback = () =>
  useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      authApi.githubCallback(params.code, params.state),
  });

export const useWeChatCallback = () =>
  useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      authApi.wechatCallback(params.code, params.state),
  });

export const useCheckEmail = () =>
  useMutation({
    mutationFn: (email: string) => authApi.checkEmail(email),
  });

export const useCheckPhone = () =>
  useMutation({
    mutationFn: (phone: string) => authApi.checkPhone(phone),
  });

export const useResetPasswordPhone = () =>
  useMutation({
    mutationFn: (params: { phone: string; code: string; new_password: string }) =>
      authApi.resetPasswordPhone(params.phone, params.code, params.new_password),
  });

export const useLoginWithUsername = () =>
  useMutation({
    mutationFn: (params: { username: string; password: string }) =>
      authApi.loginWithUsername(params.username, params.password),
  });

export const useGetWeChatLoginURL = () =>
  useQuery({
    queryKey: ['auth', 'wechatLoginURL'] as const,
    queryFn: () => authApi.getWeChatLoginURL().then((r) => r.data),
    enabled: false,
  });

export const useGetWeChatQRCodeConfig = () =>
  useQuery({
    queryKey: ['auth', 'wechatQRCodeConfig'] as const,
    queryFn: () => authApi.getWeChatQRCodeConfig().then((r) => r.data),
    enabled: false,
  });

export const useBindWeChatAccount = () =>
  useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      authApi.bindWeChatAccount(params.code, params.state),
  });

export const useGetGithubLoginURL = () =>
  useQuery({
    queryKey: ['auth', 'githubLoginURL'] as const,
    queryFn: () => authApi.getGithubLoginURL().then((r) => r.data),
    enabled: false,
  });

export const useBindGitHubAccount = () =>
  useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      authApi.bindGitHubAccount(params.code, params.state),
  });

export const useBindEmailWithPassword = () =>
  useMutation({
    mutationFn: (params: { email: string; password: string; code: string }) =>
      authApi.bindEmailWithPassword(params.email, params.password, params.code),
  });

export const useBindPhoneWithPassword = () =>
  useMutation({
    mutationFn: (params: { phone: string; password: string; code: string }) =>
      authApi.bindPhoneWithPassword(params.phone, params.password, params.code),
  });

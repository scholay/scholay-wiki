import { httpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';
import type { User } from 'shared/types/user';

export const authApi = {
  sendVerificationCode: (email: string, purpose: string) =>
    httpClient.post<ApiResponse>('/user/send-code', { email, purpose }),
  checkEmail: (email: string) =>
    httpClient.post<ApiResponse>('/user/check-email', { email }),
  checkPhone: (phone: string) =>
    httpClient.post<ApiResponse>('/user/check-phone', { phone }),
  sendPhoneCode: (phone: string, purpose: string) =>
    httpClient.post<ApiResponse>('/user/send-phone-code', { phone, purpose }),
  resetPassword: (email: string, code: string, new_password: string) =>
    httpClient.post<ApiResponse>('/user/reset-password', { email, code, new_password }),
  resetPasswordPhone: (phone: string, code: string, new_password: string) =>
    httpClient.post<ApiResponse>('/user/reset-password-phone', { phone, code, new_password }),
  register: (email: string, password: string, code: string) =>
    httpClient.post<ApiResponse>('/user/register', { email, password, code }),
  login: (email: string, password: string, turnstile_token?: string) =>
    httpClient.post<ApiResponse>('/user/login', { email, password, turnstile_token }),
  loginWithUsername: (username: string, password: string) =>
    httpClient.post<ApiResponse>('/user/login', { username, password }),
  loginPhone: (phone: string, password: string) =>
    httpClient.post<ApiResponse>('/user/login-phone', { phone, password }),
  loginPhoneWithCode: (phone: string, code: string, turnstile_token?: string) =>
    httpClient.post<ApiResponse>('/user/login-phone-with-code', { phone, code, turnstile_token }),
  registerPhone: (phone: string, password: string, code: string) =>
    httpClient.post<ApiResponse>('/user/register-phone', { phone, password, code }),
  logout: () =>
    httpClient.post<ApiResponse>('/user/logout'),
  refreshToken: () =>
    httpClient.post<ApiResponse>('/user/refresh-token'),
  getTokenInfo: () =>
    httpClient.get<ApiResponse>('/user/token-info'),
  getProfile: () =>
    httpClient.get<ApiResponse<User>>('/user/profile'),
  updateProfile: (username: string, avatarURL: string) =>
    httpClient.put<ApiResponse>('/user/profile', { username, avatar_url: avatarURL }),

  // OAuth
  getWeChatLoginURL: () => httpClient.get<ApiResponse>('/user/wechat/login-url'),
  getWeChatQRCodeConfig: () => httpClient.get<ApiResponse>('/user/wechat/qrcode-config'),
  wechatCallback: (code: string, state: string) =>
    httpClient.post<ApiResponse>('/user/wechat/callback', { code, state }),
  bindWeChatAccount: (code: string, state: string) =>
    httpClient.post<ApiResponse>('/user/bind-wechat', { code, state }),
  getGithubLoginURL: () => httpClient.get<ApiResponse>('/user/github/login-url'),
  githubCallback: (code: string, state: string) =>
    httpClient.get<ApiResponse>(`/user/github/callback?code=${code}&state=${state}`),
  bindGitHubAccount: (code: string, state: string) =>
    httpClient.post<ApiResponse>('/user/bind-github', { code, state }),
  bindEmailWithPassword: (email: string, password: string, code: string) =>
    httpClient.post<ApiResponse>('/user/bind-email-with-password', { email, password, code }),
  bindPhoneWithPassword: (phone: string, password: string, code: string) =>
    httpClient.post<ApiResponse>('/user/bind-phone-with-password', { phone, password, code }),
  getTaskHistory: (days: number = 3, limitPerDay: number = 20) =>
    httpClient.get<ApiResponse>('/user/task-history', { params: { days, limit_per_day: limitPerDay } }),
};

/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * Admin API module – reuses the unified Axios client from services/client.ts
 * so that token refresh, 401/403 handling, and base URL are consistent.
 */

import api from '../../services/client';
import type { AxiosResponse } from 'axios';

// `any` usage documented:
//   - AnyConfig: provider-specific config payloads (Email/SMS/OAuth/etc.) have
//     heterogeneous shapes that haven't been formalised yet.
//   - ListParams: open-ended filter objects for list endpoints.
//   - ApiResp default body type unknown; refine at call sites where needed.
type AnyConfig = Record<string, any>; // [any#1]
type ListParams = Record<string, any>; // [any#2]
type ApiResp<T = any> = Promise<AxiosResponse<T>>; // [any#3]

export const adminAPI = {
  login: (username: string, password: string): ApiResp =>
    api.post('/admin/login', { username, password }),

  getProfile: (): ApiResp => api.get('/admin/profile'),

  getDashboardStatistics: (): ApiResp => api.get('/admin/dashboard/statistics'),

  updatePassword: (oldPassword: string, newPassword: string): ApiResp =>
    api.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),

  verifyPassword: (password: string): ApiResp =>
    api.post('/admin/verify-password', { password }),

  updatePrivacyPolicy: (content: string, version: string): ApiResp =>
    api.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content: string, version: string): ApiResp =>
    api.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: (showPassword = false): ApiResp =>
    api.get('/admin/email-config', {
      params: showPassword ? { show_password: 'true' } : {},
    }),

  updateEmailConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/email-config', config),

  testEmailConfig: (config: AnyConfig): ApiResp =>
    api.post('/admin/email-config/test', config),

  getSMSConfig: (showSecret = false): ApiResp =>
    api.get('/admin/sms-config', {
      params: showSecret ? { show_secret: 'true' } : {},
    }),

  updateSMSConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/sms-config', config),

  testSMSConfig: (config: AnyConfig): ApiResp =>
    api.post('/admin/sms-config/test', config),

  getSystemConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/system-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateSystemConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/system-config', config),

  getGithubConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/github-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateGithubConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/github-config', config),

  getGoogleConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/google-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateGoogleConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/google-config', config),

  getAppleConfig: (): ApiResp => api.get('/admin/apple-config'),

  updateAppleConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/apple-config', config),

  getOrcidConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/orcid-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateOrcidConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/orcid-config', config),

  getMicrosoftConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/microsoft-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateMicrosoftConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/microsoft-config', config),

  getDiscourseConfig: (showSensitive = false): ApiResp =>
    api.get('/admin/discourse-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateDiscourseConfig: (config: AnyConfig): ApiResp =>
    api.put('/admin/discourse-config', config),

  getUserStatistics: (): ApiResp => api.get('/admin/users/stats'),

  getUserList: (
    page: number = 1,
    pageSize: number = 20,
    sortBy: string = 'last_login_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): ApiResp =>
    api.get('/admin/users', {
      params: { page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder },
    }),

  getOnlineUsers: (): ApiResp => api.get('/admin/users/online'),

  getUserDetail: (userId: number | string): ApiResp =>
    api.get(`/admin/users/${userId}`),

  getUserStatisticsChart: (params: ListParams = {}): ApiResp =>
    api.get('/admin/statistics/users', { params }),

  getOnlineUserChart: (params: ListParams = {}): ApiResp =>
    api.get('/admin/statistics/online', { params }),

  deleteUser: (userId: number | string): ApiResp =>
    api.delete(`/admin/users/${userId}`),

  getThirdPartyAccounts: (type: string = '', activeOnly: boolean = false): ApiResp =>
    api.get('/admin/third-party-accounts', { params: { type, active: activeOnly } }),

  getThirdPartyAccount: (id: number | string): ApiResp =>
    api.get(`/admin/third-party-accounts/${id}`),

  createThirdPartyAccount: (data: AnyConfig): ApiResp =>
    api.post('/admin/third-party-accounts', data),

  updateThirdPartyAccount: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/third-party-accounts/${id}`, data),

  deleteThirdPartyAccount: (id: number | string): ApiResp =>
    api.delete(`/admin/third-party-accounts/${id}`),

  getThirdPartyAccountStats: (): ApiResp =>
    api.get('/admin/third-party-accounts/stats'),

  testThirdPartyAccount: (id: number | string): ApiResp =>
    api.post(`/admin/third-party-accounts/${id}/test`),

  refreshThirdPartyAccountCache: (): ApiResp =>
    api.post('/admin/third-party-accounts/refresh-cache'),

  resetThirdPartyAccountStats: (id: number | string): ApiResp =>
    api.post(`/admin/third-party-accounts/${id}/reset-stats`),

  getPromptTemplates: (): ApiResp => api.get('/admin/prompt-templates'),

  getPromptTemplate: (id: number | string): ApiResp =>
    api.get(`/admin/prompt-templates/${id}`),

  createPromptTemplate: (data: AnyConfig): ApiResp =>
    api.post('/admin/prompt-templates', data),

  updatePromptTemplate: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/prompt-templates/${id}`, data),

  deletePromptTemplate: (id: number | string): ApiResp =>
    api.delete(`/admin/prompt-templates/${id}`),

  getAlipayConfigs: (showKeys: boolean = false): ApiResp =>
    api.get('/admin/payment/alipay/configs', {
      params: showKeys ? { show_keys: 'true' } : {},
    }),

  getAlipayConfig: (): ApiResp => api.get('/admin/payment/alipay/config'),

  createAlipayConfig: (data: AnyConfig): ApiResp =>
    api.post('/admin/payment/alipay/config', data),

  updateAlipayConfig: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/payment/alipay/config/${id}`, data),

  deleteAlipayConfig: (id: number | string): ApiResp =>
    api.delete(`/admin/payment/alipay/config/${id}`),

  activateAlipayConfig: (id: number | string): ApiResp =>
    api.post(`/admin/payment/alipay/config/${id}/activate`),

  getWeChatPayConfigs: (showKeys: boolean = false): ApiResp =>
    api.get('/admin/payment/wechat/configs', {
      params: showKeys ? { show_keys: 'true' } : {},
    }),

  getWeChatPayConfig: (): ApiResp => api.get('/admin/payment/wechat/config'),

  createWeChatPayConfig: (data: AnyConfig): ApiResp =>
    api.post('/admin/payment/wechat/config', data),

  updateWeChatPayConfig: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/payment/wechat/config/${id}`, data),

  deleteWeChatPayConfig: (id: number | string): ApiResp =>
    api.delete(`/admin/payment/wechat/config/${id}`),

  activateWeChatPayConfig: (id: number | string): ApiResp =>
    api.post(`/admin/payment/wechat/config/${id}/activate`),

  getWeChatConfigs: (showSecret: boolean = false): ApiResp =>
    api.get('/admin/wechat/configs', {
      params: showSecret ? { show_secret: 'true' } : {},
    }),

  getWeChatConfig: (): ApiResp => api.get('/admin/wechat/config'),

  createWeChatConfig: (data: AnyConfig): ApiResp =>
    api.post('/admin/wechat/config', data),

  updateWeChatConfig: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/wechat/config/${id}`, data),

  deleteWeChatConfig: (id: number | string): ApiResp =>
    api.delete(`/admin/wechat/config/${id}`),

  activateWeChatConfig: (id: number | string): ApiResp =>
    api.post(`/admin/wechat/config/${id}/activate`),

  getWeChatOfficialConfig: (showSensitive: boolean = false): ApiResp =>
    api.get('/admin/wechat-official/config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateWeChatOfficialConfig: (data: AnyConfig): ApiResp =>
    api.put('/admin/wechat-official/config', data),

  getAnalysisDimensions: (): ApiResp => api.get('/admin/analysis/dimensions'),

  updateAnalysisDimension: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/analysis/dimensions/${id}`, data),

  getFeedbacks: (params: ListParams = {}): ApiResp => {
    const queryParams: ListParams = {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    };
    if (params.status) queryParams.status = params.status;
    if (params.email) queryParams.email = params.email;
    if (params.keyword) queryParams.keyword = params.keyword;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;
    return api.get('/admin/feedbacks', { params: queryParams });
  },

  getFeedback: (id: number | string): ApiResp =>
    api.get(`/admin/feedbacks/${id}`),

  getFeedbackStats: (): ApiResp => api.get('/admin/feedbacks/stats'),

  updateFeedbackStatus: (id: number | string, status: string): ApiResp =>
    api.put(`/admin/feedbacks/${id}/status`, { status }),

  replyFeedback: (id: number | string, replyContent: string): ApiResp =>
    api.post(`/admin/feedbacks/${id}/reply`, { replyContent }),

  deleteFeedback: (id: number | string): ApiResp =>
    api.delete(`/admin/feedbacks/${id}`),

  getMessages: (params: ListParams = {}): ApiResp => {
    const queryParams: ListParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.status) queryParams.status = params.status;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/messages', { params: queryParams });
  },

  getMessage: (id: number | string): ApiResp =>
    api.get(`/admin/messages/${id}`),

  createMessage: (data: AnyConfig): ApiResp =>
    api.post('/admin/messages', data),

  sendMessage: (id: number | string): ApiResp =>
    api.post(`/admin/messages/${id}/send`),

  getMessageStats: (): ApiResp => api.get('/admin/messages/stats'),

  getMessageTemplates: (params: ListParams = {}): ApiResp => {
    const queryParams: ListParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isActive !== undefined) queryParams.is_active = params.isActive;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/message-templates', { params: queryParams });
  },

  getMessageTemplate: (id: number | string): ApiResp =>
    api.get(`/admin/message-templates/${id}`),

  createMessageTemplate: (data: AnyConfig): ApiResp =>
    api.post('/admin/message-templates', data),

  updateMessageTemplate: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/message-templates/${id}`, data),

  deleteMessageTemplate: (id: number | string): ApiResp =>
    api.delete(`/admin/message-templates/${id}`),

  getCodeSnippets: (category: string = ''): ApiResp =>
    api.get('/admin/code-snippets', { params: category ? { category } : {} }),

  getCodeSnippet: (id: number | string): ApiResp =>
    api.get(`/admin/code-snippets/${id}`),

  createCodeSnippet: (data: AnyConfig): ApiResp =>
    api.post('/admin/code-snippets', data),

  updateCodeSnippet: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/code-snippets/${id}`, data),

  deleteCodeSnippet: (id: number | string): ApiResp =>
    api.delete(`/admin/code-snippets/${id}`),

  getLatexAgentConfig: (): ApiResp => api.get('/admin/latex-agent/config'),

  updateLatexAgentConfig: (data: AnyConfig): ApiResp =>
    api.put('/admin/latex-agent/config', data),

  getLatexAgentModelPresets: (): ApiResp =>
    api.get('/admin/latex-agent/model-presets'),

  getLatexAgentConfigOptions: (): ApiResp =>
    api.get('/admin/latex-agent/config-options'),

  applyLatexAgentModelPreset: (provider: string, name: string): ApiResp =>
    api.post('/admin/latex-agent/apply-preset', { provider, name }),

  testLatexAgentConnection: (): ApiResp =>
    api.post('/admin/latex-agent/test-connection'),

  getLatexAgentApiFormats: (): ApiResp =>
    api.get('/admin/latex-agent/api-formats'),

  getLatexAgentModels: (): ApiResp => api.get('/admin/latex-agent/models'),

  createLatexAgentModel: (data: AnyConfig): ApiResp =>
    api.post('/admin/latex-agent/models', data),

  updateLatexAgentModel: (id: number | string, data: AnyConfig): ApiResp =>
    api.put(`/admin/latex-agent/models/${id}`, data),

  deleteLatexAgentModel: (id: number | string): ApiResp =>
    api.delete(`/admin/latex-agent/models/${id}`),

  setDefaultLatexAgentModel: (id: number | string): ApiResp =>
    api.post(`/admin/latex-agent/models/${id}/set-default`),
};

export default api;

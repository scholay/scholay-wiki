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

export const adminAPI = {
  login: (username, password) =>
    api.post('/admin/login', { username, password }),

  getProfile: () =>
    api.get('/admin/profile'),

  getDashboardStatistics: () =>
    api.get('/admin/dashboard/statistics'),

  updatePassword: (oldPassword, newPassword) =>
    api.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),

  verifyPassword: (password) =>
    api.post('/admin/verify-password', { password }),

  updatePrivacyPolicy: (content, version) =>
    api.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content, version) =>
    api.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: (showPassword = false) =>
    api.get('/admin/email-config', {
      params: showPassword ? { show_password: 'true' } : {}
    }),

  updateEmailConfig: (config) =>
    api.put('/admin/email-config', config),

  testEmailConfig: (config) =>
    api.post('/admin/email-config/test', config),

  getSMSConfig: (showSecret = false) =>
    api.get('/admin/sms-config', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  updateSMSConfig: (config) =>
    api.put('/admin/sms-config', config),

  testSMSConfig: (config) =>
    api.post('/admin/sms-config/test', config),

  getSystemConfig: (showSensitive = false) =>
    api.get('/admin/system-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateSystemConfig: (config) =>
    api.put('/admin/system-config', config),

  getGithubConfig: (showSensitive = false) =>
    api.get('/admin/github-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateGithubConfig: (config) =>
    api.put('/admin/github-config', config),

  getGoogleConfig: (showSensitive = false) =>
    api.get('/admin/google-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateGoogleConfig: (config) =>
    api.put('/admin/google-config', config),

  getAppleConfig: () =>
    api.get('/admin/apple-config'),

  updateAppleConfig: (config) =>
    api.put('/admin/apple-config', config),

  getOrcidConfig: (showSensitive = false) =>
    api.get('/admin/orcid-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateOrcidConfig: (config) =>
    api.put('/admin/orcid-config', config),

  getMicrosoftConfig: (showSensitive = false) =>
    api.get('/admin/microsoft-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateMicrosoftConfig: (config) =>
    api.put('/admin/microsoft-config', config),

  getDiscourseConfig: (showSensitive = false) =>
    api.get('/admin/discourse-config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateDiscourseConfig: (config) =>
    api.put('/admin/discourse-config', config),

  getUserStatistics: () =>
    api.get('/admin/users/stats'),

  getUserList: (page = 1, pageSize = 20, sortBy = 'last_login_at', sortOrder = 'desc') =>
    api.get('/admin/users', { params: { page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder } }),

  getOnlineUsers: () =>
    api.get('/admin/users/online'),

  getUserDetail: (userId) =>
    api.get(`/admin/users/${userId}`),

  getUserStatisticsChart: (params = {}) =>
    api.get('/admin/statistics/users', { params }),

  getOnlineUserChart: (params = {}) =>
    api.get('/admin/statistics/online', { params }),

  deleteUser: (userId) =>
    api.delete(`/admin/users/${userId}`),

  getThirdPartyAccounts: (type = '', activeOnly = false) =>
    api.get('/admin/third-party-accounts', { params: { type, active: activeOnly } }),

  getThirdPartyAccount: (id) =>
    api.get(`/admin/third-party-accounts/${id}`),

  createThirdPartyAccount: (data) =>
    api.post('/admin/third-party-accounts', data),

  updateThirdPartyAccount: (id, data) =>
    api.put(`/admin/third-party-accounts/${id}`, data),

  deleteThirdPartyAccount: (id) =>
    api.delete(`/admin/third-party-accounts/${id}`),

  getThirdPartyAccountStats: () =>
    api.get('/admin/third-party-accounts/stats'),

  testThirdPartyAccount: (id) =>
    api.post(`/admin/third-party-accounts/${id}/test`),

  refreshThirdPartyAccountCache: () =>
    api.post('/admin/third-party-accounts/refresh-cache'),

  resetThirdPartyAccountStats: (id) =>
    api.post(`/admin/third-party-accounts/${id}/reset-stats`),

  getPromptTemplates: () =>
    api.get('/admin/prompt-templates'),

  getPromptTemplate: (id) =>
    api.get(`/admin/prompt-templates/${id}`),

  createPromptTemplate: (data) =>
    api.post('/admin/prompt-templates', data),

  updatePromptTemplate: (id, data) =>
    api.put(`/admin/prompt-templates/${id}`, data),

  deletePromptTemplate: (id) =>
    api.delete(`/admin/prompt-templates/${id}`),

  getAlipayConfigs: (showKeys = false) =>
    api.get('/admin/payment/alipay/configs', {
      params: showKeys ? { show_keys: 'true' } : {}
    }),

  getAlipayConfig: () =>
    api.get('/admin/payment/alipay/config'),

  createAlipayConfig: (data) =>
    api.post('/admin/payment/alipay/config', data),

  updateAlipayConfig: (id, data) =>
    api.put(`/admin/payment/alipay/config/${id}`, data),

  deleteAlipayConfig: (id) =>
    api.delete(`/admin/payment/alipay/config/${id}`),

  activateAlipayConfig: (id) =>
    api.post(`/admin/payment/alipay/config/${id}/activate`),

  getWeChatPayConfigs: (showKeys = false) =>
    api.get('/admin/payment/wechat/configs', {
      params: showKeys ? { show_keys: 'true' } : {}
    }),

  getWeChatPayConfig: () =>
    api.get('/admin/payment/wechat/config'),

  createWeChatPayConfig: (data) =>
    api.post('/admin/payment/wechat/config', data),

  updateWeChatPayConfig: (id, data) =>
    api.put(`/admin/payment/wechat/config/${id}`, data),

  deleteWeChatPayConfig: (id) =>
    api.delete(`/admin/payment/wechat/config/${id}`),

  activateWeChatPayConfig: (id) =>
    api.post(`/admin/payment/wechat/config/${id}/activate`),

  getWeChatConfigs: (showSecret = false) =>
    api.get('/admin/wechat/configs', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  getWeChatConfig: () =>
    api.get('/admin/wechat/config'),

  createWeChatConfig: (data) =>
    api.post('/admin/wechat/config', data),

  updateWeChatConfig: (id, data) =>
    api.put(`/admin/wechat/config/${id}`, data),

  deleteWeChatConfig: (id) =>
    api.delete(`/admin/wechat/config/${id}`),

  activateWeChatConfig: (id) =>
    api.post(`/admin/wechat/config/${id}/activate`),

  getWeChatOfficialConfig: (showSensitive = false) =>
    api.get('/admin/wechat-official/config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateWeChatOfficialConfig: (data) =>
    api.put('/admin/wechat-official/config', data),

  getAnalysisDimensions: () =>
    api.get('/admin/analysis/dimensions'),

  updateAnalysisDimension: (id, data) =>
    api.put(`/admin/analysis/dimensions/${id}`, data),

  getFeedbacks: (params = {}) => {
    const queryParams = {
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

  getFeedback: (id) =>
    api.get(`/admin/feedbacks/${id}`),

  getFeedbackStats: () =>
    api.get('/admin/feedbacks/stats'),

  updateFeedbackStatus: (id, status) =>
    api.put(`/admin/feedbacks/${id}/status`, { status }),

  replyFeedback: (id, replyContent) =>
    api.post(`/admin/feedbacks/${id}/reply`, { replyContent }),

  deleteFeedback: (id) =>
    api.delete(`/admin/feedbacks/${id}`),

  getMessages: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.status) queryParams.status = params.status;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/messages', { params: queryParams });
  },

  getMessage: (id) =>
    api.get(`/admin/messages/${id}`),

  createMessage: (data) =>
    api.post('/admin/messages', data),

  sendMessage: (id) =>
    api.post(`/admin/messages/${id}/send`),

  getMessageStats: () =>
    api.get('/admin/messages/stats'),

  getMessageTemplates: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isActive !== undefined) queryParams.is_active = params.isActive;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/message-templates', { params: queryParams });
  },

  getMessageTemplate: (id) =>
    api.get(`/admin/message-templates/${id}`),

  createMessageTemplate: (data) =>
    api.post('/admin/message-templates', data),

  updateMessageTemplate: (id, data) =>
    api.put(`/admin/message-templates/${id}`, data),

  deleteMessageTemplate: (id) =>
    api.delete(`/admin/message-templates/${id}`),

  getCodeSnippets: (category = '') =>
    api.get('/admin/code-snippets', { params: category ? { category } : {} }),

  getCodeSnippet: (id) =>
    api.get(`/admin/code-snippets/${id}`),

  createCodeSnippet: (data) =>
    api.post('/admin/code-snippets', data),

  updateCodeSnippet: (id, data) =>
    api.put(`/admin/code-snippets/${id}`, data),

  deleteCodeSnippet: (id) =>
    api.delete(`/admin/code-snippets/${id}`),

  getLatexAgentConfig: () =>
    api.get('/admin/latex-agent/config'),

  updateLatexAgentConfig: (data) =>
    api.put('/admin/latex-agent/config', data),

  getLatexAgentModelPresets: () =>
    api.get('/admin/latex-agent/model-presets'),

  getLatexAgentConfigOptions: () =>
    api.get('/admin/latex-agent/config-options'),

  applyLatexAgentModelPreset: (provider, name) =>
    api.post('/admin/latex-agent/apply-preset', { provider, name }),

  testLatexAgentConnection: () =>
    api.post('/admin/latex-agent/test-connection'),

  getLatexAgentApiFormats: () =>
    api.get('/admin/latex-agent/api-formats'),

  getLatexAgentModels: () =>
    api.get('/admin/latex-agent/models'),

  createLatexAgentModel: (data) =>
    api.post('/admin/latex-agent/models', data),

  updateLatexAgentModel: (id, data) =>
    api.put(`/admin/latex-agent/models/${id}`, data),

  deleteLatexAgentModel: (id) =>
    api.delete(`/admin/latex-agent/models/${id}`),

  setDefaultLatexAgentModel: (id) =>
    api.post(`/admin/latex-agent/models/${id}/set-default`),
};

export default api;

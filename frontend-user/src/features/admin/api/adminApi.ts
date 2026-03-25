/**
 * Admin API — 管理后台接口
 *
 * 使用 adminHttpClient（共享 token 刷新队列），
 * 同时保持向后兼容的 adminAPI 对象导出。
 */

import { adminHttpClient } from '../../../shared/api';

export const adminAPI = {
  login: (username: string, password: string) =>
    adminHttpClient.post('/admin/login', { username, password }),

  getProfile: () => adminHttpClient.get('/admin/profile'),

  getDashboardStatistics: () =>
    adminHttpClient.get('/admin/dashboard/statistics'),

  updatePassword: (oldPassword: string, newPassword: string) =>
    adminHttpClient.put('/admin/password', {
      old_password: oldPassword,
      new_password: newPassword,
    }),

  verifyPassword: (password: string) =>
    adminHttpClient.post('/admin/verify-password', { password }),

  updatePrivacyPolicy: (content: string, version: string) =>
    adminHttpClient.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content: string, version: string) =>
    adminHttpClient.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: (showPassword = false) =>
    adminHttpClient.get('/admin/email-config', {
      params: showPassword ? { show_password: 'true' } : {},
    }),

  updateEmailConfig: (config: any) =>
    adminHttpClient.put('/admin/email-config', config),

  testEmailConfig: (config: any) =>
    adminHttpClient.post('/admin/email-config/test', config),

  getSMSConfig: (showSecret = false) =>
    adminHttpClient.get('/admin/sms-config', {
      params: showSecret ? { show_secret: 'true' } : {},
    }),

  updateSMSConfig: (config: any) =>
    adminHttpClient.put('/admin/sms-config', config),

  testSMSConfig: (config: any) =>
    adminHttpClient.post('/admin/sms-config/test', config),

  updateSystemConfig: (config: any) =>
    adminHttpClient.put('/admin/system-config', config),

  getGithubConfig: () => adminHttpClient.get('/admin/github-config'),

  updateGithubConfig: (config: any) =>
    adminHttpClient.put('/admin/github-config', config),

  getUserStatistics: () => adminHttpClient.get('/admin/users/stats'),

  getUserList: (
    page = 1,
    pageSize = 20,
    sortBy = 'last_login_at',
    sortOrder = 'desc'
  ) =>
    adminHttpClient.get('/admin/users', {
      params: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      },
    }),

  getOnlineUsers: () => adminHttpClient.get('/admin/users/online'),

  getUserDetail: (userId: string | number) =>
    adminHttpClient.get(`/admin/users/${userId}`),

  getUserStatisticsChart: (params: Record<string, any> = {}) =>
    adminHttpClient.get('/admin/statistics/users', { params }),

  getOnlineUserChart: (params: Record<string, any> = {}) =>
    adminHttpClient.get('/admin/statistics/online', { params }),

  deleteUser: (userId: string | number) =>
    adminHttpClient.delete(`/admin/users/${userId}`),

  getThirdPartyAccounts: (type = '', activeOnly = false) =>
    adminHttpClient.get('/admin/third-party-accounts', {
      params: { type, active: activeOnly },
    }),

  getThirdPartyAccount: (id: string | number) =>
    adminHttpClient.get(`/admin/third-party-accounts/${id}`),

  createThirdPartyAccount: (data: any) =>
    adminHttpClient.post('/admin/third-party-accounts', data),

  updateThirdPartyAccount: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/third-party-accounts/${id}`, data),

  deleteThirdPartyAccount: (id: string | number) =>
    adminHttpClient.delete(`/admin/third-party-accounts/${id}`),

  getThirdPartyAccountStats: () =>
    adminHttpClient.get('/admin/third-party-accounts/stats'),

  testThirdPartyAccount: (id: string | number) =>
    adminHttpClient.post(`/admin/third-party-accounts/${id}/test`),

  refreshThirdPartyAccountCache: () =>
    adminHttpClient.post('/admin/third-party-accounts/refresh-cache'),

  getPromptTemplates: () => adminHttpClient.get('/admin/prompt-templates'),

  getPromptTemplate: (id: string | number) =>
    adminHttpClient.get(`/admin/prompt-templates/${id}`),

  createPromptTemplate: (data: any) =>
    adminHttpClient.post('/admin/prompt-templates', data),

  updatePromptTemplate: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/prompt-templates/${id}`, data),

  deletePromptTemplate: (id: string | number) =>
    adminHttpClient.delete(`/admin/prompt-templates/${id}`),

  getWeChatConfigs: (showSecret = false) =>
    adminHttpClient.get('/admin/wechat/configs', {
      params: showSecret ? { show_secret: 'true' } : {},
    }),

  getWeChatConfig: () => adminHttpClient.get('/admin/wechat/config'),

  createWeChatConfig: (data: any) =>
    adminHttpClient.post('/admin/wechat/config', data),

  updateWeChatConfig: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/wechat/config/${id}`, data),

  deleteWeChatConfig: (id: string | number) =>
    adminHttpClient.delete(`/admin/wechat/config/${id}`),

  activateWeChatConfig: (id: string | number) =>
    adminHttpClient.post(`/admin/wechat/config/${id}/activate`),

  getWeChatOfficialConfig: (showSensitive = false) =>
    adminHttpClient.get('/admin/wechat-official/config', {
      params: showSensitive ? { show_sensitive: 'true' } : {},
    }),

  updateWeChatOfficialConfig: (data: any) =>
    adminHttpClient.put('/admin/wechat-official/config', data),

  getAnalysisDimensions: () =>
    adminHttpClient.get('/admin/analysis/dimensions'),

  updateAnalysisDimension: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/analysis/dimensions/${id}`, data),

  getFeedbacks: (params: Record<string, any> = {}) => {
    const queryParams: Record<string, any> = {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    };
    if (params.status) queryParams.status = params.status;
    if (params.email) queryParams.email = params.email;
    if (params.keyword) queryParams.keyword = params.keyword;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;
    return adminHttpClient.get('/admin/feedbacks', { params: queryParams });
  },

  getFeedback: (id: string | number) =>
    adminHttpClient.get(`/admin/feedbacks/${id}`),

  getFeedbackStats: () => adminHttpClient.get('/admin/feedbacks/stats'),

  updateFeedbackStatus: (id: string | number, status: string) =>
    adminHttpClient.put(`/admin/feedbacks/${id}/status`, { status }),

  replyFeedback: (id: string | number, replyContent: string) =>
    adminHttpClient.post(`/admin/feedbacks/${id}/reply`, { replyContent }),

  deleteFeedback: (id: string | number) =>
    adminHttpClient.delete(`/admin/feedbacks/${id}`),

  getMessages: (params: Record<string, any> = {}) => {
    const queryParams: Record<string, any> = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.status) queryParams.status = params.status;
    if (params.keyword) queryParams.keyword = params.keyword;
    return adminHttpClient.get('/admin/messages', { params: queryParams });
  },

  getMessage: (id: string | number) =>
    adminHttpClient.get(`/admin/messages/${id}`),

  createMessage: (data: any) =>
    adminHttpClient.post('/admin/messages', data),

  sendMessage: (id: string | number) =>
    adminHttpClient.post(`/admin/messages/${id}/send`),

  getMessageStats: () => adminHttpClient.get('/admin/messages/stats'),

  getMessageTemplates: (params: Record<string, any> = {}) => {
    const queryParams: Record<string, any> = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isActive !== undefined) queryParams.is_active = params.isActive;
    if (params.keyword) queryParams.keyword = params.keyword;
    return adminHttpClient.get('/admin/message-templates', {
      params: queryParams,
    });
  },

  getMessageTemplate: (id: string | number) =>
    adminHttpClient.get(`/admin/message-templates/${id}`),

  createMessageTemplate: (data: any) =>
    adminHttpClient.post('/admin/message-templates', data),

  updateMessageTemplate: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/message-templates/${id}`, data),

  deleteMessageTemplate: (id: string | number) =>
    adminHttpClient.delete(`/admin/message-templates/${id}`),

  getCodeSnippets: (category = '') =>
    adminHttpClient.get('/admin/code-snippets', {
      params: category ? { category } : {},
    }),

  getCodeSnippet: (id: string | number) =>
    adminHttpClient.get(`/admin/code-snippets/${id}`),

  createCodeSnippet: (data: any) =>
    adminHttpClient.post('/admin/code-snippets', data),

  updateCodeSnippet: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/code-snippets/${id}`, data),

  deleteCodeSnippet: (id: string | number) =>
    adminHttpClient.delete(`/admin/code-snippets/${id}`),

  getLatexAgentConfig: () => adminHttpClient.get('/admin/latex-agent/config'),

  updateLatexAgentConfig: (data: any) =>
    adminHttpClient.put('/admin/latex-agent/config', data),

  getLatexAgentModelPresets: () =>
    adminHttpClient.get('/admin/latex-agent/model-presets'),

  getLatexAgentConfigOptions: () =>
    adminHttpClient.get('/admin/latex-agent/config-options'),

  applyLatexAgentModelPreset: (provider: string, name: string) =>
    adminHttpClient.post('/admin/latex-agent/apply-preset', {
      provider,
      name,
    }),

  testLatexAgentConnection: () =>
    adminHttpClient.post('/admin/latex-agent/test-connection'),

  getLatexAgentApiFormats: () =>
    adminHttpClient.get('/admin/latex-agent/api-formats'),

  getLatexAgentModels: () => adminHttpClient.get('/admin/latex-agent/models'),

  createLatexAgentModel: (data: any) =>
    adminHttpClient.post('/admin/latex-agent/models', data),

  updateLatexAgentModel: (id: string | number, data: any) =>
    adminHttpClient.put(`/admin/latex-agent/models/${id}`, data),

  deleteLatexAgentModel: (id: string | number) =>
    adminHttpClient.delete(`/admin/latex-agent/models/${id}`),

  setDefaultLatexAgentModel: (id: string | number) =>
    adminHttpClient.post(`/admin/latex-agent/models/${id}/set-default`),
};

export default adminAPI;
